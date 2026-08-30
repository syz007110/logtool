const { Op } = require('sequelize');
const Device = require('../../../models/device');
const DeviceModelDict = require('../../../models/device_model_dict');
const DeviceSeriesDict = require('../../../models/device_series_dict');
const HospitalMaster = require('../../../models/hospital_master');
const GeoRegion = require('../../../models/geo_region');
const GeoCountry = require('../../../models/geo_country');
const { getDeviceKeys, findDeviceIdByKeyValue } = require('../../../services/deviceKeyService');

const MODEL_SERIES_CODE_MAP = new Map([
  ['4336', 'SR'],
  ['4337', 'SR'],
  ['4339', 'SR'],
  ['4358', 'SR'],
  ['4366', 'SR'],
  ['4371', 'SR'],
  ['4372', 'SR'],
  ['4373', 'SR'],
  ['439', 'SR'],
  ['5G', 'SR'],
  ['BLOCK4', 'SR'],
  ['BLOCK5', 'SR'],
  ['SAI', 'SA'],
  ['SAII', 'SA']
]);

function normalizeLanguage(language) {
  return String(language || 'zh-CN').toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN';
}

function isEnglish(language) {
  return normalizeLanguage(language) === 'en-US';
}

function normalizeTextToken(value) {
  return String(value || '')
    .trim()
    .replace(/[—–－_]/g, '-')
    .replace(/\s+/g, '')
    .toUpperCase();
}

function normalizeSeriesAlias(value) {
  return String(value || '')
    .trim()
    .replace(/[—–－_]/g, '-')
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function normalizeQueryType(args = {}) {
  const raw = String(args.queryType || '').trim().toLowerCase();
  if (raw === 'device_id' || raw === 'device_model' || raw === 'series' || raw === 'decrypt_key') return raw;
  return '';
}

function createError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function ensureQuerySlot(queryType, args = {}) {
  if (queryType === 'device_id') {
    const deviceId = String(args.deviceId || '').trim();
    if (!deviceId) throw createError('MISSING_QUERY_SLOT', 'deviceId is required when queryType=device_id');
    return deviceId;
  }
  if (queryType === 'device_model') {
    const deviceModel = String(args.deviceModel || '').trim();
    if (!deviceModel) throw createError('MISSING_QUERY_SLOT', 'deviceModel is required when queryType=device_model');
    return deviceModel;
  }
  if (queryType === 'series') {
    const seriesCode = String(args.seriesCode || '').trim();
    if (!seriesCode) throw createError('MISSING_QUERY_SLOT', 'seriesCode is required when queryType=series');
    return seriesCode;
  }
  if (queryType === 'decrypt_key') {
    const decryptKey = String(args.decryptKey || '').trim();
    if (!decryptKey) throw createError('MISSING_QUERY_SLOT', 'decryptKey is required when queryType=decrypt_key');
    return decryptKey;
  }
  throw createError('MISSING_QUERY_TYPE', 'queryType is required');
}

function normalizeStrictFlag(value) {
  return String(value || 'false').trim().toLowerCase() === 'true';
}

function normalizeDeviceIdentifier(rawInput) {
  const cleaned = normalizeTextToken(rawInput);
  if (!cleaned) throw createError('INVALID_DEVICE_ID', 'deviceId is empty');

  const serialMatch = cleaned.match(/^(SR|SA)([A-Z0-9]+)-(\d{4})([A-Z0-9]{3})$/);
  if (serialMatch) {
    const [, seriesCode, modelCode, , sequenceSuffix] = serialMatch;
    return {
      rawInput: String(rawInput || '').trim(),
      normalizedInput: cleaned,
      normalizedDeviceId: `${modelCode}-${sequenceSuffix}`,
      extractedSeriesCode: seriesCode,
      extractedModelCode: modelCode,
      matchedPattern: 'full_serial'
    };
  }

  const shortMatch = cleaned.match(/^([A-Z0-9]+)-([A-Z0-9]+)$/);
  if (shortMatch) {
    const [, modelCode, suffix] = shortMatch;
    return {
      rawInput: String(rawInput || '').trim(),
      normalizedInput: cleaned,
      normalizedDeviceId: `${modelCode}-${suffix}`,
      extractedSeriesCode: '',
      extractedModelCode: modelCode,
      matchedPattern: 'device_id'
    };
  }

  throw createError('INVALID_DEVICE_ID', 'deviceId format is invalid');
}

function normalizeDeviceModelInput(rawInput) {
  const cleaned = normalizeTextToken(rawInput);
  if (!cleaned) throw createError('INVALID_DEVICE_MODEL', 'deviceModel is empty');
  return cleaned;
}

function normalizeSeriesCodeInput(rawInput) {
  const code = normalizeTextToken(rawInput);
  if (!code) throw createError('INVALID_SERIES_CODE', 'seriesCode is empty');
  if (!['SR', 'SA'].includes(code)) {
    throw createError('INVALID_SERIES_CODE', `seriesCode is invalid: ${code}`);
  }
  return code;
}

function normalizeDecryptKeyInput(rawInput) {
  const cleaned = String(rawInput || '').trim().replace(/:/g, '-').toLowerCase();
  if (!/^([0-9a-f]{2}-){5}[0-9a-f]{2}$/.test(cleaned)) {
    throw createError('INVALID_DECRYPT_KEY', 'decryptKey format is invalid');
  }
  return cleaned;
}

async function findSeriesByCode(seriesCode) {
  const code = normalizeTextToken(seriesCode);
  if (!code) return null;
  return DeviceSeriesDict.findOne({
    where: { series_code: code },
    attributes: ['id', 'series_code', 'series_name_zh', 'series_name_en']
  });
}

async function findSeriesBySeriesCode(seriesCode) {
  const normalizedCode = normalizeSeriesCodeInput(seriesCode);
  const row = await findSeriesByCode(normalizedCode);
  return {
    row,
    normalizedCode,
    source: 'series_code'
  };
}

async function findModelsByCode(modelCode) {
  const normalized = normalizeDeviceModelInput(modelCode);
  return DeviceModelDict.findAll({
    where: { device_model: normalized },
    attributes: ['id', 'device_model', 'series_id'],
    limit: 5
  });
}

async function findDeviceBindingById(deviceIdCandidates = []) {
  const uniqueCandidates = Array.from(new Set(
    deviceIdCandidates
      .map((item) => normalizeTextToken(item))
      .filter(Boolean)
  ));
  if (uniqueCandidates.length < 1) return null;
  return Device.findOne({
    where: { device_id: { [Op.in]: uniqueCandidates } },
    attributes: ['id', 'device_id', 'series_id', 'device_model_id', 'hospital_id', 'hospital_code']
  });
}

async function findHospitalContext(hospitalId) {
  const id = Number(hospitalId);
  if (!Number.isInteger(id) || id <= 0) return { hospital: null, region: null, country: null };
  const hospital = await HospitalMaster.findByPk(id, {
    attributes: ['id', 'hospital_code', 'hospital_name_std', 'country_code', 'region_code']
  });
  if (!hospital) return { hospital: null, region: null, country: null };
  const regionCode = String(hospital.region_code || '').trim();
  const countryCode = String(hospital.country_code || '').trim();
  const region = regionCode
    ? await GeoRegion.findOne({
      where: { region_code: regionCode },
      attributes: ['region_code', 'region_name', 'region_name_en', 'country_code']
    })
    : null;
  const country = countryCode
    ? await GeoCountry.findByPk(countryCode, {
      attributes: ['country_code', 'country_name', 'country_name_en']
    })
    : null;
  return { hospital, region, country };
}

async function findModelById(modelId) {
  const id = Number(modelId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return DeviceModelDict.findByPk(id, {
    attributes: ['id', 'device_model', 'series_id']
  });
}

async function findSeriesById(seriesId) {
  const id = Number(seriesId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return DeviceSeriesDict.findByPk(id, {
    attributes: ['id', 'series_code', 'series_name_zh', 'series_name_en']
  });
}

function toSeriesCard(seriesRow) {
  if (!seriesRow) return null;
  return {
    id: Number(seriesRow.id),
    code: String(seriesRow.series_code || '').trim().toUpperCase(),
    nameZh: String(seriesRow.series_name_zh || '').trim() || null,
    nameEn: String(seriesRow.series_name_en || '').trim() || null
  };
}

function toModelCard(modelRow) {
  if (!modelRow) return null;
  return {
    id: Number(modelRow.id),
    code: String(modelRow.device_model || '').trim().toUpperCase(),
    name: String(modelRow.device_model || '').trim().toUpperCase()
  };
}

function toHospitalCard(hospitalRow) {
  if (!hospitalRow) return null;
  return {
    id: Number(hospitalRow.id),
    code: String(hospitalRow.hospital_code || '').trim() || null,
    name: String(hospitalRow.hospital_name_std || '').trim() || null
  };
}

function toRegionCard(regionRow, hospitalRow) {
  const code = String(regionRow?.region_code || hospitalRow?.region_code || '').trim();
  const nameZh = String(regionRow?.region_name || '').trim();
  const nameEn = String(regionRow?.region_name_en || '').trim();
  if (!code && !nameZh) return null;
  return {
    code: code || null,
    nameZh: nameZh || null,
    nameEn: nameEn || nameZh || null
  };
}

function toCountryCard(countryRow, hospitalRow, regionRow) {
  const code = String(countryRow?.country_code || regionRow?.country_code || hospitalRow?.country_code || '').trim();
  const nameZh = String(countryRow?.country_name || '').trim();
  const nameEn = String(countryRow?.country_name_en || '').trim();
  if (!code && !nameZh && !nameEn) return null;
  return {
    code: code || null,
    nameZh: nameZh || null,
    nameEn: nameEn || nameZh || null
  };
}

function toDecryptKeyCard(keyRow) {
  if (!keyRow) return null;
  const value = String(keyRow.key_value || '').trim();
  if (!value) return null;
  return {
    value,
    source: 'device_key',
    validFrom: keyRow.valid_from_date ? new Date(keyRow.valid_from_date).toISOString() : null,
    validTo: keyRow.valid_to_date ? new Date(keyRow.valid_to_date).toISOString() : null
  };
}

function pickPreferredDeviceKey(keyRows = []) {
  const list = Array.isArray(keyRows) ? keyRows.filter(Boolean) : [];
  if (list.length < 1) return null;
  return [...list].sort((left, right) => {
    const leftFrom = left?.valid_from_date ? new Date(left.valid_from_date).getTime() : 0;
    const rightFrom = right?.valid_from_date ? new Date(right.valid_from_date).getTime() : 0;
    if (rightFrom !== leftFrom) return rightFrom - leftFrom;
    return Number(right?.priority || 0) - Number(left?.priority || 0);
  })[0] || null;
}

function pushSqlEvidence(evidence, table, column, value) {
  if (value === undefined || value === null || String(value).trim() === '') return;
  evidence.push({
    type: 'sql_row',
    engine: 'mysql',
    table,
    pk: {
      column,
      value
    }
  });
}

function buildText(data, language) {
  const en = isEnglish(language);
  const resolved = data?.resolved || {};
  const unknown = en ? 'unknown' : '未识别';
  const normalizedDeviceId = String(resolved.deviceId || '').trim() || unknown;
  const modelName = String(resolved.deviceModel?.name || '').trim() || unknown;
  const seriesName = String((en ? resolved.series?.nameEn : resolved.series?.nameZh) || '').trim() || unknown;
  const countryName = String((en ? resolved.country?.nameEn : resolved.country?.nameZh) || '').trim() || unknown;
  const regionName = String((en ? resolved.region?.nameEn : resolved.region?.nameZh) || '').trim() || unknown;
  const hospitalName = String(resolved.hospital?.name || '').trim() || unknown;
  const decryptKeyValue = String(resolved.decryptKey?.value || '').trim() || unknown;

  if (en) {
    return `Resolved device card: deviceId=${normalizedDeviceId}, deviceModel=${modelName}, series=${seriesName}, country=${countryName}, region=${regionName}, hospital=${hospitalName}, decryptKey=${decryptKeyValue}`;
  }
  return `已解析设备名片：设备编号=${normalizedDeviceId}，设备型号=${modelName}，设备系列=${seriesName}，国家=${countryName}，地区=${regionName}，医院=${hospitalName}，密钥=${decryptKeyValue}`;
}

function buildDeviceContextData({
  queryType,
  input,
  normalized,
  resolved,
  source,
  inferred = false,
  ambiguous = false,
  candidates = []
}) {
  return {
    queryType,
    input,
    normalized,
    resolved,
    meta: {
      source,
      inferred,
      ambiguous,
      candidates
    }
  };
}

async function resolveSeriesFromModelCode(modelCode) {
  const normalizedModelCode = normalizeDeviceModelInput(modelCode);
  const rows = await findModelsByCode(normalizedModelCode);
  if (rows.length > 0) {
    const distinctSeriesIds = Array.from(new Set(
      rows
        .map((row) => Number(row.series_id))
        .filter((id) => Number.isInteger(id) && id > 0)
    ));
    const seriesRow = distinctSeriesIds.length === 1
      ? await findSeriesById(distinctSeriesIds[0])
      : null;
    return {
      modelRow: rows[0],
      modelRows: rows,
      seriesRow,
      inferred: false,
      source: 'device_model_dict'
    };
  }

  const mappedSeriesCode = MODEL_SERIES_CODE_MAP.get(normalizedModelCode) || '';
  if (!mappedSeriesCode) {
    return {
      modelRow: null,
      modelRows: [],
      seriesRow: null,
      inferred: false,
      source: 'device_model_dict'
    };
  }
  const seriesRow = await findSeriesByCode(mappedSeriesCode);
  return {
    modelRow: null,
    modelRows: [],
    seriesRow,
    inferred: true,
    source: 'model_static_mapping'
  };
}

async function handleDeviceIdQuery(rawDeviceId, args = {}) {
  const normalized = normalizeDeviceIdentifier(rawDeviceId);
  const evidence = [];
  const binding = await findDeviceBindingById([
    normalized.normalizedDeviceId,
    normalized.normalizedInput,
    normalized.rawInput
  ]);

  if (binding) {
    pushSqlEvidence(evidence, 'devices', 'id', Number(binding.id));
    const modelRow = await findModelById(binding.device_model_id);
    if (modelRow) pushSqlEvidence(evidence, 'device_model_dict', 'id', Number(modelRow.id));
    const seriesRow = await findSeriesById(binding.series_id || modelRow?.series_id);
    if (seriesRow) pushSqlEvidence(evidence, 'device_series_dict', 'id', Number(seriesRow.id));
    const { hospital, region, country } = await findHospitalContext(binding.hospital_id);
    const preferredKey = pickPreferredDeviceKey(await getDeviceKeys(String(binding.device_id || normalized.normalizedDeviceId || '').trim()));
    if (hospital) pushSqlEvidence(evidence, 'hospital_master', 'id', Number(hospital.id));
    if (region) pushSqlEvidence(evidence, 'geo_region', 'region_code', String(region.region_code));
    if (country) pushSqlEvidence(evidence, 'geo_country', 'country_code', String(country.country_code));
    if (preferredKey) pushSqlEvidence(evidence, 'device_keys', 'id', Number(preferredKey.id));

    const data = buildDeviceContextData({
      queryType: 'device_id',
      input: {
        deviceId: String(rawDeviceId || '').trim()
      },
      normalized,
      resolved: {
        deviceId: String(binding.device_id || normalized.normalizedDeviceId || '').trim() || null,
        deviceModel: toModelCard(modelRow) || (normalized.extractedModelCode ? {
          id: null,
          code: normalized.extractedModelCode,
          name: normalized.extractedModelCode
        } : null),
        series: toSeriesCard(seriesRow),
        country: toCountryCard(country, hospital, region),
        region: toRegionCard(region, hospital),
        hospital: toHospitalCard(hospital),
        decryptKey: toDecryptKeyCard(preferredKey)
      },
      source: 'device_binding',
      inferred: false
    });
    return { data, evidence };
  }

  const modelResolution = normalized.extractedModelCode
    ? await resolveSeriesFromModelCode(normalized.extractedModelCode)
    : { modelRow: null, modelRows: [], seriesRow: null, inferred: false, source: 'serial_rule_inference' };

  if (modelResolution.modelRow) pushSqlEvidence(evidence, 'device_model_dict', 'id', Number(modelResolution.modelRow.id));
  if (modelResolution.seriesRow) pushSqlEvidence(evidence, 'device_series_dict', 'id', Number(modelResolution.seriesRow.id));

  let resolvedSeriesRow = modelResolution.seriesRow;
  let ambiguous = false;
  const candidates = [];
  const explicitSeriesCode = normalizeTextToken(normalized.extractedSeriesCode);
  if (explicitSeriesCode) {
    const explicitSeriesRow = await findSeriesByCode(explicitSeriesCode);
    if (explicitSeriesRow) {
      pushSqlEvidence(evidence, 'device_series_dict', 'id', Number(explicitSeriesRow.id));
      if (resolvedSeriesRow && Number(explicitSeriesRow.id) !== Number(resolvedSeriesRow.id)) {
        ambiguous = true;
        candidates.push({
          source: 'serial_rule',
          series: toSeriesCard(explicitSeriesRow)
        });
        candidates.push({
          source: modelResolution.source,
          series: toSeriesCard(resolvedSeriesRow)
        });
      } else {
        resolvedSeriesRow = explicitSeriesRow;
      }
    }
  }

  const resolvedDeviceId = normalized.normalizedDeviceId || null;
  const resolvedModelCode = normalized.extractedModelCode || String(modelResolution.modelRow?.device_model || '').trim().toUpperCase() || null;
  const data = buildDeviceContextData({
    queryType: 'device_id',
    input: {
      deviceId: String(rawDeviceId || '').trim()
    },
    normalized,
    resolved: {
      deviceId: resolvedDeviceId,
      deviceModel: resolvedModelCode ? {
        id: modelResolution.modelRow ? Number(modelResolution.modelRow.id) : null,
        code: resolvedModelCode,
        name: resolvedModelCode
      } : null,
      series: toSeriesCard(resolvedSeriesRow),
      country: null,
      region: null,
      hospital: null,
      decryptKey: null
    },
    source: binding ? 'device_binding' : (ambiguous ? 'serial_rule_conflict' : modelResolution.source || 'serial_rule_inference'),
    inferred: true,
    ambiguous,
    candidates
  });
  return { data, evidence };
}

async function handleDeviceModelQuery(rawDeviceModel) {
  const normalizedModelCode = normalizeDeviceModelInput(rawDeviceModel);
  const evidence = [];
  const modelResolution = await resolveSeriesFromModelCode(normalizedModelCode);

  if (modelResolution.modelRow) pushSqlEvidence(evidence, 'device_model_dict', 'id', Number(modelResolution.modelRow.id));
  if (modelResolution.seriesRow) pushSqlEvidence(evidence, 'device_series_dict', 'id', Number(modelResolution.seriesRow.id));

  const candidates = modelResolution.modelRows.length > 1
    ? modelResolution.modelRows.map((row) => ({
      model: toModelCard(row),
      seriesId: Number(row.series_id || 0) || null
    }))
    : [];

  const data = buildDeviceContextData({
    queryType: 'device_model',
    input: {
      deviceModel: String(rawDeviceModel || '').trim()
    },
    normalized: {
      normalizedDeviceModel: normalizedModelCode
    },
    resolved: {
      deviceId: null,
      deviceModel: modelResolution.modelRow
        ? toModelCard(modelResolution.modelRow)
        : {
          id: null,
          code: normalizedModelCode,
          name: normalizedModelCode
        },
      series: toSeriesCard(modelResolution.seriesRow),
      country: null,
      region: null,
      hospital: null,
      decryptKey: null
    },
    source: modelResolution.source,
    inferred: modelResolution.inferred,
    ambiguous: candidates.length > 1,
    candidates
  });
  return { data, evidence };
}

async function handleSeriesQuery(rawSeriesCode) {
  const evidence = [];
  const resolved = await findSeriesBySeriesCode(rawSeriesCode);
  if (resolved.row) {
    pushSqlEvidence(evidence, 'device_series_dict', 'id', Number(resolved.row.id));
  }
  const data = buildDeviceContextData({
    queryType: 'series',
    input: {
      seriesCode: String(rawSeriesCode || '').trim().toUpperCase()
    },
    normalized: {
      normalizedSeriesCode: String(resolved.normalizedCode || '').trim() || null
    },
    resolved: {
      deviceId: null,
      deviceModel: null,
      series: toSeriesCard(resolved.row),
      country: null,
      region: null,
      hospital: null,
      decryptKey: null
    },
    source: resolved.source,
    inferred: false
  });
  return { data, evidence };
}

async function handleDecryptKeyQuery(rawDecryptKey) {
  const normalizedDecryptKey = normalizeDecryptKeyInput(rawDecryptKey);
  const evidence = [];
  const deviceId = await findDeviceIdByKeyValue(normalizedDecryptKey);

  if (!deviceId) {
    const data = buildDeviceContextData({
      queryType: 'decrypt_key',
      input: {
        decryptKey: String(rawDecryptKey || '').trim()
      },
      normalized: {
        normalizedDecryptKey
      },
      resolved: {
        deviceId: null,
        deviceModel: null,
        series: null,
        country: null,
        region: null,
        hospital: null,
        decryptKey: {
          value: normalizedDecryptKey,
          source: 'device_key',
          validFrom: null,
          validTo: null
        }
      },
      source: 'device_key_lookup',
      inferred: false
    });
    return { data, evidence };
  }

  const outcome = await handleDeviceIdQuery(deviceId);
  const preferredKey = pickPreferredDeviceKey(await getDeviceKeys(deviceId));
  if (preferredKey) pushSqlEvidence(evidence, 'device_keys', 'id', Number(preferredKey.id));
  const baseData = outcome?.data || null;

  return {
    data: buildDeviceContextData({
      queryType: 'decrypt_key',
      input: {
        decryptKey: String(rawDecryptKey || '').trim()
      },
      normalized: {
        normalizedDecryptKey
      },
      resolved: {
        ...(baseData?.resolved || {}),
        decryptKey: toDecryptKeyCard(preferredKey) || {
          value: normalizedDecryptKey,
          source: 'device_key',
          validFrom: null,
          validTo: null
        }
      },
      source: 'device_key_lookup',
      inferred: false,
      ambiguous: Boolean(baseData?.meta?.ambiguous),
      candidates: Array.isArray(baseData?.meta?.candidates) ? baseData.meta.candidates : []
    }),
    evidence: [
      ...evidence,
      ...(Array.isArray(outcome?.evidence) ? outcome.evidence : [])
    ]
  };
}

async function execute({ args }) {
  const queryType = normalizeQueryType(args);
  if (!queryType) throw createError('MISSING_QUERY_TYPE', 'queryType is required');
  ensureQuerySlot(queryType, args);
  const language = normalizeLanguage(args?.language);
  const strict = normalizeStrictFlag(args?.strict);

  let outcome = null;
  if (queryType === 'device_id') {
    outcome = await handleDeviceIdQuery(args.deviceId, args);
  } else if (queryType === 'device_model') {
    outcome = await handleDeviceModelQuery(args.deviceModel, args);
  } else if (queryType === 'series') {
    outcome = await handleSeriesQuery(args.seriesCode, args);
  } else if (queryType === 'decrypt_key') {
    outcome = await handleDecryptKeyQuery(args.decryptKey);
  } else {
    throw createError('MISSING_QUERY_TYPE', 'queryType is required');
  }

  const data = outcome?.data || null;
  const evidence = Array.isArray(outcome?.evidence) ? outcome.evidence : [];
  const hasEvidence = evidence.length > 0;
  const hasResolvedValue = Boolean(
    data?.resolved?.deviceId
    || data?.resolved?.deviceModel?.code
    || data?.resolved?.series?.code
    || data?.resolved?.hospital?.id
    || data?.resolved?.region?.code
    || data?.resolved?.decryptKey?.value
  );

  if (!hasResolvedValue && strict) {
    return {
      text: isEnglish(language) ? 'No exact device context match found.' : '未找到精确匹配的设备上下文。',
      data: null,
      evidence,
      debugMeta: {
        source: 'registered_tool',
        toolName: 'device_context_lookup',
        normalizedArgs: {
          queryType,
          strict,
          language,
          ...(queryType === 'decrypt_key' ? { decryptKey: normalizeDecryptKeyInput(args.decryptKey) } : {})
        }
      }
    };
  }

  if (!hasEvidence && !hasResolvedValue) {
    return {
      text: isEnglish(language)
        ? 'The input was normalized, but no device master data match was found.'
        : '已完成输入归一化，但未命中可确认的设备主数据。',
      data: null,
      evidence: [],
      debugMeta: {
        source: 'registered_tool',
        toolName: 'device_context_lookup',
        normalizedArgs: {
          queryType,
          strict,
          language,
          ...(queryType === 'device_id' ? { deviceId: normalizeTextToken(args.deviceId) } : {}),
          ...(queryType === 'device_model' ? { deviceModel: normalizeTextToken(args.deviceModel) } : {}),
          ...(queryType === 'series' ? { seriesCode: normalizeSeriesCodeInput(args.seriesCode) } : {}),
          ...(queryType === 'decrypt_key' ? { decryptKey: normalizeDecryptKeyInput(args.decryptKey) } : {})
        },
        meta: data?.meta || null,
        normalized: data?.normalized || null
      }
    };
  }

  return {
    text: buildText(data, language),
    data,
    evidence,
    debugMeta: {
      source: 'registered_tool',
      toolName: 'device_context_lookup',
      normalizedArgs: {
        queryType,
        strict,
        language,
        ...(queryType === 'device_id' ? { deviceId: data?.normalized?.normalizedDeviceId || normalizeTextToken(args.deviceId) } : {}),
        ...(queryType === 'device_model' ? { deviceModel: data?.normalized?.normalizedDeviceModel || normalizeTextToken(args.deviceModel) } : {}),
        ...(queryType === 'series' ? { seriesCode: data?.normalized?.normalizedSeriesCode || normalizeSeriesCodeInput(args.seriesCode) } : {}),
        ...(queryType === 'decrypt_key' ? { decryptKey: data?.normalized?.normalizedDecryptKey || normalizeDecryptKeyInput(args.decryptKey) } : {})
      },
      meta: data?.meta || null,
      resolved: data?.resolved || null
    }
  };
}

module.exports = {
  execute,
  normalizeDeviceIdentifier,
  normalizeDeviceModelInput,
  normalizeSeriesCodeInput,
  normalizeDecryptKeyInput
};
