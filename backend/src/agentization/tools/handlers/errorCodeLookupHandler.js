const path = require('path');
const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const { composeExplanationPreviewFromI18n } = require('../../../utils/explanationPreview');
const { searchErrorCodesUnified } = require('../../../services/errorCodeUnifiedService');
const {
  resolveSubsystemLabel,
  resolveAgentFaultCodeToken
} = require('../../../services/faultCodeExtractionService');
const DeviceSeriesDict = require('../../../models/device_series_dict');

const I18NEXT_BACKEND_PATH = path.resolve(__dirname, '../../../locales/{{lng}}/translation.json');

let backendInitPromise = null;

function resolveLookupLng(language) {
  return String(language || 'zh-CN').toLowerCase().startsWith('en') ? 'en' : 'zh';
}

/**
 * 与 app.js 共用 i18next 单例；非 HTTP 入口（如 agent）可能未初始化，需补一次 Backend init。
 */
async function ensureI18nForLookup() {
  if (i18next.isInitialized) return;
  for (let i = 0; i < 50; i += 1) {
    await new Promise((r) => setTimeout(r, 20));
    if (i18next.isInitialized) return;
  }
  if (!backendInitPromise) {
    backendInitPromise = i18next.use(Backend).init({
      fallbackLng: 'zh',
      preload: ['zh', 'en'],
      backend: { loadPath: I18NEXT_BACKEND_PATH },
      interpolation: { escapeValue: false }
    });
  }
  try {
    await backendInitPromise;
  } catch (err) {
    if (i18next.isInitialized) return;
    backendInitPromise = null;
    throw err;
  }
}

function normalizeQueryType(args = {}) {
  const raw = String(args.queryType || '').trim().toLowerCase();
  if (raw === 'single_code' || raw === 'multiple_codes' || raw === 'keyword') return raw;
  return '';
}

function normalizeSeriesCode(seriesCode) {
  return String(seriesCode || '').trim().toUpperCase();
}

function normalizeSubsystem(subsystem) {
  const normalized = String(subsystem || '').trim().toUpperCase();
  return /^[1-9A]$/.test(normalized) ? normalized : '';
}

function normalizeSingleErrorCode(input) {
  return resolveAgentFaultCodeToken(input);
}

function normalizeMultipleErrorCodes(list) {
  if (!Array.isArray(list)) return [];
  return Array.from(new Set(
    list
      .map((item) => normalizeSingleErrorCode(item))
      .filter(Boolean)
  ));
}

function resolveQueries(args = {}) {
  const explicitType = normalizeQueryType(args);
  const rawSingleCode = String(args.errorCode || '').trim();
  const singleCode = normalizeSingleErrorCode(rawSingleCode);
  const rawMultiCodes = Array.isArray(args.errorCodes) ? args.errorCodes : [];
  const multiCodes = normalizeMultipleErrorCodes(rawMultiCodes);
  const keywords = String(args.keywords || '').trim();

  if (!explicitType) {
    const err = new Error('queryType is required');
    err.code = 'MISSING_QUERY_TYPE';
    throw err;
  }

  if (explicitType === 'single_code') {
    if (!rawSingleCode) {
      const err = new Error('errorCode is required when queryType=single_code');
      err.code = 'MISSING_QUERY_SLOT';
      throw err;
    }
    if (!singleCode) {
      const err = new Error('errorCode format is invalid when queryType=single_code');
      err.code = 'INVALID_ERROR_CODE';
      throw err;
    }
    return {
      queryType: explicitType,
      queries: [singleCode],
      inputSlot: singleCode,
      normalizedArgs: {
        errorCode: singleCode
      }
    };
  }

  if (explicitType === 'multiple_codes') {
    if (rawMultiCodes.length === 0) {
      const err = new Error('errorCodes is required when queryType=multiple_codes');
      err.code = 'MISSING_QUERY_SLOT';
      throw err;
    }
    if (multiCodes.length === 0) {
      const err = new Error('errorCodes format is invalid when queryType=multiple_codes');
      err.code = 'INVALID_ERROR_CODE';
      throw err;
    }
    return {
      queryType: explicitType,
      queries: multiCodes,
      inputSlot: multiCodes[0],
      normalizedArgs: {
        errorCodes: multiCodes
      }
    };
  }

  if (explicitType === 'keyword') {
    if (!keywords) {
      const err = new Error('keywords is required when queryType=keyword');
      err.code = 'MISSING_QUERY_SLOT';
      throw err;
    }
    return {
      queryType: explicitType,
      queries: [keywords],
      inputSlot: keywords,
      normalizedArgs: {
        keywords
      }
    };
  }

  const err = new Error('queryType is required');
  err.code = 'MISSING_QUERY_TYPE';
  throw err;
}

async function resolveSeriesIdFromCode(seriesCode) {
  const code = normalizeSeriesCode(seriesCode);
  if (!code) {
    const err = new Error('seriesCode is required');
    err.code = 'MISSING_SERIES_CODE';
    throw err;
  }
  const row = await DeviceSeriesDict.findOne({
    where: { series_code: code },
    attributes: ['id', 'series_code']
  });
  if (!row) {
    const err = new Error(`invalid seriesCode: ${code}`);
    err.code = 'INVALID_SERIES_CODE';
    throw err;
  }
  return Number(row.id);
}

function mapUnifiedRowToData(row, inputSlot, idx, t, recognized, seriesCode) {
  const code = String(row?.code || '').trim();
  const subsystem = String(row?.subsystem || '').trim();
  const displayCode = idx === 0 && inputSlot
    ? inputSlot
    : (subsystem && code ? `${subsystem}:${code}` : code);

  const mapped = {
    subsystem,
    code,
    displayCode,
    shortMessage: String(row?.short_message || '').trim(),
    userHint: String(row?.user_hint || '').trim(),
    operation: String(row?.operation || '').trim(),
    params: {
      param1: String(row?.param1 || '').trim(),
      param2: String(row?.param2 || '').trim(),
      param3: String(row?.param3 || '').trim(),
      param4: String(row?.param4 || '').trim()
    },
    detail: String(row?.detail || '').trim(),
    method: String(row?.method || '').trim(),
    techSolution: String(row?.tech_solution || row?.solution || '').trim(),
    category: String(row?.category || '').trim(),
    explanation: null,
    prefix: null,
    prefixRaw: null
  };

  const preview = composeExplanationPreviewFromI18n({
    rawCode: displayCode,
    prefixSourceRaw: recognized?.kind === 'full_code' ? inputSlot : undefined,
    subsystemFromDb: subsystem,
    typeCodeFromDb: code,
    seriesCode,
    template: row?.explanation,
    param1: row?.param1,
    param2: row?.param2,
    param3: row?.param3,
    param4: row?.param4,
    t
  });

  mapped.explanation = preview.explanation;
  mapped.prefix = preview.prefix;
  mapped.prefixRaw = preview.prefixRaw;

  return mapped;
}

/** 完整故障码：释义同源前缀 + 用户提示 + 操作说明（与 buildPrefixFromContext 一致） */
function joinFullCodeHintInfo(prefix, userHint, operation) {
  return [prefix, userHint, operation]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join('，');
}

function toLookupText(item, t, fullCodeLookup) {
  if (!item) return t('errorCodeLookup.notFound');
  const parts = [t('errorCodeLookup.foundPrefix', { code: item.displayCode || item.code })];
  if (fullCodeLookup) {
    const hint = joinFullCodeHintInfo(item.prefix, item.userHint, item.operation);
    if (hint) parts.push(`${t('errorCodeLookup.labels.hintInfo')}：${hint}`);
  } else if (item.userHint || item.operation) {
    parts.push(`${t('errorCodeLookup.labels.hintInfo')}：${[item.userHint, item.operation].filter(Boolean).join('，')}`);
  }
  const paramText = Object.entries(item.params || {})
    .filter(([, value]) => String(value || '').trim())
    .map(([key, value]) => `${key}=${value}`)
    .join('；');
  if (paramText) parts.push(`${t('errorCodeLookup.labels.paramMeaning')}：${paramText}`);
  if (item.detail) parts.push(`${t('errorCodeLookup.labels.detail')}：${item.detail}`);
  if (item.method) parts.push(`${t('errorCodeLookup.labels.detectLogic')}：${item.method}`);
  if (item.techSolution) parts.push(`${t('errorCodeLookup.labels.techSolution')}：${item.techSolution}`);
  if (item.category) parts.push(`${t('errorCodeLookup.labels.category')}：${item.category}`);
  return parts.join('；');
}

function buildLookupTextMulti(items, language, t, fullCodeLookup) {
  const lines = [];
  for (let i = 0; i < items.length; i += 1) {
    const row = items[i];
    const subsystemCode = String(row.subsystem || '').trim().toUpperCase();
    const mappedPrefix = String(row.prefix || '').trim() || resolveSubsystemLabel(subsystemCode, language);
    const safePrefix = mappedPrefix || subsystemCode || '—';
    const safeCode = row.code || '—';
    const safeHint = String(row.userHint || '').trim() || '—';
    const safeOperation = String(row.operation || '').trim() || '—';
    const hintInfoBody = fullCodeLookup
      ? (joinFullCodeHintInfo(row.prefix, row.userHint, row.operation) || '—')
      : `${safeHint},${safeOperation}`;
    const paramMeaning = ['param1', 'param2', 'param3', 'param4']
      .map((key) => `${key}=${String(row.params?.[key] || '').trim() || '—'}`)
      .join('；');
    const safeDetail = String(row.detail || '').trim() || '—';
    const safeMethod = String(row.method || '').trim() || '—';
    const safeTechSolution = String(row.techSolution || '').trim() || '—';
    const safeCategory = String(row.category || '').trim() || '—';
    lines.push(
      `${i + 1}) ${safePrefix} ${safeCode}；`
      + `${t('errorCodeLookup.labels.hintInfo')}：${hintInfoBody}；`
      + `${t('errorCodeLookup.labels.paramMeaning')}：${paramMeaning}；`
      + `${t('errorCodeLookup.labels.detail')}：${safeDetail}；`
      + `${t('errorCodeLookup.labels.detectLogic')}：${safeMethod}；`
      + `${t('errorCodeLookup.labels.techSolution')}：${safeTechSolution}；`
      + `${t('errorCodeLookup.labels.category')}：${safeCategory}`
    );
  }
  return [
    t('errorCodeLookup.multipleMatchesIntro', { count: items.length }),
    ...lines
  ].join('\n');
}

async function execute({ args }) {
  await ensureI18nForLookup();
  const language = String(args?.language || 'zh-CN');
  const t = i18next.getFixedT(resolveLookupLng(language));
  const resolvedQuery = resolveQueries(args);
  const seriesCode = normalizeSeriesCode(args?.seriesCode);
  const seriesId = await resolveSeriesIdFromCode(seriesCode);
  const normalizedSubsystem = normalizeSubsystem(args?.subsystem);

  const queries = resolvedQuery.queries;
  const batchItems = [];
  const evidence = [];
  const lookupSources = new Set();
  const batchResults = [];

  for (const query of queries) {
    const unifiedResult = await searchErrorCodesUnified({
      q: query,
      series_id: seriesId,
      subsystem: normalizedSubsystem || undefined,
      page: 1,
      limit: 5,
      acceptLanguage: language,
      t
    });
    batchResults.push({ query, unifiedResult });
    const rows = Array.isArray(unifiedResult?.errorCodes) ? unifiedResult.errorCodes : [];
    const recognized = unifiedResult?._meta?.recognized || null;
    const mappedItems = rows.map((row, idx) => mapUnifiedRowToData(row, query, idx, t, recognized, seriesCode));
    batchItems.push({
      query,
      ambiguous: mappedItems.length > 1,
      items: mappedItems
    });
    const lookupSource = String(unifiedResult?._meta?.searchMethod || 'none');
    lookupSources.add(lookupSource);
    for (const row of rows.slice(0, 5)) {
      const rowId = Number(row?.id);
      if (lookupSource === 'es') {
        evidence.push({
          type: 'search_hit',
          engine: 'elasticsearch',
          index: 'error_codes',
          documentId: Number.isFinite(rowId) ? String(rowId) : `${row?.subsystem || ''}:${row?.code || ''}`
        });
      } else {
        evidence.push({
          type: 'sql_row',
          engine: 'mysql',
          table: 'error_codes',
          pk: {
            column: 'id',
            value: Number.isFinite(rowId) ? rowId : `${row?.subsystem || ''}:${row?.code || ''}`
          }
        });
      }
    }
  }

  const items = batchItems.flatMap((entry) => entry.items);
  const data = items.length > 0
    ? {
        items,
        ambiguous: batchItems.some((entry) => entry.ambiguous) || items.length > 1,
        queries: batchItems
      }
    : null;

  let text = t('errorCodeLookup.notFound');
  if (batchItems.length > 1) {
    const sections = batchItems.map((entry) => {
      const first = entry.items[0] || null;
      if (!first) return `${entry.query}：${t('errorCodeLookup.notFound')}`;
      const fullCodeLookup = String(first?.displayCode || '').trim() === entry.query || /^[1-9A][0-9A-F]{5}[A-E]$/i.test(entry.query);
      const body = entry.items.length > 1
        ? buildLookupTextMulti(entry.items, language, t, fullCodeLookup)
        : toLookupText(first, t, fullCodeLookup);
      return `${entry.query}：\n${body}`;
    });
    text = sections.join('\n\n');
  } else if (batchItems.length === 1) {
    const singleBatch = batchItems[0];
    const first = singleBatch.items[0] || null;
    const recognized = batchResults[0]?.unifiedResult?._meta?.recognized || null;
    const fullCodeLookup = recognized?.kind === 'full_code';
    text = singleBatch.items.length === 0
      ? t('errorCodeLookup.notFound')
      : (singleBatch.items.length > 1
        ? buildLookupTextMulti(singleBatch.items, language, t, fullCodeLookup)
        : toLookupText(first, t, fullCodeLookup));
  }

  const lookupSource = Array.from(lookupSources).join(',') || 'none';

  return {
    text,
    data,
    evidence,
    debugMeta: {
      source: 'registered_tool',
      toolName: 'error_code_lookup',
      lookupSource,
      seriesCode,
      series_id: seriesId,
      normalizedArgs: {
        ...resolvedQuery.normalizedArgs,
        queryType: resolvedQuery.queryType,
        seriesCode,
        ...(normalizedSubsystem ? { subsystem: normalizedSubsystem } : {})
      },
      recognized: batchResults.length === 1 ? (batchResults[0]?.unifiedResult?._meta?.recognized || null) : null,
      queryCount: queries.length,
      evidence,
      records: items.map((x) => ({
        code: x.code,
        subsystem: x.subsystem,
        shortMessage: x.shortMessage,
        category: x.category
      }))
    }
  };
}

module.exports = {
  execute,
  resolveSeriesIdFromCode
};
