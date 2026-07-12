const path = require('path');
const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const { composeExplanationPreviewFromI18n } = require('../../../utils/explanationPreview');
const { searchErrorCodesUnified } = require('../../../services/errorCodeUnifiedService');
const { resolveSubsystemPrefixLabel } = require('../../../services/faultCodeExtractionService');
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

function pickInputSlot(args = {}) {
  return String(args.errorCode || args.keywords || '').trim();
}

async function resolveSeriesIdFromCode(seriesCode) {
  const code = String(seriesCode || '').trim().toUpperCase();
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
    const mappedPrefix = resolveSubsystemPrefixLabel(subsystemCode, language);
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
  const inputSlot = pickInputSlot(args);
  const seriesCode = String(args?.seriesCode || '').trim().toUpperCase();
  const seriesId = await resolveSeriesIdFromCode(seriesCode);

  const unifiedResult = await searchErrorCodesUnified({
    q: inputSlot,
    series_id: seriesId,
    subsystem: String(args?.subsystem || '').trim().toUpperCase() || undefined,
    page: 1,
    limit: 5,
    acceptLanguage: language,
    t
  });

  const rows = Array.isArray(unifiedResult?.errorCodes) ? unifiedResult.errorCodes : [];
  const recognized = unifiedResult?._meta?.recognized || null;
  const fullCodeLookup = recognized?.kind === 'full_code';
  const items = rows.map((row, idx) => mapUnifiedRowToData(row, inputSlot, idx, t, recognized, seriesCode));

  const data = items.length > 0 ? { items, ambiguous: items.length > 1 } : null;
  const text = items.length === 0
    ? t('errorCodeLookup.notFound')
    : (items.length > 1 ? buildLookupTextMulti(items, language, t, fullCodeLookup) : toLookupText(items[0], t, fullCodeLookup));
  const lookupSource = String(unifiedResult?._meta?.searchMethod || 'none');
  const evidence = rows.slice(0, 5).map((row) => {
    const rowId = Number(row?.id);
    if (lookupSource === 'es') {
      return {
        type: 'search_hit',
        engine: 'elasticsearch',
        index: 'error_codes',
        documentId: Number.isFinite(rowId) ? String(rowId) : `${row?.subsystem || ''}:${row?.code || ''}`
      };
    }
    return {
      type: 'sql_row',
      engine: 'mysql',
      table: 'error_codes',
      pk: {
        column: 'id',
        value: Number.isFinite(rowId) ? rowId : `${row?.subsystem || ''}:${row?.code || ''}`
      }
    };
  });

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
      recognized,
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
