const { Op } = require('sequelize');
const crypto = require('crypto');

const ErrorCode = require('../models/error_code');
const I18nErrorCode = require('../models/i18n_error_code');
const AnalysisCategory = require('../models/analysis_category');
const { searchIssues, getJiraConfig, buildJqlFromQueryPlan } = require('../services/jiraService');
const { ensureCacheReady, renderEntryExplanation } = require('../services/logParsingService');
const { connectMongo, isMongoConnected } = require('../config/mongodb');
const FaultCase = require('../mongoModels/FaultCase');
const {
  getProvidersPublic,
  resolveProvider,
  getSmartSearchLlmStatusForProvider,
  extractQueryPlanWithProvider,
  buildQueryPlanExtractionMessages,
  streamKeywordExtractionWithProvider,
  buildKeywordExtractionMessages
} = require('../services/smartSearchLlmService');
const { runJiraMongoMixedSearch } = require('../services/jiraMixedSearchService');
const { searchSnippets: searchKbSnippets, buildSnippetAnswerText: buildKbSnippetAnswerText } = require('../services/kbSearchService');
const { searchByKeywords: searchErrorCodesByKeywordsEs, searchByTypeCodes: searchErrorCodesByTypeCodesEs } = require('../services/errorCodeSearchService');
const { searchErrorCodesUnified } = require('../services/errorCodeUnifiedService');

const DEFAULT_LIMITS = {
  errorCodes: 10,
  jira: 10,
  faultCases: 10,
  kbDocs: 5
};

function makeOperationId() {
  try {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch (_) {}
  return `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function getClientIp(req) {
  // Prefer proxy headers if present (nginx etc.), fallback to express ip
  const xff = req?.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    // "client, proxy1, proxy2"
    return xff.split(',')[0].trim();
  }
  const xrip = req?.headers?.['x-real-ip'];
  if (typeof xrip === 'string' && xrip.trim()) return xrip.trim();
  return req?.ip || '';
}

function truncateString(s, maxLen) {
  const str = String(s ?? '');
  if (str.length <= maxLen) return str;
  return `${str.slice(0, maxLen)}...<truncated:${str.length - maxLen}>`;
}

function sanitizeForLog(value, { maxString = 4000, maxArray = 50, maxDepth = 4 } = {}, depth = 0) {
  if (depth > maxDepth) return '[MaxDepth]';
  if (value == null) return value;
  if (typeof value === 'string') return truncateString(value, maxString);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    const arr = value.slice(0, maxArray).map((v) => sanitizeForLog(v, { maxString, maxArray, maxDepth }, depth + 1));
    if (value.length > maxArray) arr.push(`[TruncatedArray:${value.length - maxArray}]`);
    return arr;
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      // never log credentials
      if (k.toLowerCase() === 'authorization' || k.toLowerCase() === 'cookie') continue;
      out[k] = sanitizeForLog(v, { maxString, maxArray, maxDepth }, depth + 1);
    }
    return out;
  }
  return String(value);
}

function buildSmartSearchLogDetails({ operationId, query, limits, includeDebug, lang, llmResponseRaw }) {
  return sanitizeForLog({
    operationId,
    input: { query, limits, includeDebug, lang },
    llmRaw: {
      response: llmResponseRaw || null
    }
  });
}

function fireAndForgetOperationLog(payload) {
  Promise.resolve()
    .then(async () => {
      const { logOperation } = require('../utils/operationLogger');
      await logOperation(payload);
    })
    .catch((err) => {
      console.warn('[smart-search] logOperation failed (ignored):', err?.message || err);
    });
}

function parseBool(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function getSmartSearchLlmStatus(providerId) {
  // SmartSearch is ONLY available when LLM is integrated and quota is sufficient.
  const provider = resolveProvider(providerId);
  const status = getSmartSearchLlmStatusForProvider(provider);
  return {
    ...status,
    providerId: provider?.id || null
  };
}

function normalizeLang(req) {
  const acceptLanguage = req.headers['accept-language'] || 'zh';
  return String(acceptLanguage).startsWith('en') ? 'en' : 'zh';
}

function uniq(arr) {
  const out = [];
  const seen = new Set();
  for (const x of arr || []) {
    const k = String(x ?? '').trim();
    if (!k) continue;
    const key = k.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(k);
  }
  return out;
}

function parseKeywords(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map((v) => String(v).trim()).filter(Boolean);
  return String(val)
    .split(/[,，\n\r\t ]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function toStringArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map((v) => String(v).trim()).filter(Boolean);
  return [String(val).trim()].filter(Boolean);
}

function normalizePlanQuery(raw) {
  const q = (raw && typeof raw === 'object') ? raw : {};
  return {
    // 用于概念/主题词抽取（definition/how_to_use），也可辅助 KB 检索
    keywords: uniq(parseKeywords(q.keywords)).slice(0, 12),
    fault_codes: toStringArray(q.fault_codes),
    symptom: toStringArray(q.symptom),
    trigger: toStringArray(q.trigger),
    component: toStringArray(q.component),
    neg: toStringArray(q.neg),
    days: Number.isFinite(Number(q.days)) ? Number(q.days) : 180
  };
}

async function ensureMongoReady() {
  await connectMongo();
  return isMongoConnected();
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function searchMongoFaultCases({ queryText, searchTerms, modules, relatedErrorCodeIds, limit }) {
  const safeLimit = Math.min(Math.max(Number(limit) || 0, 0), 50);
  if (safeLimit <= 0) return { ok: true, enabled: true, items: [], debug: { skipped: true, reason: 'limit<=0', limit: safeLimit } };

  if (!(await ensureMongoReady())) {
    return {
      ok: false,
      enabled: false,
      items: [],
      error: { code: 'mongo_not_connected', message: 'MongoDB 未连接' },
      debug: { ok: false, enabled: false, limit: safeLimit }
    };
  }

  const q = String(queryText || '').trim();
  const terms = Array.isArray(searchTerms) ? searchTerms.map((s) => String(s).trim()).filter(Boolean) : [];
  const moduleArr = Array.isArray(modules) ? modules.map((m) => String(m).trim()).filter(Boolean) : [];
  const ids = Array.isArray(relatedErrorCodeIds) ? relatedErrorCodeIds.map((n) => Number(n)).filter((n) => Number.isFinite(n)) : [];
  const relatedIds = Array.from(new Set(ids)).slice(0, 200);

  if (!q && !terms.length && !relatedIds.length) {
    return { ok: true, enabled: true, items: [], debug: { skipped: true, reason: 'no_query', limit: safeLimit } };
  }

  const debug = {
    ok: true,
    enabled: true,
    queryText: q,
    searchTerms: terms,
    modules: moduleArr,
    relatedErrorCodeIds: relatedIds,
    filter: null,
    sort: { updatedAt: -1 },
    limit: safeLimit
  };

  try {
    // Align with /jira/search-mixed Mongo behavior:
    // - avoid $text (Chinese tokenization + planner limitations)
    // - use regex on key text fields + keywords $in
    const filter = {};
    const and = [];

    const effectiveTerms = (terms.length ? terms : (q ? [q] : [])).slice(0, 12);
    if (effectiveTerms.length) {
      const keywordsForIn = uniq(effectiveTerms.flatMap((t) => parseKeywords(t))).slice(0, 50);
      const pattern = effectiveTerms.map(escapeRegExp).filter(Boolean).join('|');
      const searchConditions = [];
      if (pattern) {
        const re = new RegExp(pattern, 'i');
        searchConditions.push(
          { title: re },
          { symptom: re },
          { possible_causes: re },
          { solution: re },
          { remark: re }
        );
      }
      if (keywordsForIn.length) {
        searchConditions.push({ keywords: { $in: keywordsForIn } });
      }
      if (searchConditions.length) and.push({ $or: searchConditions });
    }

    // component => module filter (as requested)
    if (moduleArr.length) {
      and.push({ module: { $in: moduleArr.slice(0, 50) } });
    }

    if (relatedIds.length) {
      and.push({ related_error_code_ids: { $in: relatedIds } });
    }

    if (and.length) filter.$and = and;
    
    // 打印 MongoDB 查询语句
    const queryPipeline = [
      { $match: filter },
      { $sort: { updatedAt: -1 } },
      { $limit: safeLimit }
    ];
    console.log('[智能搜索-MongoDB] MongoDB 查询语句:');
    console.log(JSON.stringify(queryPipeline, null, 2));
    console.log('[智能搜索-MongoDB] 查询参数:', { queryText: q, searchTerms: terms, modules: moduleArr, relatedErrorCodeIds: relatedIds, limit: safeLimit });

    // Include queryPipeline in debug info
    debug.filter = filter;
    debug.queryPipeline = queryPipeline;
    debug.queryParams = { queryText: q, searchTerms: terms, modules: moduleArr, relatedErrorCodeIds: relatedIds, limit: safeLimit };

    const docs = await FaultCase.aggregate(queryPipeline);

    const out = (docs || []).map((d) => ({
      id: d?._id ? String(d._id) : '',
      source: d?.source || 'manual',
      jira_key: d?.jira_key ? String(d.jira_key).trim() : '',
      module: d?.module || '',
      title: d?.title || '',
      updatedAt: d?.updatedAt || d?.createdAt || null
    })).filter((x) => x.id);

    return { ok: true, enabled: true, items: out, debug };
  } catch (e) {
    console.warn('[智能搜索-MongoDB] query failed:', e?.codeName || e?.code || '', e?.message || e);
    return {
      ok: false,
      enabled: true,
      items: [],
      error: { code: e?.codeName || e?.code || 'mongo_query_failed', message: String(e?.message || e) },
      debug: { ...debug, ok: false }
    };
  }
}

function clampInt(n, min, max, fallback) {
  const v = Number.parseInt(n, 10);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(Math.max(v, min), max);
}

function normalizeTypeCode(input) {
  const raw = String(input ?? '').trim().toUpperCase();
  if (!raw) return '';
  if (/^(?:0X)?[0-9A-F]{3}[A-E]$/.test(raw)) {
    return raw.startsWith('0X') ? raw : `0X${raw}`;
  }
  return '';
}

function extractFaultCodesFromText(query) {
  const s = String(query || '').trim().toUpperCase();
  const fullRe = /[1-9A][0-9A-F]{5}[A-E]/g;
  const typeRe = /(?:0X)?[0-9A-F]{3}[A-E]/g;

  const fullCodes = [];
  const fullSeen = new Set();
  for (const m of s.matchAll(fullRe)) {
    const v = String(m[0] || '').trim().toUpperCase();
    if (!v) continue;
    if (fullSeen.has(v)) continue;
    fullSeen.add(v);
    fullCodes.push(v);
    if (fullCodes.length >= 3) break;
  }

  const typeCodes = [];
  const typeSeen = new Set();

  // Derived from full code
  for (const fc of fullCodes) {
    const tail4 = fc.slice(-4);
    const norm = normalizeTypeCode(tail4);
    if (norm && !typeSeen.has(norm)) {
      typeSeen.add(norm);
      typeCodes.push(norm);
    }
  }

  for (const m of s.matchAll(typeRe)) {
    const norm = normalizeTypeCode(m[0]);
    if (!norm) continue;
    if (typeSeen.has(norm)) continue;
    typeSeen.add(norm);
    typeCodes.push(norm);
    if (typeCodes.length >= 6) break;
  }

  return { fullCodes, typeCodes };
}

function mergeErrorCodeByLang(errorCodeData, targetLang) {
  if (!errorCodeData) return errorCodeData;
  if (targetLang === 'zh') {
    delete errorCodeData.i18nContents;
    return errorCodeData;
  }

  const i18nContent = Array.isArray(errorCodeData.i18nContents)
    ? errorCodeData.i18nContents.find((c) => String(c?.lang || '').split('-')[0] === targetLang)
    : null;

  if (i18nContent) {
    const i18nFields = [
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
    for (const f of i18nFields) {
      if (Object.prototype.hasOwnProperty.call(i18nContent, f)) {
        errorCodeData[f] = i18nContent[f] ?? '';
      }
    }
  }

  delete errorCodeData.i18nContents;
  return errorCodeData;
}

async function searchErrorCodesByKeywords({ keywords, targetLang, limit }) {
  const kwList = (keywords || []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, 12);
  if (kwList.length === 0) {
    return { items: [], debug: { keywordAttempts: [], method: 'none' } };
  }

  // 1. 尝试使用ES搜索
  try {
    const esResult = await searchErrorCodesByKeywordsEs({ keywords: kwList, lang: targetLang, limit });
    if (esResult.ok && esResult.items && esResult.items.length > 0) {
      // ES搜索成功，需要补充分析分类信息
      console.log(`[智能搜索-故障码关键词] ✅ 使用ES检索，关键词: [${kwList.join(', ')}], 匹配数: ${esResult.items.length}, ES总数: ${esResult.debug?.total || esResult.items.length}`);
      
      const include = [
        {
          model: AnalysisCategory,
          as: 'analysisCategories',
          through: { attributes: [] },
          attributes: ['id', 'category_key', 'name_zh', 'name_en'],
          required: false
        }
      ];

      // 为ES结果补充分析分类
      const enrichedItems = [];
      for (const item of esResult.items) {
        if (item.id) {
          const errorCode = await ErrorCode.findByPk(item.id, { include });
          if (errorCode) {
            const data = mergeErrorCodeByLang(errorCode.toJSON(), targetLang);
            enrichedItems.push({ ...data, _match: item._match, _score: item._score });
          } else {
            enrichedItems.push(item);
          }
        } else {
          enrichedItems.push(item);
        }
      }

      return { items: enrichedItems.slice(0, limit), debug: { ...esResult.debug, method: 'es' } };
    } else {
      console.log(`[智能搜索-故障码关键词] ℹ️ ES无结果，使用MySQL检索，关键词: [${kwList.join(', ')}]`);
    }
  } catch (e) {
    console.warn('[智能搜索-故障码关键词] ❌ ES搜索失败，fallback到MySQL:', e?.message || e);
  }

  // 2. Fallback到MySQL搜索
  const include = [
    {
      model: AnalysisCategory,
      as: 'analysisCategories',
      through: { attributes: [] },
      attributes: ['id', 'category_key', 'name_zh', 'name_en'],
      required: false
    },
    {
      model: I18nErrorCode,
      as: 'i18nContents',
      required: false,
      attributes: [
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
      ]
    }
  ];

  const used = [];
  const out = [];
  const seen = new Set();

  for (const kw of kwList) {
    if (kw.length <= 1) continue;
    used.push(kw);
    // eslint-disable-next-line no-await-in-loop
    const rows = await ErrorCode.findAll({
      where: {
        [Op.or]: [
          { short_message: { [Op.like]: `%${kw}%` } },
          { user_hint: { [Op.like]: `%${kw}%` } },
          { operation: { [Op.like]: `%${kw}%` } },
          { code: { [Op.like]: `%${kw}%` } },
          { subsystem: { [Op.like]: `%${kw}%` } }
        ]
      },
      limit: Math.min(limit * 2, 50),
      include,
      distinct: true
    });

    for (const r of rows || []) {
      const data = mergeErrorCodeByLang(r.toJSON(), targetLang);
      const key = String(data.id || `${data.subsystem || ''}:${data.code || ''}`);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...data, _match: { type: 'keyword', keyword: kw } });
      if (out.length >= limit) break;
    }
    if (out.length >= limit) break;
  }

  return { items: out.slice(0, limit), debug: { keywordAttempts: used, method: 'mysql' } };
}

async function getErrorCodesByTypeCodes({ typeCodes, targetLang, limit }) {
  const codes = (typeCodes || []).map((x) => normalizeTypeCode(x)).filter(Boolean).slice(0, 12);
  if (!codes.length) return { items: [], debug: { typeCodes: [] } };

  // 1. 优先使用ES搜索（故障类型码前缀匹配）
  try {
    const esResult = await searchErrorCodesByTypeCodesEs({ typeCodes: codes, lang: targetLang, limit });
    if (esResult.ok && esResult.items && esResult.items.length > 0) {
      console.log(`[智能搜索-故障类型码] ✅ 使用ES检索，类型码: [${codes.join(', ')}], 匹配数: ${esResult.items.length}, ES总数: ${esResult.debug?.total || esResult.items.length}`);
      
      // ES搜索成功，需要补充分析分类信息
      const include = [
        {
          model: AnalysisCategory,
          as: 'analysisCategories',
          through: { attributes: [] },
          attributes: ['id', 'category_key', 'name_zh', 'name_en'],
          required: false
        }
      ];

      // 为ES结果补充分析分类
      const enrichedItems = [];
      for (const item of esResult.items) {
        if (item.id) {
          const errorCode = await ErrorCode.findByPk(item.id, { include });
          if (errorCode) {
            const data = mergeErrorCodeByLang(errorCode.toJSON(), targetLang);
            enrichedItems.push({ ...data, _match: item._match, _score: item._score });
          } else {
            enrichedItems.push({ ...item, _match: { type: 'fault_type', code: item.code } });
          }
        } else {
          enrichedItems.push({ ...item, _match: { type: 'fault_type', code: item.code } });
        }
      }

      return { items: enrichedItems.slice(0, limit), debug: { ...esResult.debug, method: 'es' } };
    } else {
      console.log(`[智能搜索-故障类型码] ℹ️ ES无结果，使用MySQL检索，类型码: [${codes.join(', ')}]`);
    }
  } catch (e) {
    console.warn('[智能搜索-故障类型码] ❌ ES搜索失败，fallback到MySQL:', e?.message || e);
  }

  // 2. Fallback到MySQL搜索
  const include = [
    {
      model: AnalysisCategory,
      as: 'analysisCategories',
      through: { attributes: [] },
      attributes: ['id', 'category_key', 'name_zh', 'name_en'],
      required: false
    },
    {
      model: I18nErrorCode,
      as: 'i18nContents',
      required: false,
      attributes: [
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
      ]
    }
  ];

  const rows = await ErrorCode.findAll({
    where: { code: { [Op.in]: codes } },
    order: [['id', 'DESC']],
    limit: Math.min(Math.max(limit, 1) * 3, 60),
    include,
    distinct: true
  });

  const out = (rows || [])
    .map((r) => mergeErrorCodeByLang(r.toJSON(), targetLang))
    .slice(0, Math.max(limit, 1))
    .map((x) => ({ ...x, _match: { type: 'fault_type', code: x.code } }));

  return { items: out, debug: { typeCodes: codes, method: 'mysql' } };
}

async function getErrorCodeBySubsystemAndCode({ subsystem, code, targetLang }) {
  const s = String(subsystem || '').trim().toUpperCase();
  const c = normalizeTypeCode(code);
  if (!s || !c) return null;

  const include = [
    {
      model: AnalysisCategory,
      as: 'analysisCategories',
      through: { attributes: [] },
      attributes: ['id', 'category_key', 'name_zh', 'name_en'],
      required: false
    },
    {
      model: I18nErrorCode,
      as: 'i18nContents',
      required: false,
      attributes: [
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
      ]
    }
  ];

  const row = await ErrorCode.findOne({
    where: { subsystem: s, code: c },
    include
  });
  if (!row) return null;
  return mergeErrorCodeByLang(row.toJSON(), targetLang);
}

function buildAnswerText({ recognized, faultSources, jiraSources, faultCaseSources, missNotes }) {
  const lines = [];

  const points = [];
  const intent = recognized?.plan?.intent || '';
  const intentLabelMap = {
    troubleshoot: '排查/修复',
    lookup_fault_code: '查故障码',
    find_case: '找历史案例',
    definition: '概念解释',
    how_to_use: '使用方法',
    other: '不确定'
  };
  if (intent && intentLabelMap[intent]) points.push(`意图：${intentLabelMap[intent]}`);
  if (recognized?.fullCodes?.length) points.push(`故障码：${recognized.fullCodes.join(' / ')}`);
  else if (recognized?.typeCodes?.length) points.push(`故障类型：${recognized.typeCodes.join(' / ')}`);
  if (recognized?.plan?.query?.keywords?.length) points.push(`关键词：${recognized.plan.query.keywords.join(' / ')}`);
  if (recognized?.plan?.query?.symptom?.length) points.push(`现象：${recognized.plan.query.symptom.join(' / ')}`);
  if (recognized?.plan?.query?.trigger?.length) points.push(`触发条件：${recognized.plan.query.trigger.join(' / ')}`);

  if (points.length) {
    lines.push('① 识别到的查询要点');
    lines.push(`- ${points.join('；')}`);
    lines.push('');
  }

  if (faultSources.length) {
    lines.push('② 可直接执行的排查步骤（来自故障码，不推断）');
    for (const f of faultSources) {
      const ref = f.ref || '';
      const title = [f.code, f.short_message].filter(Boolean).join(' · ') || f.code || '';
      lines.push(`- ${title}${ref ? `（引用 [${ref}]）` : ''}`);
    }
    lines.push('');
  }

  if (jiraSources.length) {
    lines.push('③ 相似历史案例（来自 Jira 摘要，不推断）');
    for (const j of jiraSources) {
      const ref = j.ref || '';
      const title = [j.key, j.summary].filter(Boolean).join('：') || j.key || '';
      lines.push(`- ${title}${ref ? `（引用 [${ref}]）` : ''}`);
    }
    lines.push('');
  }

  const cases = Array.isArray(faultCaseSources) ? faultCaseSources : [];
  if (cases.length) {
    lines.push('④ 相似故障案例（来自 MongoDB，不推断）');
    for (const c of cases) {
      const ref = c.ref || '';
      const title = c.title || c.jira_key || c.id || '';
      const extra = c.jira_key ? `（Jira：${c.jira_key}）` : '';
      lines.push(`- ${title}${extra}${ref ? `（引用 [${ref}]）` : ''}`);
    }
    lines.push('');
  }

  const misses = Array.isArray(missNotes) ? missNotes.filter(Boolean) : [];
  if (misses.length) {
    lines.push('⑤ 未检索到的部分');
    for (const m of misses) lines.push(`- ${m}`);
    lines.push('');
  }

  return lines.join('\n').trim();
}

function buildTemplateSummary({ keywordsUsed, errorCodes, jira }) {
  const keywordCount = (errorCodes || []).filter((x) => x?._match?.type === 'keyword').length;
  const jiraItems = Array.isArray(jira?.items) ? jira.items : [];

  return {
    keywordsUsed,
    errorCodes: {
      exactMatches: 0,
      keywordMatches: keywordCount,
      shown: (errorCodes || []).length
    },
    jira: {
      enabled: !!jira?.enabled,
      shown: jiraItems.length,
      total: jira?.total ?? jiraItems.length
    },
    highlights: {
      errorCodes: (errorCodes || []).slice(0, 5).map((x) => ({
        id: x.id,
        subsystem: x.subsystem,
        code: x.code,
        short_message: x.short_message || '',
        level: x.level || ''
      })),
      jira: jiraItems.slice(0, 5).map((x) => ({
        key: x.key,
        summary: x.summary,
        status: x.status,
        updated: x.updated,
        url: x.url,
        module: x.module
      }))
    },
    notes: [
      ...(jira && jira.enabled === false ? ['Jira 未启用（后端未配置 Jira 集成）'] : [])
    ]
  };
}

async function smartSearch(req, res) {
  const startedAt = Date.now();
  const operationId = makeOperationId();
  let queryForLog = '';

  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const query = String(body.query || '').trim();
    const llmProviderId = String(body.llmProviderId || body.llmProvider || '').trim();
    queryForLog = query;
    if (!query) {
      return res.status(400).json({ ok: false, message: 'query 不能为空' });
    }

    const targetLang = normalizeLang(req);
    const limits = {
      errorCodes: clampInt(body?.limits?.errorCodes, 1, 30, DEFAULT_LIMITS.errorCodes),
      jira: clampInt(body?.limits?.jira, 0, 50, DEFAULT_LIMITS.jira),
      faultCases: clampInt(body?.limits?.faultCases, 0, 50, DEFAULT_LIMITS.faultCases),
      kbDocs: clampInt(body?.limits?.kbDocs, 0, 20, DEFAULT_LIMITS.kbDocs)
    };
    const includeDebug = body?.debug === true || body?.includeDebug === true || req.query?.debug === '1';

    const llmStatus = getSmartSearchLlmStatus(llmProviderId);
    if (!llmStatus.available) {
      const answerText = '当前未接入大模型或额度已用完，请使用经典面板进行搜索。';
      const meta = {
        lang: targetLang,
        elapsedMs: Date.now() - startedAt,
        jiraEnabled: !!getJiraConfig().enabled,
        llmEnabled: llmStatus.enabled,
        llmAvailable: llmStatus.available,
        llmReason: llmStatus.reason,
        llmProvider: llmStatus.provider?.id || null,
        llmModel: llmStatus.provider?.model || null
      };
      const responsePayload = {
        ok: true,
        queryPlan: { mode: 'disabled', query, providerId: llmStatus.provider?.id || null },
        answerText,
        sources: { faultCodes: [], jira: [] },
        suggestedRoutes: [
          { label: '故障码搜索', path: '/dashboard/error-codes' },
          { label: '故障案例搜索', path: '/dashboard/fault-cases' }
        ],
        meta,
        ...(includeDebug ? { debug: { llmStatus } } : {})
      };

      fireAndForgetOperationLog({
        operation: 'smart_search',
        description: `智能搜索（不可用）: ${truncateString(query, 120)}`,
        user_id: req.user?.id ?? null,
        username: req.user?.username ?? '',
        status: 'success',
        ip: getClientIp(req),
        user_agent: req.headers?.['user-agent'] || '',
        details: buildSmartSearchLogDetails({
          operationId,
          query,
          limits,
          includeDebug,
          lang: targetLang,
          llmRequest: null,
          llmResponseRaw: null
        })
      });

      return res.json(responsePayload);
    }

    const provider = resolveProvider(llmProviderId);
    const providerPublic = provider ? { id: provider.id, label: provider.label, model: provider.model } : null;
    const jiraCfg = getJiraConfig();

    // Step 1: rule-based fault code recognition (before LLM)
    const recognizedCodes = extractFaultCodesFromText(query);

    // Step 2: LLM extracts minimal QueryPlan JSON (no JQL/SQL)
    let llm = null;
    try {
      llm = await extractQueryPlanWithProvider({ providerId: llmProviderId, query, defaults: { days: 180 } });
    } catch (e) {
      const answerText = '大模型调用失败，请使用经典面板进行搜索。';
      const meta = {
        lang: targetLang,
        elapsedMs: Date.now() - startedAt,
        jiraEnabled: !!jiraCfg.enabled,
        llmEnabled: llmStatus.enabled,
        llmAvailable: false,
        llmReason: e?.code || 'llm_call_failed',
        llmProvider: providerPublic?.id || null,
        llmModel: providerPublic?.model || null
      };
      const responsePayload = {
        ok: true,
        queryPlan: { mode: 'llm_failed', query, providerId: providerPublic?.id || null },
        answerText,
        sources: { faultCodes: [], jira: [] },
        suggestedRoutes: [
          { label: '故障码搜索', path: '/dashboard/error-codes' },
          { label: '故障案例搜索', path: '/dashboard/fault-cases' }
        ],
        meta,
        ...(includeDebug ? { debug: { llmStatus, llmError: String(e?.message || e), llm: { provider: providerPublic } } } : {})
      };

      fireAndForgetOperationLog({
        operation: 'smart_search',
        description: `智能搜索（LLM失败）: ${truncateString(query, 120)}`,
        user_id: req.user?.id ?? null,
        username: req.user?.username ?? '',
        status: 'failed',
        ip: getClientIp(req),
        user_agent: req.headers?.['user-agent'] || '',
        details: buildSmartSearchLogDetails({
          operationId,
          query,
          limits,
          includeDebug,
          lang: targetLang,
          llmResponseRaw: null
        })
      });

      return res.json(responsePayload);
    }

    const planRaw = llm?.plan || { intent: 'other', query: { fault_codes: [], symptom: [], trigger: [], component: [], neg: [], days: 180 } };
    const intent = planRaw.intent || 'other';
    const q = normalizePlanQuery(planRaw.query);
    const plan = { ...planRaw, intent, query: q };

    const mergedTypeCodes = uniq([
      ...(recognizedCodes.typeCodes || []),
      ...(q.fault_codes || [])
    ].map(normalizeTypeCode).filter(Boolean));

    // If nothing extracted and no fault code recognized, guide user to classic panels
    const hasAnyIntent = intent === 'definition' || intent === 'how_to_use' ||
      mergedTypeCodes.length ||
      (q.keywords || []).length ||
      (q.symptom || []).length ||
      (q.trigger || []).length ||
      (q.component || []).length;

    if (!hasAnyIntent) {
      const answerText = '未识别到可用检索要点，请使用经典面板进行搜索。';
      const meta = {
        lang: targetLang,
        elapsedMs: Date.now() - startedAt,
        jiraEnabled: !!jiraCfg.enabled,
        llmEnabled: llmStatus.enabled,
        llmAvailable: llmStatus.available,
        llmReason: llmStatus.reason,
        llmProvider: providerPublic?.id || null,
        llmModel: providerPublic?.model || null
      };
      const responsePayload = {
        ok: true,
        queryPlan: { mode: 'llm_query_plan', query, providerId: providerPublic?.id || null, model: providerPublic?.model || null, plan },
        answerText,
        sources: { faultCodes: [], jira: [] },
        suggestedRoutes: [
          { label: '故障码搜索', path: '/dashboard/error-codes' },
          { label: '故障案例搜索', path: '/dashboard/fault-cases' }
        ],
        meta,
        ...(includeDebug ? {
          debug: {
            llmStatus,
            llm: { provider: providerPublic },
            llmRaw: llm?.raw || null,
            llmPrompt: { messages: buildQueryPlanExtractionMessages(query, { days: 180 }) },
            recognizedCodes
          }
        } : {})
      };

      fireAndForgetOperationLog({
        operation: 'smart_search',
        description: `智能搜索（无检索要点）: ${truncateString(query, 120)}`,
        user_id: req.user?.id ?? null,
        username: req.user?.username ?? '',
        status: 'success',
        ip: getClientIp(req),
        user_agent: req.headers?.['user-agent'] || '',
        details: buildSmartSearchLogDetails({
          operationId,
          query,
          limits,
          includeDebug,
          lang: targetLang,
          llmResponseRaw: llm?.raw || null
        })
      });

      return res.json(responsePayload);
    }

    const queryPlan = { mode: 'llm_query_plan', query, providerId: providerPublic?.id || null, model: providerPublic?.model || null, plan };

    // Intent routing (LLM does NOT answer; only decides retrieval strategy)
    const strategy = (() => {
      if (intent === 'how_to_use') return { doFault: false, doJira: false, route: 'how_to_use' };
      if (intent === 'definition') return { doFault: false, doJira: false, route: 'definition' };
      if (intent === 'lookup_fault_code') return { doFault: true, doJira: false, route: 'lookup_fault_code' };
      if (intent === 'find_case') return { doFault: mergedTypeCodes.length > 0, doJira: true, route: 'find_case' };
      if (intent === 'troubleshoot') return { doFault: true, doJira: true, route: 'troubleshoot' };
      // other: unsure, but we can still run retrieval if we have query points
      return { doFault: true, doJira: true, route: 'other' };
    })();
    if (!jiraCfg.enabled) strategy.doJira = false;

    if (intent === 'how_to_use') {
      let kb = { ok: true, items: [], debug: { skipped: true, reason: 'not_run' } };
      if (limits.kbDocs > 0) {
        try {
          const kbQuery = (q.keywords || []).length ? q.keywords.join(' ') : query;
          kb = await searchKbSnippets(kbQuery, { lang: targetLang, limit: limits.kbDocs });
        } catch (e) {
          kb = { ok: false, items: [], error: { message: String(e?.message || e), code: e?.code || 'kb_search_failed' } };
        }
      }

      const kbAnswer = buildKbSnippetAnswerText(kb.items);
      const fallbackText =
        '我可以帮你做“故障码库 + Jira 历史案例 + 知识库文档”的智能检索（优先返回原文片段，不做无依据推断）。\n\n' +
        '你可以这样问：\n' +
        '- “165100A 是什么故障？”（查故障码）\n' +
        '- “断网 插拔器械 有人遇到吗？”（找历史案例）\n' +
        '- “网络断连 如何排查？”（知识库/说明书片段）\n' +
        '- “010A 断网 怎么排查？”（排查/修复）\n\n' +
        '也可以直接使用经典面板进行检索。';

      const answerText = kbAnswer || fallbackText;
      const meta = {
        lang: targetLang,
        elapsedMs: Date.now() - startedAt,
        jiraEnabled: !!jiraCfg.enabled,
        llmEnabled: llmStatus.enabled,
        llmAvailable: llmStatus.available,
        llmReason: llmStatus.reason,
        llmProvider: providerPublic?.id || null,
        llmModel: providerPublic?.model || null
      };
      const responsePayload = {
        ok: true,
        queryPlan,
        answerText,
        recognized: {
          fullCodes: recognizedCodes.fullCodes || [],
          typeCodes: recognizedCodes.typeCodes || [],
          intent: intent,
          keywords: q.keywords || [],
          symptom: q.symptom || [],
          trigger: q.trigger || [],
          component: q.component || [],
          neg: q.neg || [],
          days: q.days || 180
        },
        sources: { faultCodes: [], jira: [], kbDocs: kb.items || [] },
        suggestedRoutes: [
          { label: '故障码搜索', path: '/dashboard/error-codes' },
          { label: '故障案例搜索', path: '/dashboard/fault-cases' }
        ],
        meta,
        ...(includeDebug ? {
          debug: {
            llmStatus,
            llm: { provider: providerPublic },
            llmPrompt: { messages: buildQueryPlanExtractionMessages(query, { days: 180 }) },
            llmRaw: llm?.raw || null,
            queryPlan: {
              ...queryPlan,
              planner: { recognizedCodes, mergedTypeCodes, intent, strategy }
            },
            kb
          }
        } : {})
      };

      fireAndForgetOperationLog({
        operation: 'smart_search',
        description: `智能搜索（使用方法）: ${truncateString(query, 120)}`,
        user_id: req.user?.id ?? null,
        username: req.user?.username ?? '',
        status: 'success',
        ip: getClientIp(req),
        user_agent: req.headers?.['user-agent'] || '',
        details: buildSmartSearchLogDetails({
          operationId,
          query,
          limits,
          includeDebug,
          lang: targetLang,
          llmResponseRaw: llm?.raw || null
        })
      });

      return res.json(responsePayload);
    }

    if (intent === 'definition') {
      let kb = { ok: true, items: [], debug: { skipped: true, reason: 'not_run' } };
      if (limits.kbDocs > 0) {
        try {
          const kbQuery = (q.keywords || []).length ? q.keywords.join(' ') : query;
          kb = await searchKbSnippets(kbQuery, { lang: targetLang, limit: limits.kbDocs });
        } catch (e) {
          kb = { ok: false, items: [], error: { message: String(e?.message || e), code: e?.code || 'kb_search_failed' } };
        }
      }

      const kbAnswer = buildKbSnippetAnswerText(kb.items);
      const fallbackText =
        '我目前没有接入可可靠解释的百科知识库，但可以在“说明书/需求/设计文档（原文片段）+ 故障码库 + Jira 历史案例”中检索。\n\n' +
        '请补充：关键名词、模块名、或故障码（如 165100A / 010A），我会返回最相关的原文片段引用。';

      const answerText = kbAnswer || fallbackText;
      const meta = {
        lang: targetLang,
        elapsedMs: Date.now() - startedAt,
        jiraEnabled: !!jiraCfg.enabled,
        llmEnabled: llmStatus.enabled,
        llmAvailable: llmStatus.available,
        llmReason: llmStatus.reason,
        llmProvider: providerPublic?.id || null,
        llmModel: providerPublic?.model || null
      };
      const responsePayload = {
        ok: true,
        queryPlan,
        answerText,
        recognized: {
          fullCodes: recognizedCodes.fullCodes || [],
          typeCodes: recognizedCodes.typeCodes || [],
          intent: intent,
          keywords: q.keywords || [],
          symptom: q.symptom || [],
          trigger: q.trigger || [],
          component: q.component || [],
          neg: q.neg || [],
          days: q.days || 180
        },
        sources: { faultCodes: [], jira: [], kbDocs: kb.items || [] },
        suggestedRoutes: [
          { label: '故障码搜索', path: '/dashboard/error-codes' },
          { label: '故障案例搜索', path: '/dashboard/fault-cases' }
        ],
        meta,
        ...(includeDebug ? {
          debug: {
            llmStatus,
            llm: { provider: providerPublic },
            llmPrompt: { messages: buildQueryPlanExtractionMessages(query, { days: 180 }) },
            llmRaw: llm?.raw || null,
            queryPlan: {
              ...queryPlan,
              planner: { recognizedCodes, mergedTypeCodes, intent, strategy }
            },
            kb
          }
        } : {})
      };

      fireAndForgetOperationLog({
        operation: 'smart_search',
        description: `智能搜索（概念解释）: ${truncateString(query, 120)}`,
        user_id: req.user?.id ?? null,
        username: req.user?.username ?? '',
        status: 'success',
        ip: getClientIp(req),
        user_agent: req.headers?.['user-agent'] || '',
        details: buildSmartSearchLogDetails({
          operationId,
          query,
          limits,
          includeDebug,
          lang: targetLang,
          llmResponseRaw: llm?.raw || null
        })
      });

      return res.json(responsePayload);
    }

    // Step 3-1: Fault code retrieval (reuse unified search)
    const missNotes = [];

    // Full fault code: reuse unified preview to get a rendered explanation + prefix (no params)
    let faultCodesPreview = null;

    // 合并所有关键词来源：keywords（LLM提取的通用关键词）+ symptom + trigger + component
    const keywords = uniq([
      ...(q.keywords || []),
      ...(q.symptom || []),
      ...(q.trigger || []),
      ...(q.component || [])
    ]).slice(0, 12);

    let faultSources = [];
    let faultCodesSearch = null; // unified-like structure: { errorCodes, total, _meta, preview }
    let typeResp = { items: [], debug: { typeCodes: [] } };
    let kwResp = { items: [], debug: { keywordAttempts: [] } };
    if (!strategy.doFault) {
      missNotes.push('按意图跳过故障码检索');
    } else {
      let exactRecord = null;
      const hasFullCode = recognizedCodes.fullCodes && recognizedCodes.fullCodes.length > 0;
      const hasTypeCodeOnly = !hasFullCode && mergedTypeCodes.length > 0;

      // 有完整故障码时：统一检索（精确查）+ 可选 preview
      if (hasFullCode) {
        const fc = recognizedCodes.fullCodes[0];
        const derivedSubsystem = String(fc || '').trim().toUpperCase().charAt(0);
        const unified = await searchErrorCodesUnified({
          q: fc,
          subsystem: derivedSubsystem || undefined,
          page: 1,
          limit: Math.max(limits.errorCodes, 10),
          preview: 1,
          acceptLanguage: targetLang,
          t: req.t
        });
        faultCodesPreview = unified?.preview || null;
        exactRecord = (unified?.errorCodes && unified.errorCodes[0]) ? unified.errorCodes[0] : null;
        if (exactRecord) {
          exactRecord._match = { type: 'full_code', fullCode: fc, method: unified?._meta?.searchMethod || 'exact' };
        }
      }

      // 只有不完整的故障码（故障类型）时：使用故障类型检索所有子系统
      if (hasTypeCodeOnly) {
        // 复用统一检索：每个 typeCode 调一次（便于维持“精确查”的识别与结构）
        const merged = [];
        const seenType = new Set();
        for (const tc of mergedTypeCodes) {
          // eslint-disable-next-line no-await-in-loop
          const r = await searchErrorCodesUnified({
            q: tc,
            page: 1,
            limit: limits.errorCodes,
            acceptLanguage: targetLang,
            t: req.t
          });
          for (const it of r?.errorCodes || []) {
            const key = String(it?.id || `${it?.subsystem || ''}:${it?.code || ''}`);
            if (seenType.has(key)) continue;
            seenType.add(key);
            merged.push(it);
            if (merged.length >= limits.errorCodes) break;
          }
          if (merged.length >= limits.errorCodes) break;
        }
        typeResp = { items: merged, debug: { typeCodes: mergedTypeCodes } };
      }

      // 关键词检索（作为补充）
      // 注意：对于 find_case 或 troubleshoot 意图，不使用 keywords 检索故障码，只使用 fault_codes
      if (keywords.length > 0 && intent !== 'find_case' && intent !== 'troubleshoot') {
        const outItems = [];
        const seenKw = new Set();
        const used = [];
        for (const kw of keywords) {
          if (!kw || String(kw).trim().length <= 1) continue;
          used.push(String(kw).trim());
          // eslint-disable-next-line no-await-in-loop
          const r = await searchErrorCodesUnified({
            q: kw,
            page: 1,
            limit: limits.errorCodes,
            acceptLanguage: targetLang,
            t: req.t
          });
          for (const it of r?.errorCodes || []) {
            const key = String(it?.id || `${it?.subsystem || ''}:${it?.code || ''}`);
            if (seenKw.has(key)) continue;
            seenKw.add(key);
            outItems.push(it);
            if (outItems.length >= limits.errorCodes) break;
          }
          if (outItems.length >= limits.errorCodes) break;
        }
        kwResp = { items: outItems, debug: { keywordAttempts: used } };
      }

      const mergedFault = [];
      const seen = new Set();
      const pushOne = (x) => {
        if (!x) return;
        const key = String(x.id || `${x.subsystem || ''}:${x.code || ''}`);
        if (seen.has(key)) return;
        seen.add(key);
        mergedFault.push(x);
      };
      
      // 优先级：完整故障码 > 故障类型 > 关键词
      if (exactRecord) pushOne(exactRecord);
      for (const it of typeResp.items || []) pushOne(it);
      for (const it of kwResp.items || []) pushOne(it);

      const faultItems = mergedFault.slice(0, limits.errorCodes);
      if (!faultItems.length) {
        missNotes.push('未在故障码中检索到匹配条目');
      }

      faultSources = faultItems.map((it, idx) => {
        // Extract category from analysisCategories if available
        let category = it.category || '';
        if (!category && Array.isArray(it.analysisCategories) && it.analysisCategories.length > 0) {
          // Use the first category's name_zh or name_en based on targetLang
          const cat = it.analysisCategories[0];
          category = targetLang === 'zh' ? (cat.name_zh || cat.name_en || '') : (cat.name_en || cat.name_zh || '');
        }
        
        // 解析 explanation：如果有参数，使用参数解析；否则使用 fullExplanation 或原始模板
        let parsedExplanation = (faultCodesPreview && faultCodesPreview.explanation) ? faultCodesPreview.explanation : (it.explanation || '');
        const hasParams = it.param1 || it.param2 || it.param3 || it.param4;
        if (hasParams && it.explanation) {
          try {
            // 构建 error_code：优先使用完整故障码（包含 subsystem + arm + joint + code）
            let errorCode = '';
            
            // 如果是从完整故障码匹配到的记录，使用保存的完整故障码
            if (it._match?.fullCode && typeof it._match.fullCode === 'string') {
              errorCode = it._match.fullCode.toUpperCase();
            } else if (it.subsystem && it.code) {
              // 如果有 subsystem 和 code，构建完整格式：subsystem + arm + joint + code
              // 注意：如果 arm 和 joint 未知，使用 '0' 作为占位符
              // 格式：subsystem + arm(0) + joint(0) + code（去掉 0X 前缀）
              const codeWithoutPrefix = it.code.replace(/^0X/i, '');
              // 如果 code 是 4 位（如 010A），则构建为 subsystem + '00' + code = subsystem + '00' + '010A'
              // 例如：1 + '00' + '010A' = '100010A'
              errorCode = `${it.subsystem}00${codeWithoutPrefix}`;
            } else if (it.code) {
              // 不完整故障码（只有 code，如 010A 或 0X010A）：直接使用 code
              // 确保格式为 0X010A（parseSubsystemAndCode 需要至少5个字符才能提取 code）
              errorCode = it.code.startsWith('0X') || it.code.startsWith('0x') 
                ? it.code.toUpperCase() 
                : `0X${it.code.toUpperCase()}`;
            }
            
            const rendered = renderEntryExplanation({
              error_code: errorCode,
              param1: it.param1 || null,
              param2: it.param2 || null,
              param3: it.param3 || null,
              param4: it.param4 || null,
              explanation: it.explanation
            });
            parsedExplanation = rendered?.explanation || it.explanation || '';
          } catch (_) {
            // 解析失败，使用原始 explanation
            parsedExplanation = it.explanation || '';
          }
        }
        
        return {
          ref: `F${idx + 1}`,
          ...it,
          // 覆盖 explanation（必要时按参数解析）
          explanation: parsedExplanation,
          // 兼容 UI：确保 category 有可读值
          category: category || it.category || ''
        };
      });

      // 提供一个与 GET /error-codes 对齐的“故障码检索结果结构”，方便前端/调用方复用
      faultCodesSearch = {
        errorCodes: faultItems,
        total: faultItems.length,
        preview: faultCodesPreview,
        _meta: {
          recognized: hasFullCode
            ? { kind: 'full_code', input: recognizedCodes.fullCodes?.[0] || '' }
            : (hasTypeCodeOnly ? { kind: 'type_code', input: mergedTypeCodes?.[0] || '' } : { kind: 'keyword', input: keywords?.[0] || '' }),
          typeCodes: mergedTypeCodes || [],
          keywordAttempts: kwResp?.debug?.keywordAttempts || []
        }
      };
    }

    // Step 3-2/3-3: For find_case / troubleshoot, reuse /jira/search-mixed core logic (keyword + filters)
    let jiraSources = [];
    let faultCaseSources = [];
    let jiraError = null;
    let mongoDebug = null;

    // Ensure debug fields exist for later debug section
    let jira = null;
    let jiraJql = '';

    if ((intent === 'find_case' || intent === 'troubleshoot') && (limits.jira > 0 || limits.faultCases > 0)) {
      const searchTerms = uniq([...(q.keywords || []), ...(q.symptom || []), ...(q.trigger || [])]).slice(0, 12);
      const mixedQ = searchTerms.join(' ').trim() || String(query || '').trim();

      const mixedResp = await runJiraMongoMixedSearch({
        user: req.user,
        q: mixedQ,
        page: 1,
        limit: Math.max(limits.jira, limits.faultCases, 10),
        jiraWindow: Math.min(Math.max(limits.jira || 10, 10), 50),
        source: undefined, // SmartSearch default: search both
        modules: undefined,
        moduleKeys: undefined,
        statusKeys: undefined,
        updatedFrom: undefined,
        updatedTo: undefined,
        mine: false,
        mongoSearchTerms: searchTerms,
        mongoModules: q.component || []
      });

      // Extract JQL from mixed search response for debug display
      if (mixedResp?.jql) {
        jiraJql = mixedResp.jql;
      }

      // Extract MongoDB query debug info (not the entire response)
      if (mixedResp?.mongo_debug) {
        mongoDebug = {
          mixed: true,
          ...mixedResp.mongo_debug
        };
      } else {
        mongoDebug = { mixed: true, skipped: true, reason: 'no_mongo_query' };
      }

      // Jira error note (best-effort; mixed endpoint only returns message)
      if (mixedResp?.ok === false) {
        // Keep Jira failure as non-fatal; still return Mongo results (same as fault-case mixed search)
        jiraError = { message: mixedResp?.message || 'Jira 搜索失败', code: 'MIXED_SEARCH_FAILED', timeout: false };
        if (mixedResp?.message) missNotes.push(mixedResp.message);
      }

      const items = Array.isArray(mixedResp?.items) ? mixedResp.items : [];
      for (const it of items) {
        if (it?.source === 'jira') {
          if (jiraSources.length >= limits.jira) continue;
          const key = String(it?.key || it?.jira_key || '').trim();
          if (!key) continue;
          jiraSources.push({
            ref: `J${jiraSources.length + 1}`,
            key,
            summary: it?.summary || '',
            status: it?.status || '',
            updated: it?.updated || null,
            url: it?.url || '',
            module: it?.module || '',
            components: it?.components || [],
            projectName: it?.projectName || '',
            projectKey: it?.projectKey || '',
            resolution: it?.resolution || null,
            description: it?.description || '',
            customfield_10705: it?.customfield_10705 || '',
            customfield_10600: it?.customfield_10600 || ''
          });
        } else if (it?.source === 'mongo') {
          if (faultCaseSources.length >= limits.faultCases) continue;
          const id = String(it?.fault_case_id || '').trim();
          if (!id) continue;
          faultCaseSources.push({
            ref: `C${faultCaseSources.length + 1}`,
            id,
            title: it?.summary || '',
            module: it?.module || '',
            source: 'mongo',
            jira_key: it?.jira_key || '',
            updatedAt: it?.updated || null
          });
        }
      }

      if (!jiraSources.length && !jiraError && limits.jira > 0) missNotes.push('未在 Jira 中检索到匹配条目');
      if (!faultCaseSources.length && limits.faultCases > 0) missNotes.push('未在 MongoDB 故障案例中检索到匹配条目');
    } else {
      // Non find_case/troubleshoot: keep original Jira strategy (QueryPlan -> JQL)
      let jira = null;
      let jiraJql = '';
    if (!strategy.doJira || limits.jira <= 0) {
      jira = { ok: true, enabled: jiraCfg.enabled, items: [], issues: [], total: 0, page: 1, limit: 0 };
      if (!strategy.doJira) missNotes.push('按意图跳过 Jira 检索');
    } else {
      jiraJql = buildJqlFromQueryPlan(
        {
          symptom: q.symptom || [],
          trigger: q.trigger || [],
          fault_codes: mergedTypeCodes,
          neg: q.neg || [],
          days: q.days || 180
        },
        jiraCfg.projectKeys,
        {}
      );
      if (jiraJql) {
        try {
          jira = await searchIssues({ jql: jiraJql, limit: limits.jira });
        } catch (err) {
            jiraError = { message: err.message || 'Jira 连接失败', code: err.code || 'UNKNOWN', timeout: err.code === 'ETIMEDOUT' };
          jira = { ok: false, enabled: jiraCfg.enabled, items: [], issues: [], total: 0, page: 1, limit: 0, error: jiraError };
            missNotes.push(jiraError.timeout ? 'Jira 连接超时，无法检索历史案例' : 'Jira 连接失败，无法检索历史案例');
        }
      } else {
        jira = { ok: true, enabled: jiraCfg.enabled, items: [], issues: [], total: 0, page: 1, limit: 0 };
      }
    }

    const jiraItems = Array.isArray(jira?.items) ? jira.items : [];
      const jiraKeySeen = new Set();
      for (const x of jiraItems.slice(0, limits.jira)) {
        const key = String(x?.key || '').trim();
        if (!key) continue;
        const k = key.toUpperCase();
        if (jiraKeySeen.has(k)) continue;
        jiraKeySeen.add(k);
        jiraSources.push({
          ref: `J${jiraSources.length + 1}`,
          key,
          summary: x.summary,
          status: x.status,
          updated: x.updated,
          url: x.url,
          module: x.module,
          components: x.components || [],
          projectName: x.projectName || '',
          projectKey: x.projectKey || '',
          resolution: x.resolution || null,
          description: x.description || '',
          customfield_10705: x.customfield_10705 || '',
          customfield_10600: x.customfield_10600 || ''
        });
      }
      if (!jiraSources.length && !jiraError) missNotes.push('未在 Jira 中检索到匹配条目');
    }

    const answerText = buildAnswerText({
      recognized: { ...recognizedCodes, plan: { intent, query: q } },
      faultSources,
      jiraSources,
      faultCaseSources,
      missNotes
    });

    const meta = {
      lang: targetLang,
      elapsedMs: Date.now() - startedAt,
      jiraEnabled: !!jiraCfg.enabled,
      jiraConnected: !jiraError && jira?.ok !== false,
      jiraError: jiraError ? {
        message: jiraError.message,
        code: jiraError.code,
        timeout: jiraError.timeout
      } : null,
      llmEnabled: llmStatus.enabled,
      llmAvailable: llmStatus.available,
      llmReason: llmStatus.reason,
      llmProvider: providerPublic?.id || null,
      llmModel: providerPublic?.model || null
    };

    const out = {
      ok: true,
      queryPlan,
      answerText,
      recognized: {
        fullCodes: recognizedCodes.fullCodes || [],
        typeCodes: recognizedCodes.typeCodes || [],
        intent: intent,
        keywords: q.keywords || [],
        symptom: q.symptom || [],
        trigger: q.trigger || [],
        component: q.component || [],
        neg: q.neg || [],
        days: q.days || 180
      },
      missNotes: missNotes || [],
      sources: {
        faultCodes: faultSources,
        faultCodesPreview,
        faultCodesSearch,
        jira: jiraSources,
        faultCases: faultCaseSources
      },
      meta
    };

    // Merge Jira + MongoDB into a single "cases" list for UI (Jira first; de-dup by jira_key already applied)
    const mergedCases = [];
    const caseSeen = new Set();
    const pushCase = (c) => {
      if (!c) return;
      const jiraKey = String(c.jira_key || c.key || '').trim().toUpperCase();
      const dedupeKey = jiraKey ? `jira:${jiraKey}` : (c.id ? `id:${c.id}` : '');
      if (dedupeKey && caseSeen.has(dedupeKey)) return;
      if (dedupeKey) caseSeen.add(dedupeKey);
      mergedCases.push({ ...c, ref: `K${mergedCases.length + 1}` });
    };
    for (const j of jiraSources || []) {
      pushCase({
        type: 'jira',
        jira_key: j.key,
        key: j.key,
        title: j.summary || '',
        summary: j.summary || '',
        status: j.status || '',
        updated: j.updated || '',
        url: j.url || '',
        module: j.module || '',
        components: j.components || [],
        projectName: j.projectName || '',
        projectKey: j.projectKey || '',
        resolution: j.resolution || null,
        description: j.description || '',
        customfield_10705: j.customfield_10705 || '',
        customfield_10600: j.customfield_10600 || ''
      });
    }
    for (const c of faultCaseSources || []) {
      pushCase({
        type: 'mongo',
        id: c.id,
        jira_key: c.jira_key || '',
        title: c.title || '',
        module: c.module || '',
        source: c.source || 'manual',
        updatedAt: c.updatedAt || null
      });
    }
    out.sources.cases = mergedCases;

    if (includeDebug) {
      // Merge queryPlan and planner into a single structure
      const mergedQueryPlan = {
        ...queryPlan,
        planner: {
          recognizedCodes,
          mergedTypeCodes,
          keywords,
          intent,
          strategy
        }
      };
      out.debug = {
        llmStatus,
        llm: { provider: providerPublic },
        llmPrompt: {
          messages: buildQueryPlanExtractionMessages(query, { days: 180 })
        },
        llmRaw: llm?.raw || null,
        queryPlan: mergedQueryPlan,
        errorCodes: {
          typeCodes: typeResp.debug.typeCodes,
          keywordAttempts: kwResp.debug.keywordAttempts
        },
        jira: {
          enabled: !!jiraCfg?.enabled,
          // In find_case/troubleshoot we use mixed search (no JQL); otherwise show JQL
          jql: (typeof jiraJql !== 'undefined' ? (jiraJql || jira?.jql || '') : ''),
          error: jiraError ? { message: jiraError.message, code: jiraError.code, timeout: jiraError.timeout } : null
        },
        mongo: mongoDebug
      };
    }

    fireAndForgetOperationLog({
      operation: 'smart_search',
      description: `智能搜索: ${truncateString(query, 120)}`,
      user_id: req.user?.id ?? null,
      username: req.user?.username ?? '',
      status: 'success',
      ip: getClientIp(req),
      user_agent: req.headers?.['user-agent'] || '',
      details: buildSmartSearchLogDetails({
        operationId,
        query,
        limits,
        includeDebug,
        lang: targetLang,
        llmResponseRaw: llm?.raw || null
      })
    });

    return res.json(out);
  } catch (err) {
    console.error('[smart-search] failed:', err);

    fireAndForgetOperationLog({
      operation: 'smart_search',
      description: `智能搜索（异常）: ${truncateString(queryForLog || req.body?.query || '', 120)}`,
      user_id: req.user?.id ?? null,
      username: req.user?.username ?? '',
      status: 'failed',
      ip: getClientIp(req),
      user_agent: req.headers?.['user-agent'] || '',
      details: buildSmartSearchLogDetails({
        operationId,
        query: queryForLog || String(req.body?.query || '').trim(),
        limits: req.body?.limits || null,
        includeDebug: req.body?.debug === true || req.body?.includeDebug === true || req.query?.debug === '1',
        lang: normalizeLang(req),
        llmResponseRaw: null
      })
    });

    return res.status(500).json({ ok: false, message: 'smart search failed', error: err.message });
  }
}

// Debug-only: stream the raw Qwen output via SSE so users can see prompt + streaming chunks.
async function smartSearchLlmStream(req, res) {
  const query = String(req.query?.q || req.query?.query || '').trim();
  const providerId = String(req.query?.providerId || req.query?.provider || '').trim();
  if (!query) return res.status(400).json({ ok: false, message: 'q 不能为空' });

  const llmStatus = getSmartSearchLlmStatus(providerId);
  if (!llmStatus.available) {
    return res.status(400).json({
      ok: false,
      message: 'LLM 不可用',
      llmStatus
    });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  });

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const provider = resolveProvider(providerId);
    send('meta', { ok: true, provider: provider ? { id: provider.id, label: provider.label } : null, model: provider?.model || null, llmStatus });
    send('prompt', { messages: buildKeywordExtractionMessages(query) });

    const result = await streamKeywordExtractionWithProvider({
      providerId,
      query,
      onDelta: (delta) => send('chunk', { delta }),
      onUsage: (usage) => send('usage', { usage })
    });

    send('final', {
      ok: true,
      model: result.model,
      fullContent: result.fullContent,
      parsed: result.parsed,
      keywords: result.keywords,
      usage: result.usage
    });
    send('done', { ok: true });
    res.end();
  } catch (e) {
    send('error', { ok: false, message: String(e?.message || e), code: e?.code || '' });
    res.end();
  }
}

module.exports = {
  smartSearch,
  smartSearchLlmStream,
  smartSearchLlmProviders: (req, res) => {
    const providers = getProvidersPublic();
    const defaultProviderId = String(process.env.SMART_SEARCH_LLM_DEFAULT_PROVIDER || providers?.[0]?.id || '').trim() || null;
    return res.json({ ok: true, providers, defaultProviderId });
  }
};


