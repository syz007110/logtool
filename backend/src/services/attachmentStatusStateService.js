const { resolveAttachmentUploadPreparation } = require('./attachmentUploadPreparationResolver');

function normalizeName(value) {
  const text = String(value || '').trim();
  return text || '';
}

function parseToolResultContent(content) {
  const raw = String(content || '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

function buildToolNameByCallId(messages = []) {
  const map = new Map();
  for (const message of Array.isArray(messages) ? messages : []) {
    if (String(message?.role || '').trim() !== 'assistant') continue;
    const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
    for (const toolCall of toolCalls) {
      const id = normalizeName(toolCall?.id);
      const toolName = normalizeName(toolCall?.function?.name);
      if (id && toolName) {
        map.set(id, toolName);
      }
    }
  }
  return map;
}

function normalizePreparedFiles(files = []) {
  return (Array.isArray(files) ? files : [])
    .map((file) => ({
      sourceFilePath: normalizeName(file?.sourceFilePath),
      originalName: normalizeName(file?.originalName),
      attachmentAssetId: normalizeName(file?.attachmentAssetId) || null
    }))
    .filter((file) => file.sourceFilePath && file.originalName);
}

function attachmentStatusFromToolResult(toolResult = {}) {
  const data = toolResult?.data && typeof toolResult.data === 'object' ? toolResult.data : null;
  const attachmentStatusData = data?.attachmentStatus && typeof data.attachmentStatus === 'object'
    ? data.attachmentStatus
    : data;
  const uploadPreparation = attachmentStatusData?.uploadPreparation
    && typeof attachmentStatusData.uploadPreparation === 'object'
    ? attachmentStatusData.uploadPreparation
    : null;
  if (String(toolResult?.status || '').trim() !== 'success' || !data || !uploadPreparation) {
    return null;
  }
  return {
    summary: normalizeName(attachmentStatusData.summary || toolResult.text) || null,
    nextAction: normalizeName(attachmentStatusData.nextAction) || 'continue',
    scanSummary: null,
    uploadPreparation: {
      ...uploadPreparation,
      files: normalizePreparedFiles(uploadPreparation.files)
    }
  };
}

function buildAttachmentStatusSeed(status = null) {
  const uploadPreparation = status?.uploadPreparation && typeof status.uploadPreparation === 'object'
    ? status.uploadPreparation
    : {};
  return {
    files: normalizePreparedFiles(uploadPreparation.files),
    resolvedDeviceId: normalizeName(uploadPreparation.resolvedDeviceId) || '',
    resolvedDecryptKey: normalizeName(uploadPreparation.resolvedDecryptKey) || '',
    resolvedDeviceModelId: uploadPreparation.resolvedDeviceModelId ?? null,
    resolvedSeriesId: uploadPreparation.resolvedSeriesId ?? null
  };
}

function mergePreparedFiles(baseFiles = [], nextFiles = []) {
  const merged = new Map();
  for (const file of [...normalizePreparedFiles(baseFiles), ...normalizePreparedFiles(nextFiles)]) {
    const key = normalizeName(file.attachmentAssetId) || `${file.sourceFilePath}|${file.originalName}`;
    merged.set(key, file);
  }
  return Array.from(merged.values());
}

async function mergeAttachmentStatus(baseStatus = null, scannedStatus = null) {
  if (!baseStatus) return scannedStatus;
  if (!scannedStatus) return baseStatus;

  const baseSeed = buildAttachmentStatusSeed(baseStatus);
  const nextSeed = buildAttachmentStatusSeed(scannedStatus);
  const mergedFiles = mergePreparedFiles(baseSeed.files, nextSeed.files);
  const mergedDeviceId = nextSeed.resolvedDeviceId || baseSeed.resolvedDeviceId || '';
  const mergedDecryptKey = nextSeed.resolvedDecryptKey || baseSeed.resolvedDecryptKey || '';
  const mergedDeviceModelId = nextSeed.resolvedDeviceModelId ?? baseSeed.resolvedDeviceModelId ?? null;
  const mergedSeriesId = nextSeed.resolvedSeriesId ?? baseSeed.resolvedSeriesId ?? null;

  return resolveAttachmentUploadPreparation({
    files: mergedFiles,
    explicitDeviceId: mergedDeviceId || undefined,
    explicitDecryptKey: mergedDecryptKey || undefined,
    explicitDeviceModelId: mergedDeviceModelId,
    explicitSeriesId: mergedSeriesId,
    fallbackResolvedDeviceId: baseSeed.resolvedDeviceId || undefined,
    fallbackResolvedDecryptKey: baseSeed.resolvedDecryptKey || undefined,
    fallbackResolvedDeviceModelId: baseSeed.resolvedDeviceModelId,
    fallbackResolvedSeriesId: baseSeed.resolvedSeriesId,
    deviceIdCandidates: [baseSeed.resolvedDeviceId, nextSeed.resolvedDeviceId].filter(Boolean),
    detectedKeys: [baseSeed.resolvedDecryptKey, nextSeed.resolvedDecryptKey]
      .filter(Boolean)
      .map((value) => ({ value }))
  });
}

function resolveActiveAttachmentStatusFromHistoryMessages(messages = []) {
  const toolNameByCallId = buildToolNameByCallId(messages);
  let activeStatus = null;

  for (const message of Array.isArray(messages) ? messages : []) {
    if (String(message?.role || '').trim() !== 'tool') continue;
    const toolCallId = normalizeName(message?.tool_call_id);
    const toolName = toolNameByCallId.get(toolCallId);
    if (!toolName) continue;
    const toolResult = parseToolResultContent(message?.content);
    if (!toolResult) continue;

    if (toolName === 'attachment_scan') {
      const restored = attachmentStatusFromToolResult(toolResult);
      if (restored) activeStatus = restored;
      continue;
    }

    if (toolName === 'start_log_upload'
      && String(toolResult.status || '').trim() === 'success') {
      if (toolResult?.data?.uploaded === true) {
        activeStatus = null;
        continue;
      }
      const restored = attachmentStatusFromToolResult(toolResult);
      if (restored) activeStatus = restored;
    }
  }

  return activeStatus;
}

module.exports = {
  attachmentStatusFromToolResult,
  mergeAttachmentStatus,
  resolveActiveAttachmentStatusFromHistoryMessages
};
