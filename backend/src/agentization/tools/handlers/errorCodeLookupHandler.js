const path = require('path');
const { Op } = require('sequelize');
const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const { composeExplanationPreviewFromI18n } = require('../../../utils/explanationPreview');
const { normalizeErrorCodeInput } = require('../../../services/faultCodeExtractionService');
const { searchByKeywords, isElasticsearchAvailable } = require('../../../services/errorCodeSearchService');
const ErrorCode = require('../../../models/error_code');
const I18nErrorCode = require('../../../models/i18n_error_code');
const AnalysisCategory = require('../../../models/analysis_category');

const I18NEXT_BACKEND_PATH = path.resolve(__dirname, '../../../locales/{{lng}}/translation.json');

let backendInitPromise = null;

function resolveLookupLng(language) {
  return String(language || 'zh-CN').toLowerCase().startsWith('en') ? 'en' : 'zh';
}

/** 与 app.js 共用 i18next 单例；队列等工作进程可能未跑 HTTP 初始化，需补一次 Backend init */
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

const I18N_ERROR_CODE_FIELDS = [
  'id',
  'lang',
  'short_message',
  'user_hint',
  'operation',
  'detail',
  'method',
  'param1',
  'param2',
  'param3',
  'param4',
  'tech_solution',
  'explanation'
];

function toPlain(row) {
  if (!row) return {};
  if (typeof row.toJSON === 'function') return row.toJSON();
  return row && typeof row === 'object' ? row : {};
}

function pickLocalizedI18n(i18nRows, lang) {
  const normalized = String(lang || 'zh').split('-')[0].toLowerCase();
  const rows = (Array.isArray(i18nRows) ? i18nRows : []).map(toPlain);
  return rows.find((x) => String(x.lang || '').split('-')[0].toLowerCase() === normalized)
    || rows.find((x) => String(x.lang || '').split('-')[0].toLowerCase() === 'zh')
    || null;
}

function resolveDisplayCategory(base, targetLang) {
  const data = toPlain(base);
  const categories = Array.isArray(data.analysisCategories) ? data.analysisCategories : [];
  if (categories.length > 0) {
    const first = toPlain(categories[0]);
    if (String(targetLang || 'zh').toLowerCase().startsWith('en')) {
      return String(first.name_en || first.name_zh || '').trim();
    }
    return String(first.name_zh || first.name_en || '').trim();
  }
  return String(data.category || '').trim();
}

function mapErrorCodeRecordToData(record, language, inputErrorCode) {
  const base = toPlain(record?.base);
  const i18n = toPlain(record?.i18n);
  const code = String(base.code || '').trim();
  const subsystem = String(base.subsystem || '').trim();
  return {
    subsystem,
    code,
    displayCode: String(inputErrorCode || '').trim() || (subsystem && code ? `${subsystem}:${code}` : code),
    shortMessage: String(i18n.short_message || '').trim(),
    userHint: String(i18n.user_hint || '').trim(),
    operation: String(i18n.operation || '').trim(),
    params: {
      param1: String(i18n.param1 || '').trim(),
      param2: String(i18n.param2 || '').trim(),
      param3: String(i18n.param3 || '').trim(),
      param4: String(i18n.param4 || '').trim()
    },
    detail: String(i18n.detail || '').trim(),
    method: String(i18n.method || '').trim(),
    techSolution: String(i18n.tech_solution || base.solution || '').trim(),
    category: resolveDisplayCategory(base, language),
    explanation: null,
    prefix: null,
    prefixRaw: null
  };
}

const ES_AGENT_LOOKUP_LIMIT = 5;

function isFullFaultCodeToken(s) {
  const u = String(s || '').trim().toUpperCase();
  return /^[1-9A][0-9A-F]{5}[A-E]$/.test(u);
}

/**
 * full_mysql：仅 MySQL（子系统 + 类型码变体）；type_es / keyword_es：主路径 ES（类型码已归一为 0X…）
 */
function resolveLookupRoute(args) {
  const ec = String(args?.errorCode || '').trim();
  const kw = String(args?.keywords || '').trim();

  if (ec) {
    if (isFullFaultCodeToken(ec)) {
      return { route: 'full_mysql', fullCode: ec, inputSlot: ec, esQuery: '', mysqlFallback: null };
    }
    const normEc = normalizeErrorCodeInput(ec);
    if (normEc && !isFullFaultCodeToken(ec)) {
      return {
        route: 'type_es',
        esQuery: normEc,
        inputSlot: ec,
        mysqlFallback: { errorCode: ec, keywords: kw }
      };
    }
    return {
      route: 'keyword_es',
      esQuery: ec,
      inputSlot: ec,
      mysqlFallback: { errorCode: ec, keywords: kw }
    };
  }

  if (kw) {
    if (!/\s/.test(kw) && isFullFaultCodeToken(kw)) {
      return { route: 'full_mysql', fullCode: kw, inputSlot: kw, esQuery: '', mysqlFallback: null };
    }
    if (!/\s/.test(kw)) {
      const normKw = normalizeErrorCodeInput(kw);
      if (normKw && !isFullFaultCodeToken(kw)) {
        return {
          route: 'type_es',
          esQuery: normKw,
          inputSlot: kw,
          mysqlFallback: { errorCode: kw, keywords: '' }
        };
      }
    }
    return {
      route: 'keyword_es',
      esQuery: kw,
      inputSlot: kw,
      mysqlFallback: { errorCode: '', keywords: kw }
    };
  }

  return { route: 'none', inputSlot: '', esQuery: '', mysqlFallback: null, fullCode: null };
}

function mysqlAssociationIncludes() {
  return [
    {
      model: I18nErrorCode,
      as: 'i18nContents',
      required: false,
      attributes: I18N_ERROR_CODE_FIELDS
    },
    {
      model: AnalysisCategory,
      as: 'analysisCategories',
      through: { attributes: [] },
      attributes: ['id', 'category_key', 'name_zh', 'name_en']
    }
  ];
}

/** 完整日志故障码：仅用子系统号 + 类型码（DB 中多种书写）查 MySQL，不走 ES */
async function fetchMysqlFullCodeRecords(errorCode, language) {
  const lang = String(language || 'zh-CN').toLowerCase().startsWith('en') ? 'en' : 'zh';
  const upper = String(errorCode || '').trim().toUpperCase();
  if (!/^[1-9A][0-9A-F]{5}[A-E]$/.test(upper)) return [];

  const derivedSubsystem = upper.charAt(0);
  const tail = upper.slice(-4);
  const variants = [tail, `0x${tail}`, `0X${tail}`];
  const rows = await ErrorCode.findAll({
    where: { subsystem: derivedSubsystem, code: { [Op.in]: variants } },
    include: mysqlAssociationIncludes(),
    limit: 10
  });
  if (!rows.length) return [];
  return rows.map((row) => {
    const rowData = toPlain(row);
    return { base: rowData, i18n: pickLocalizedI18n(rowData.i18nContents, lang) };
  });
}

function esItemToRecord(item) {
  const src = item && typeof item === 'object' ? item : {};
  return {
    base: {
      code: String(src.code || '').trim(),
      subsystem: String(src.subsystem || '').trim(),
      solution: String(src.tech_solution || '').trim(),
      category: String(src.category || '').trim(),
      analysisCategories: []
    },
    i18n: {
      short_message: src.short_message,
      user_hint: src.user_hint,
      operation: src.operation,
      detail: src.detail,
      method: src.method,
      param1: src.param1,
      param2: src.param2,
      param3: src.param3,
      param4: src.param4,
      tech_solution: src.tech_solution,
      explanation: src.explanation
    }
  };
}

async function lookupViaElasticsearch(rawQuery, language) {
  const q = String(rawQuery || '').trim();
  if (!q) return { used: false, records: [], esMeta: null };
  const esUp = await isElasticsearchAvailable().catch(() => false);
  if (!esUp) return { used: false, records: [], esMeta: { skipped: true, reason: 'es_unavailable' } };

  const lang = resolveLookupLng(language);
  const esResult = await searchByKeywords({
    keywords: [q],
    lang,
    limit: ES_AGENT_LOOKUP_LIMIT
  });

  if (!esResult.ok || !Array.isArray(esResult.items) || esResult.items.length === 0) {
    return {
      used: false,
      records: [],
      esMeta: { ok: esResult.ok, error: esResult.error || null, debug: esResult.debug || null }
    };
  }

  return {
    used: true,
    records: esResult.items.map(esItemToRecord),
    esMeta: { debug: esResult.debug || null }
  };
}

async function lookupErrorCodeRecords({ errorCode, keywords, language }) {
  const lang = String(language || 'zh-CN').toLowerCase().startsWith('en') ? 'en' : 'zh';
  const include = mysqlAssociationIncludes();

  const codeInput = String(errorCode || '').trim();
  const fullRows = await fetchMysqlFullCodeRecords(codeInput, language);
  if (fullRows.length) return fullRows;

  const normCode = normalizeErrorCodeInput(errorCode || '');
  if (normCode) {
    const row = await ErrorCode.findOne({ where: { code: normCode }, include });
    if (!row) return [];
    const rowData = toPlain(row);
    return [{ base: rowData, i18n: pickLocalizedI18n(rowData.i18nContents, lang) }];
  }

  const kw = String(keywords || '').trim();
  if (!kw) return [];
  const rows = await ErrorCode.findAll({
    where: {
      [Op.or]: [
        { code: { [Op.like]: `%${kw}%` } },
        { subsystem: { [Op.like]: `%${kw}%` } }
      ]
    },
    include,
    limit: 5
  });
  if (!rows.length) return [];
  return rows.map((row) => {
    const rowData = toPlain(row);
    return { base: rowData, i18n: pickLocalizedI18n(rowData.i18nContents, lang) };
  });
}

function toLookupText(records, language, inputErrorCode, t) {
  if (!Array.isArray(records) || records.length === 0) return t('errorCodeLookup.notFound');
  const data = mapErrorCodeRecordToData(records[0], language, inputErrorCode);
  const parts = [t('errorCodeLookup.foundPrefix', { code: data.displayCode || data.code })];
  if (data.userHint || data.operation) {
    parts.push(`${t('errorCodeLookup.labels.hintInfo')}：${[data.userHint, data.operation].filter(Boolean).join('，')}`);
  }
  const paramText = Object.entries(data.params || {})
    .filter(([, value]) => String(value || '').trim())
    .map(([key, value]) => `${key}=${value}`)
    .join('；');
  if (paramText) parts.push(`${t('errorCodeLookup.labels.paramMeaning')}：${paramText}`);
  if (data.detail) parts.push(`${t('errorCodeLookup.labels.detail')}：${data.detail}`);
  if (data.method) parts.push(`${t('errorCodeLookup.labels.detectLogic')}：${data.method}`);
  if (data.techSolution) parts.push(`${t('errorCodeLookup.labels.techSolution')}：${data.techSolution}`);
  if (data.category) parts.push(`${t('errorCodeLookup.labels.category')}：${data.category}`);
  return parts.join('；');
}

function buildLookupTextMulti(records, language, userRawInput, t) {
  const lines = [];
  for (let i = 0; i < records.length; i += 1) {
    const r = records[i];
    const sub = String(r?.base?.subsystem || '').trim();
    const code = String(r?.base?.code || '').trim();
    const sm = String(r?.i18n?.short_message || '').trim();
    const summaryPart = sm ? ` — ${sm}` : '';
    lines.push(
      t('errorCodeLookup.multipleMatchesLine', {
        idx: i + 1,
        subsystem: sub || '—',
        code: code || '—',
        summaryPart
      })
    );
  }
  const primaryLabel = (() => {
    const b = records[0]?.base;
    const sub = String(b?.subsystem || '').trim();
    const code = String(b?.code || '').trim();
    return sub && code ? `${sub}:${code}` : userRawInput;
  })();
  return [
    t('errorCodeLookup.multipleMatchesIntro', { count: records.length }),
    ...lines,
    '',
    toLookupText([records[0]], language, primaryLabel, t)
  ].join('\n');
}

function appendExplanationPreview(data, records, rawCodeForPreview, t) {
  if (!data) return;
  const i18nRow = toPlain(records[0]?.i18n);
  const preview = composeExplanationPreviewFromI18n({
    rawCode: rawCodeForPreview || data.displayCode || '',
    subsystemFromDb: data.subsystem,
    typeCodeFromDb: data.code,
    template: i18nRow.explanation,
    param1: i18nRow.param1,
    param2: i18nRow.param2,
    param3: i18nRow.param3,
    param4: i18nRow.param4,
    t
  });
  data.explanation = preview.explanation;
  data.prefix = preview.prefix;
  data.prefixRaw = preview.prefixRaw;
}

/** 统一结构：每条为完整故障码词条（含释义解析），顺序与检索排序一致 */
function buildLookupItemsFromRecords(records, args, inputSlot, t) {
  const items = [];
  for (let idx = 0; idx < records.length; idx += 1) {
    const r = records[idx];
    const sub = String(r?.base?.subsystem || '').trim();
    const code = String(r?.base?.code || '').trim();
    const label = idx === 0 && inputSlot ? inputSlot : (sub && code ? `${sub}:${code}` : code);
    const rowData = mapErrorCodeRecordToData(r, args?.language, label);
    appendExplanationPreview(rowData, [r], label, t);
    items.push(rowData);
  }
  return items;
}

async function execute({ args }) {
  await ensureI18nForLookup();
  const t = i18next.getFixedT(resolveLookupLng(args?.language));
  const route = resolveLookupRoute(args);
  const inputSlot = route.inputSlot || String(args?.errorCode || args?.keywords || '').trim();

  let records = [];
  let lookupSource = 'mysql';
  let esTry = { used: false, records: [], esMeta: null };

  if (route.route === 'full_mysql' && route.fullCode) {
    records = await fetchMysqlFullCodeRecords(route.fullCode, args?.language);
    lookupSource = 'mysql';
  } else if (route.route !== 'none' && route.esQuery) {
    esTry = await lookupViaElasticsearch(route.esQuery, args?.language);
    if (esTry.used && esTry.records.length > 0) {
      records = esTry.records;
      lookupSource = 'elasticsearch';
    } else if (route.mysqlFallback) {
      records = await lookupErrorCodeRecords({
        errorCode: route.mysqlFallback.errorCode,
        keywords: route.mysqlFallback.keywords,
        language: args?.language
      });
      lookupSource = 'mysql';
    }
  }

  const data =
    records.length > 0
      ? {
          items: buildLookupItemsFromRecords(records, args, inputSlot, t),
          ambiguous: records.length > 1
        }
      : null;

  const text =
    records.length === 0
      ? t('errorCodeLookup.notFound')
      : records.length > 1
        ? buildLookupTextMulti(records, args?.language, inputSlot, t)
        : toLookupText(records, args?.language, inputSlot, t);

  return {
    text,
    data,
    debugMeta: {
      source: 'registered_tool',
      toolName: 'error_code_lookup',
      lookupRoute: route.route,
      lookupSource,
      es: esTry.esMeta || null,
      records: records.map((r) => ({
        code: r?.base?.code || '',
        subsystem: r?.base?.subsystem || '',
        shortMessage: r?.i18n?.short_message || '',
        category: resolveDisplayCategory(r?.base, args?.language)
      }))
    }
  };
}

module.exports = {
  execute,
  mapErrorCodeRecordToData,
  lookupErrorCodeRecords
};
