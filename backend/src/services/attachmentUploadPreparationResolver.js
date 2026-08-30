const { getKeyForDeviceAndDate, findDeviceIdByKeyValue } = require('./deviceKeyService');
const { resolveDeviceBindingByDeviceId } = require('./logUploadService');
const { extractTimeFromFileName } = require('../utils/logTimeExtractor');
const { validateMacAddress, normalizeMacAddress } = require('../utils/systemInfoParser');
const {
  normalizeName,
  resolveNextAction,
  buildSummaryMessage
} = require('./attachmentScanHelper');

function normalizeNullablePositiveInt(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
}

function normalizePreparedFiles(files = []) {
  return (Array.isArray(files) ? files : []).map((file) => ({
    sourceFilePath: normalizeName(file?.sourceFilePath),
    originalName: normalizeName(file?.originalName),
    attachmentAssetId: normalizeName(file?.attachmentAssetId) || null,
    deviceIdHint: normalizeName(file?.deviceIdHint).toUpperCase() || ''
  })).filter((file) => file.sourceFilePath && file.originalName);
}

async function resolveDeviceId({
  explicitDeviceId,
  explicitDecryptKey,
  fallbackResolvedDeviceId,
  deviceIdCandidates
}) {
  if (explicitDeviceId) return explicitDeviceId;
  const normalizedCandidates = Array.from(new Set(
    (Array.isArray(deviceIdCandidates) ? deviceIdCandidates : [])
      .map((candidate) => normalizeName(candidate).toUpperCase())
      .filter(Boolean)
  ));
  if (normalizedCandidates.length === 1) return normalizedCandidates[0];
  if (fallbackResolvedDeviceId) return fallbackResolvedDeviceId;
  if (explicitDecryptKey && validateMacAddress(explicitDecryptKey)) {
    const reverseDeviceId = await findDeviceIdByKeyValue(normalizeMacAddress(explicitDecryptKey));
    if (reverseDeviceId) return String(reverseDeviceId).toUpperCase();
  }
  return '';
}

function resolveUserProvidedKey({ explicitDecryptKey, detectedKeys, fallbackResolvedDecryptKey }) {
  if (explicitDecryptKey && validateMacAddress(explicitDecryptKey)) {
    return normalizeMacAddress(explicitDecryptKey);
  }
  const systemInfoKey = (Array.isArray(detectedKeys) ? detectedKeys : [])
    .map((item) => normalizeName(item?.value))
    .find((value) => value && validateMacAddress(value));
  if (systemInfoKey) return normalizeMacAddress(systemInfoKey);
  if (fallbackResolvedDecryptKey && validateMacAddress(fallbackResolvedDecryptKey)) {
    return normalizeMacAddress(fallbackResolvedDecryptKey);
  }
  return '';
}

function buildMissingFields({ logsFound, resolvedDeviceId, keyStatus, resolvedDeviceModelId, resolvedSeriesId }) {
  const missingFields = [];
  if (logsFound < 1) return missingFields;
  if (!resolvedDeviceId) {
    missingFields.push('deviceId');
    return missingFields;
  }
  if (keyStatus !== 'valid') {
    missingFields.push('decryptKey');
  }
  if (!Number.isInteger(Number(resolvedDeviceModelId)) || Number(resolvedDeviceModelId) <= 0) {
    missingFields.push('deviceModelId');
  }
  if (!Number.isInteger(Number(resolvedSeriesId)) || Number(resolvedSeriesId) <= 0) {
    missingFields.push('seriesId');
  }
  return Array.from(new Set(missingFields));
}

async function resolveAttachmentUploadPreparation(input = {}) {
  const preparedFiles = normalizePreparedFiles(input.files);
  const explicitDeviceId = normalizeName(input.explicitDeviceId).toUpperCase();
  const explicitDecryptKey = normalizeName(input.explicitDecryptKey);
  const fallbackResolvedDeviceId = normalizeName(input.fallbackResolvedDeviceId).toUpperCase();
  const fallbackResolvedDecryptKey = normalizeName(input.fallbackResolvedDecryptKey);
  const resolvedDeviceId = await resolveDeviceId({
    explicitDeviceId,
    explicitDecryptKey,
    fallbackResolvedDeviceId,
    deviceIdCandidates: input.deviceIdCandidates
  });
  const userProvidedKey = resolveUserProvidedKey({
    explicitDecryptKey,
    detectedKeys: input.detectedKeys,
    fallbackResolvedDecryptKey
  });

  const logsFound = preparedFiles.length;
  let logsReady = 0;
  let logsMissingKey = 0;
  let logsMissingDeviceId = 0;
  let resolvedDecryptKey = userProvidedKey || null;

  for (const file of preparedFiles) {
    const logDeviceId = explicitDeviceId || file.deviceIdHint || resolvedDeviceId || fallbackResolvedDeviceId || '';
    if (!logDeviceId) {
      logsMissingDeviceId += 1;
      continue;
    }

    let usableKey = userProvidedKey;
    if (!usableKey) {
      const logTime = extractTimeFromFileName(file.originalName) || new Date();
      usableKey = await getKeyForDeviceAndDate(logDeviceId, logTime);
    }

    if (!usableKey || !validateMacAddress(usableKey)) {
      logsMissingKey += 1;
      continue;
    }

    if (!resolvedDecryptKey) {
      resolvedDecryptKey = normalizeMacAddress(usableKey);
    }
    logsReady += 1;
  }

  let resolvedDecryptKeyStatus = 'missing';
  if (explicitDecryptKey && !validateMacAddress(explicitDecryptKey)) {
    resolvedDecryptKeyStatus = 'invalid';
  } else if (resolvedDecryptKey && validateMacAddress(resolvedDecryptKey)) {
    resolvedDecryptKeyStatus = 'valid';
  } else if (logsFound < 1) {
    resolvedDecryptKeyStatus = null;
  }

  let binding = {
    deviceModelId: normalizeNullablePositiveInt(input.explicitDeviceModelId ?? input.fallbackResolvedDeviceModelId),
    seriesId: normalizeNullablePositiveInt(input.explicitSeriesId ?? input.fallbackResolvedSeriesId)
  };

  if (resolvedDeviceId && (binding.deviceModelId == null || binding.seriesId == null)) {
    const resolvedBinding = await resolveDeviceBindingByDeviceId(resolvedDeviceId);
    binding = {
      deviceModelId: binding.deviceModelId ?? normalizeNullablePositiveInt(resolvedBinding?.deviceModelId),
      seriesId: binding.seriesId ?? normalizeNullablePositiveInt(resolvedBinding?.seriesId)
    };
  }

  const missingFields = buildMissingFields({
    logsFound,
    resolvedDeviceId,
    keyStatus: resolvedDecryptKeyStatus,
    resolvedDeviceModelId: binding.deviceModelId,
    resolvedSeriesId: binding.seriesId
  });
  const nextAction = resolveNextAction({
    logsFound,
    logsReady,
    logsMissingKey,
    logsMissingDeviceId,
    missingFields
  });

  return {
    summary: buildSummaryMessage({
      deviceId: resolvedDeviceId || null,
      keyStatus: resolvedDecryptKeyStatus,
      logsFound,
      nextAction
    }),
    nextAction,
    scanSummary: {
      logsFound,
      logsReady,
      logsMissingKey,
      logsMissingDeviceId
    },
    uploadPreparation: {
      canUpload: preparedFiles.length > 0 && missingFields.length === 0,
      resolvedDeviceId: resolvedDeviceId || null,
      resolvedDecryptKeyStatus,
      resolvedDecryptKey: resolvedDecryptKey || null,
      resolvedDeviceModelId: binding.deviceModelId ?? null,
      resolvedSeriesId: binding.seriesId ?? null,
      missingFields,
      files: preparedFiles.map((file) => ({
        sourceFilePath: file.sourceFilePath,
        originalName: file.originalName,
        attachmentAssetId: file.attachmentAssetId
      }))
    }
  };
}

module.exports = {
  resolveAttachmentUploadPreparation
};
