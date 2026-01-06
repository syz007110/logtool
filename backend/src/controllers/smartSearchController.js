const { Op } = require('sequelize');
const crypto = require('crypto');

const ErrorCode = require('../models/error_code');
const I18nErrorCode = require('../models/i18n_error_code');
const AnalysisCategory = require('../models/analysis_category');
const { searchIssues, getJiraConfig, buildJqlFromQueryPlan } = require('../services/jiraService');
const { ensureCacheReady, renderEntryExplanation } = require('../services/logParsingService');
const {
  getQwenConfig,
  extractQueryPlanWithQwen,
  buildQueryPlanExtractionMessages,
  streamKeywordExtractionWithQwen,
  buildKeywordExtractionMessages
} = require('../services/qwenService');

const DEFAULT_LIMITS = {
  errorCodes: 10,
  jira: 10
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

function getSmartSearchLlmStatus() {
  // SmartSearch is ONLY available when LLM is integrated and quota is sufficient.
  const enabled = parseBool(process.env.SMART_SEARCH_LLM_ENABLED);
  const hasApiKey = !!String(process.env.DASHSCOPE_API_KEY || '').trim();
  const remainingTokensRaw = process.env.SMART_SEARCH_LLM_TOKEN_REMAINING ?? process.env.SMART_SEARCH_LLM_TOKENS_REMAINING;
  const remainingTokens = remainingTokensRaw !== undefined ? Number.parseInt(String(remainingTokensRaw), 10) : null;

  const quotaExhausted = parseBool(process.env.SMART_SEARCH_LLM_QUOTA_EXHAUSTED);
  const tokenExhausted = Number.isFinite(remainingTokens) && remainingTokens <= 0;

  const available = enabled && hasApiKey && !quotaExhausted && !tokenExhausted;

  let reason = 'ok';
  if (!enabled) reason = 'not_enabled';
  else if (!hasApiKey) reason = 'missing_api_key';
  else if (quotaExhausted) reason = 'quota_exhausted';
  else if (tokenExhausted) reason = 'token_exhausted';

  return { enabled, available, reason, remainingTokens, hasApiKey };
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

  const kwList = (keywords || []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, 12);
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

  return { items: out.slice(0, limit), debug: { keywordAttempts: used } };
}

async function getErrorCodesByTypeCodes({ typeCodes, targetLang, limit }) {
  const codes = (typeCodes || []).map((x) => normalizeTypeCode(x)).filter(Boolean).slice(0, 12);
  if (!codes.length) return { items: [], debug: { typeCodes: [] } };

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

  return { items: out, debug: { typeCodes: codes } };
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

function buildAnswerText({ recognized, faultSources, jiraSources, missNotes }) {
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

  const misses = Array.isArray(missNotes) ? missNotes.filter(Boolean) : [];
  if (misses.length) {
    lines.push('④ 未检索到的部分');
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
    queryForLog = query;
    if (!query) {
      return res.status(400).json({ ok: false, message: 'query 不能为空' });
    }

    const targetLang = normalizeLang(req);
    const limits = {
      errorCodes: clampInt(body?.limits?.errorCodes, 1, 30, DEFAULT_LIMITS.errorCodes),
      jira: clampInt(body?.limits?.jira, 0, 50, DEFAULT_LIMITS.jira)
    };
    const includeDebug = body?.debug === true || body?.includeDebug === true || req.query?.debug === '1';

    const llmStatus = getSmartSearchLlmStatus();
    if (!llmStatus.available) {
      const answerText = '当前未接入大模型或额度已用完，请使用经典面板进行搜索。';
      const meta = {
        lang: targetLang,
        elapsedMs: Date.now() - startedAt,
        jiraEnabled: !!getJiraConfig().enabled,
        llmEnabled: llmStatus.enabled,
        llmAvailable: llmStatus.available,
        llmReason: llmStatus.reason
      };
      const responsePayload = {
        ok: true,
        queryPlan: { mode: 'disabled', query },
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

    const qwenCfg = getQwenConfig();
    const jiraCfg = getJiraConfig();

    // Step 1: rule-based fault code recognition (before LLM)
    const recognizedCodes = extractFaultCodesFromText(query);

    // Step 2: LLM extracts minimal QueryPlan JSON (no JQL/SQL)
    let llm = null;
    try {
      llm = await extractQueryPlanWithQwen({ query, defaults: { days: 180 } });
    } catch (e) {
      const answerText = '大模型调用失败，请使用经典面板进行搜索。';
      const meta = {
        lang: targetLang,
        elapsedMs: Date.now() - startedAt,
        jiraEnabled: !!jiraCfg.enabled,
        llmEnabled: llmStatus.enabled,
        llmAvailable: false,
        llmReason: e?.code || 'llm_call_failed'
      };
      const responsePayload = {
        ok: true,
        queryPlan: { mode: 'llm_failed', query },
        answerText,
        sources: { faultCodes: [], jira: [] },
        suggestedRoutes: [
          { label: '故障码搜索', path: '/dashboard/error-codes' },
          { label: '故障案例搜索', path: '/dashboard/fault-cases' }
        ],
        meta,
        ...(includeDebug ? { debug: { llmStatus, llmError: String(e?.message || e), qwen: { model: qwenCfg.model } } } : {})
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

    const plan = llm?.plan || { intent: 'other', query: { fault_codes: [], symptom: [], trigger: [], component: [], neg: [], days: 180 } };
    const intent = plan.intent || 'other';
    const q = plan.query || { fault_codes: [], symptom: [], trigger: [], component: [], neg: [], days: 180 };

    const mergedTypeCodes = uniq([
      ...(recognizedCodes.typeCodes || []),
      ...(q.fault_codes || [])
    ].map(normalizeTypeCode).filter(Boolean));

    // If nothing extracted and no fault code recognized, guide user to classic panels
    const hasAnyIntent = mergedTypeCodes.length ||
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
        llmModel: qwenCfg.model
      };
      const responsePayload = {
        ok: true,
        queryPlan: { mode: 'llm_query_plan', query, model: qwenCfg.model, plan },
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
            qwen: { model: qwenCfg.model },
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

    const queryPlan = { mode: 'llm_query_plan', query, model: qwenCfg.model, plan };

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
      const answerText =
        '我可以帮你做“故障码库 + Jira 历史案例”的智能检索（不做知识性自由回答）。\n\n' +
        '你可以这样问：\n' +
        '- “165100A 是什么故障？”（查故障码）\n' +
        '- “断网 插拔器械 有人遇到吗？”（找历史案例）\n' +
        '- “010A 断网 怎么排查？”（排查/修复）\n\n' +
        '也可以直接使用经典面板进行检索。';
      const meta = {
        lang: targetLang,
        elapsedMs: Date.now() - startedAt,
        jiraEnabled: !!jiraCfg.enabled,
        llmEnabled: llmStatus.enabled,
        llmAvailable: llmStatus.available,
        llmReason: llmStatus.reason,
        llmModel: qwenCfg.model
      };
      const responsePayload = {
        ok: true,
        queryPlan,
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
            qwen: { model: qwenCfg.model },
            llmPrompt: { messages: buildQueryPlanExtractionMessages(query, { days: 180 }) },
            llmRaw: llm?.raw || null,
            queryPlan: {
              ...queryPlan,
              planner: { recognizedCodes, mergedTypeCodes, intent, strategy }
            }
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
      const answerText =
        '我目前没有接入“知识库/百科”，无法对概念类问题做可靠解释。\n' +
        '但我可以帮你在“故障码库 + Jira 历史案例”里检索。\n\n' +
        '请补充：故障码（如 165100A / 010A）或现象关键词（如 断网/抖动/报警），或直接使用经典面板。';
      const meta = {
        lang: targetLang,
        elapsedMs: Date.now() - startedAt,
        jiraEnabled: !!jiraCfg.enabled,
        llmEnabled: llmStatus.enabled,
        llmAvailable: llmStatus.available,
        llmReason: llmStatus.reason,
        llmModel: qwenCfg.model
      };
      const responsePayload = {
        ok: true,
        queryPlan,
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
            qwen: { model: qwenCfg.model },
            llmPrompt: { messages: buildQueryPlanExtractionMessages(query, { days: 180 }) },
            llmRaw: llm?.raw || null,
            queryPlan: {
              ...queryPlan,
              planner: { recognizedCodes, mergedTypeCodes, intent, strategy }
            }
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

    // Step 3-1: Fault code retrieval
    const missNotes = [];

    // Full fault code: explain first (no params), then fetch its record (subsystem + type code)
    let fullExplanation = null;
    if (recognizedCodes.fullCodes && recognizedCodes.fullCodes.length) {
      try {
        await ensureCacheReady();
        const fc = recognizedCodes.fullCodes[0];
        const rendered = renderEntryExplanation({ error_code: fc, param1: null, param2: null, param3: null, param4: null });
        fullExplanation = rendered?.explanation || null;
      } catch (_) {
        fullExplanation = null;
      }
    }

    const keywords = uniq([...(q.symptom || []), ...(q.trigger || []), ...(q.component || [])]).slice(0, 12);

    let faultSources = [];
    let typeResp = { items: [], debug: { typeCodes: [] } };
    let kwResp = { items: [], debug: { keywordAttempts: [] } };
    if (!strategy.doFault) {
      missNotes.push('按意图跳过故障码检索');
    } else {
      let exactRecord = null;
      const hasFullCode = recognizedCodes.fullCodes && recognizedCodes.fullCodes.length > 0;
      const hasTypeCodeOnly = !hasFullCode && mergedTypeCodes.length > 0;

      // 有完整故障码时：使用完整故障码检索
      if (hasFullCode) {
        const fc = recognizedCodes.fullCodes[0];
        const subsystem = fc.charAt(0);
        const typeCode = normalizeTypeCode(fc.slice(-4));
        if (subsystem && typeCode) {
          exactRecord = await getErrorCodeBySubsystemAndCode({ subsystem, code: typeCode, targetLang });
          if (exactRecord) exactRecord._match = { type: 'full_code', fullCode: fc };
        }
      }

      // 只有不完整的故障码（故障类型）时：使用故障类型检索所有子系统
      if (hasTypeCodeOnly) {
        typeResp = await getErrorCodesByTypeCodes({
          typeCodes: mergedTypeCodes,
          targetLang,
          limit: limits.errorCodes
        });
      }

      // 关键词检索（作为补充）
      if (keywords.length > 0) {
        kwResp = await searchErrorCodesByKeywords({
          keywords,
          targetLang,
          limit: limits.errorCodes
        });
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
        return {
          ref: `F${idx + 1}`,
          id: it.id,
          subsystem: it.subsystem,
          code: it.code,
          short_message: it.short_message || '',
          user_hint: it.user_hint || '',
          operation: it.operation || '',
          detail: it.detail || '',
          method: it.method || '',
          param1: it.param1 || '',
          param2: it.param2 || '',
          param3: it.param3 || '',
          param4: it.param4 || '',
          tech_solution: it.tech_solution || '',
          explanation: fullExplanation || it.explanation || '',
          category: category
        };
      });
    }

    // Step 3-2: Jira retrieval (compile QueryPlan -> safe JQL)
    let jira = null;
    let jiraJql = '';
    let jiraError = null;
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
          // Jira 连接失败，但不影响其他检索
          jiraError = {
            message: err.message || 'Jira 连接失败',
            code: err.code || 'UNKNOWN',
            timeout: err.code === 'ETIMEDOUT'
          };
          jira = { ok: false, enabled: jiraCfg.enabled, items: [], issues: [], total: 0, page: 1, limit: 0, error: jiraError };
          // 添加提示信息
          const errorMsg = jiraError.timeout ? 'Jira 连接超时，无法检索历史案例' : 'Jira 连接失败，无法检索历史案例';
          missNotes.push(errorMsg);
        }
      } else {
        jira = { ok: true, enabled: jiraCfg.enabled, items: [], issues: [], total: 0, page: 1, limit: 0 };
      }
    }

    const jiraItems = Array.isArray(jira?.items) ? jira.items : [];
    const jiraSources = jiraItems.slice(0, limits.jira).map((x, idx) => ({
      ref: `J${idx + 1}`,
      key: x.key,
      summary: x.summary,
      status: x.status,
      updated: x.updated,
      url: x.url,
      module: x.module
    }));
    if (!jiraSources.length && !jiraError) {
      missNotes.push('未在 Jira 中检索到匹配条目');
    }

    const answerText = buildAnswerText({
      recognized: { ...recognizedCodes, plan: { intent, query: q } },
      faultSources,
      jiraSources,
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
      llmModel: qwenCfg.model
    };

    const out = {
      ok: true,
      queryPlan,
      answerText,
      recognized: {
        fullCodes: recognizedCodes.fullCodes || [],
        typeCodes: recognizedCodes.typeCodes || [],
        intent: intent,
        symptom: q.symptom || [],
        trigger: q.trigger || [],
        component: q.component || [],
        neg: q.neg || [],
        days: q.days || 180
      },
      missNotes: missNotes || [],
      sources: {
        faultCodes: faultSources,
        jira: jiraSources
      },
      meta
    };

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
        qwen: { model: qwenCfg.model },
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
          enabled: !!jira?.enabled,
          jql: jiraJql || jira?.jql || ''
        }
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
  if (!query) return res.status(400).json({ ok: false, message: 'q 不能为空' });

  const llmStatus = getSmartSearchLlmStatus();
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
    const qwenCfg = getQwenConfig();
    send('meta', { ok: true, model: qwenCfg.model, llmStatus });
    send('prompt', { messages: buildKeywordExtractionMessages(query) });

    const result = await streamKeywordExtractionWithQwen({
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
  smartSearchLlmStream
};


