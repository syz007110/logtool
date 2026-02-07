const http = require('http');
const https = require('https');
const url = require('url');
const path = require('path');
const fs = require('fs');
const smartSearchPrompts = require('../config/smartSearchPrompts.json');

function normalizeBaseUrl(baseUrl) {
  const s = String(baseUrl || '').trim();
  if (!s) return '';
  return s.replace(/\/+$/, '');
}

function safeJsonParse(s) {
  try {
    return JSON.parse(String(s || ''));
  } catch (_) {
    return null;
  }
}

function clampInt(n, min, max, fallback) {
  const v = Number.parseInt(String(n ?? ''), 10);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(Math.max(v, min), max);
}

function parseBool(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function getDefaultProviderSpecs() {
  // Backward compatible: if SMART_SEARCH_LLM_PROVIDERS is not set, keep existing Qwen config.
  return [
    {
      id: 'qwen',
      label: 'Qwen',
      kind: 'openai_compatible',
      requiresApiKey: true,
      apiKeyEnv: 'DASHSCOPE_API_KEY',
      baseUrlEnv: 'DASHSCOPE_BASE_URL',
      modelEnv: 'SMART_SEARCH_QWEN_MODEL',
      defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      defaultModel: 'qwen-flash'
    }
  ];
}

function getProviderSpecsFromEnv() {
  // Option 1: JSON file config (recommended - easier to maintain than single-line env JSON)
  const filePath = String(process.env.SMART_SEARCH_LLM_PROVIDERS_FILE || '').trim();
  if (filePath) {
    try {
      // Relative paths are resolved from backend/ (repoRoot/backend)
      const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(__dirname, '..', '..', filePath);
      if (fs.existsSync(fullPath)) {
        const fileContent = fs.readFileSync(fullPath, 'utf8');
        const parsed = safeJsonParse(fileContent);
        if (Array.isArray(parsed)) {
          return parsed.filter((x) => x && typeof x === 'object');
        }
      }
      console.warn('[smart-search-llm] SMART_SEARCH_LLM_PROVIDERS_FILE not found:', fullPath);
    } catch (err) {
      console.warn('[smart-search-llm] Failed to load providers from file:', err?.message || err);
    }
  }

  // Option 2: env variable (must be single-line JSON)
  const raw = String(process.env.SMART_SEARCH_LLM_PROVIDERS || '').trim();
  if (!raw) return getDefaultProviderSpecs();
  const parsed = safeJsonParse(raw);
  if (!Array.isArray(parsed)) return getDefaultProviderSpecs();
  return parsed.filter((x) => x && typeof x === 'object');
}

function hydrateProvider(spec) {
  const timeoutMs = clampInt(
    spec.timeoutMs ?? process.env.SMART_SEARCH_LLM_TIMEOUT_MS ?? '12000',
    1000,
    120000,
    12000
  );

  // Temperature: 0-2, default 0 (deterministic)
  const temperature = (() => {
    const raw = spec.temperature;
    if (raw === null || raw === undefined) return 0;
    const v = Number.parseFloat(String(raw));
    if (!Number.isFinite(v)) return 0;
    return Math.min(Math.max(v, 0), 2);
  })();

  // Top-p: 0-1, default 0.1
  const topP = (() => {
    const raw = spec.top_p ?? spec.topP;
    if (raw === null || raw === undefined) return 0.1;
    const v = Number.parseFloat(String(raw));
    if (!Number.isFinite(v)) return 0.1;
    return Math.min(Math.max(v, 0), 1);
  })();

  const requiresApiKey = Object.prototype.hasOwnProperty.call(spec, 'requiresApiKey')
    ? !!spec.requiresApiKey
    : true;

  const apiKeyEnv = String(spec.apiKeyEnv || '').trim();
  const apiKey =
    String(spec.apiKey || (apiKeyEnv ? (process.env[apiKeyEnv] || process.env[apiKeyEnv.toUpperCase()] || '') : '') || '').trim();
  const baseUrl = normalizeBaseUrl(String(spec.baseUrl || (spec.baseUrlEnv ? process.env[spec.baseUrlEnv] : '') || spec.defaultBaseUrl || ''));
  const model = String(spec.model || (spec.modelEnv ? process.env[spec.modelEnv] : '') || spec.defaultModel || '').trim();

  return {
    id: String(spec.id || '').trim(),
    label: String(spec.label || spec.id || '').trim() || String(spec.id || '').trim(),
    kind: String(spec.kind || 'openai_compatible').trim(),
    requiresApiKey,
    apiKeyEnv,
    apiKey,
    baseUrl,
    model,
    timeoutMs,
    temperature,
    topP
  };
}

function getAllProviders() {
  const specs = getProviderSpecsFromEnv();
  const out = [];
  const seen = new Set();
  for (const s of specs) {
    const p = hydrateProvider(s);
    if (!p.id) continue;
    const key = p.id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  // If env misconfigured to empty array, still fallback to qwen
  if (!out.length) return getDefaultProviderSpecs().map(hydrateProvider);
  return out;
}

function resolveProvider(providerId) {
  const providers = getAllProviders();
  const want = String(providerId || '').trim();
  const defaultId = String(process.env.SMART_SEARCH_LLM_DEFAULT_PROVIDER || '').trim();
  const pick =
    (want && providers.find((p) => p.id === want)) ||
    (defaultId && providers.find((p) => p.id === defaultId)) ||
    providers[0] ||
    null;
  return pick;
}

function getSmartSearchLlmStatusForProvider(provider) {
  // Global quota switches (kept for backward compatibility)
  const enabled = parseBool(process.env.SMART_SEARCH_LLM_ENABLED);
  const remainingTokensRaw = process.env.SMART_SEARCH_LLM_TOKEN_REMAINING ?? process.env.SMART_SEARCH_LLM_TOKENS_REMAINING;
  const remainingTokens = remainingTokensRaw !== undefined ? Number.parseInt(String(remainingTokensRaw), 10) : null;
  const quotaExhausted = parseBool(process.env.SMART_SEARCH_LLM_QUOTA_EXHAUSTED);
  const tokenExhausted = Number.isFinite(remainingTokens) && remainingTokens <= 0;

  const hasApiKey = provider ? !!String(provider.apiKey || '').trim() : false;
  const hasBaseUrl = provider ? !!String(provider.baseUrl || '').trim() : false;
  const hasModel = provider ? !!String(provider.model || '').trim() : false;

  const missingApiKey = provider ? (provider.requiresApiKey && !hasApiKey) : true;

  const available = !!(
    provider &&
    enabled &&
    !quotaExhausted &&
    !tokenExhausted &&
    !missingApiKey &&
    hasBaseUrl &&
    hasModel
  );

  let reason = 'ok';
  if (!provider) reason = 'unknown_provider';
  else if (!enabled) reason = 'not_enabled';
  else if (quotaExhausted) reason = 'quota_exhausted';
  else if (tokenExhausted) reason = 'token_exhausted';
  else if (missingApiKey) reason = 'missing_api_key';
  else if (!hasBaseUrl) reason = 'missing_base_url';
  else if (!hasModel) reason = 'missing_model';

  return {
    enabled,
    available,
    reason,
    remainingTokens,
    provider: provider
      ? { id: provider.id, label: provider.label, kind: provider.kind, model: provider.model }
      : null
  };
}

function getProvidersPublic() {
  const providers = getAllProviders();
  return providers.map((p) => {
    const status = getSmartSearchLlmStatusForProvider(p);
    return {
      id: p.id,
      label: p.label,
      kind: p.kind,
      model: p.model,
      available: status.available,
      reason: status.reason
    };
  });
}

function renderPromptTemplate(template, vars) {
  const s = String(template ?? '');
  return s.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const v = vars && Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : '';
    return String(v);
  });
}

function buildKeywordExtractionMessages(query) {
  const prompt = String(query || '').trim();
  const promptConfig = smartSearchPrompts?.keywordExtraction || {};
  const systemPrompt = Array.isArray(promptConfig.system)
    ? promptConfig.system.join('\n')
    : String(promptConfig.system || '').trim();
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt }
  ];
}

function buildQueryPlanExtractionMessages(query, defaults = {}) {
  const prompt = String(query || '').trim();
  const daysFallback = Number.isFinite(Number(defaults.days)) ? Number(defaults.days) : 180;
  const promptConfig = smartSearchPrompts?.queryPlanExtraction || {};
  const systemTemplate = Array.isArray(promptConfig.system)
    ? promptConfig.system.join('\n')
    : String(promptConfig.system || '').trim();
  return [
    { role: 'system', content: renderPromptTemplate(systemTemplate, { daysFallback }) },
    { role: 'user', content: prompt }
  ];
}

function extractFirstJsonObject(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  const start = s.indexOf('{');
  if (start < 0) return null;
  const end = s.lastIndexOf('}');
  if (end <= start) return null;
  const slice = s.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch (_) {
    return null;
  }
}

// --- Intent AST → Query DSL (semantic normalization + compile) ---
let nlpMappingsCache = null;
function loadNlpMappings() {
  if (nlpMappingsCache) return nlpMappingsCache;
  try {
    const p = path.join(__dirname, '../config/nlpMappings.json');
    const raw = fs.readFileSync(p, 'utf8');
    nlpMappingsCache = JSON.parse(raw);
  } catch (_) {
    nlpMappingsCache = {};
  }
  return nlpMappingsCache;
}

function buildAliasToCanonical(mappings, key) {
  const out = Object.create(null);
  const obj = mappings && mappings[key];
  if (!obj || typeof obj !== 'object') return out;
  for (const [canonical, aliases] of Object.entries(obj)) {
    const list = Array.isArray(aliases) ? aliases : [aliases];
    for (const a of list) {
      const v = String(a ?? '').trim();
      if (!v) continue;
      out[v] = canonical;
      const lower = v.toLowerCase();
      if (lower !== v) out[lower] = canonical;
    }
  }
  return out;
}

const TIME_FORMAT_RE = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/;
const ALLOWED_FIELDS = new Set(['timestamp', 'error_code', 'param1', 'param2', 'param3', 'param4', 'explanation']);
const ALLOWED_OPS = new Set(['=', '!=', '>', '>=', '<', '<=', 'between', 'contains', 'notcontains', 'regex', 'startsWith', 'endsWith']);

// 故障码类型：3~6 位十六进制 + A-E，与智能搜索 queryPlan 中 fault_codes 一致
const FAULT_CODE_PATTERN = /(?:0x)?[0-9A-Fa-f]{3,6}[A-E]/g;

function normalizeTypeCodeForBatch(input) {
  const raw = String(input ?? '').trim().toUpperCase().replace(/^0X/, '');
  if (!raw) return '';
  const last4 = raw.length >= 4 ? raw.slice(-4) : raw;
  if (/^[0-9A-F]{3}[A-E]$/.test(last4)) return `0X${last4}`;
  return '';
}

/**
 * 第一步：从用户输入中识别是否含有故障码（如 610A、0x010A）。
 * 若有则返回归一化后的故障码（0xXXXX），供编译阶段强制加入 error_code 条件。
 */
function detectFaultCodeFromText(text) {
  if (!text || typeof text !== 'string') return null;
  const matches = text.match(FAULT_CODE_PATTERN);
  if (!matches || matches.length === 0) return null;
  for (const m of matches) {
    const norm = normalizeTypeCodeForBatch(m);
    if (norm) return norm;
  }
  return null;
}

function resolveRelativeTime(value, unit) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const now = new Date();
  let start = new Date(now);
  if (unit === 'minutes') start.setMinutes(start.getMinutes() - n);
  else if (unit === 'hours') start.setHours(start.getHours() - n);
  else if (unit === 'days') start.setDate(start.getDate() - n);
  else return null;
  const pad = (x) => String(x).padStart(2, '0');
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return { start_time: fmt(start), end_time: fmt(now) };
}

/**
 * Compile Intent AST (LLM semantic output) to Query DSL { search, start_time, end_time, filters }.
 * - time → start_time / end_time
 * - keyword or single keywordPhrases → search; multiple keywordPhrases → explanation contains + keywordLogic
 * - conditions → field conditions via synonym mapping; logic for combining them
 * - keyword group and field group merged with AND when both present
 * - options.detectedFaultCode: 若在用户输入中先识别到故障码，则最终查询强制带上 error_code 条件（参考智能搜索）
 * - modifiers.firstOccurrence reserved for future use (e.g. sort and take first)
 */
function intentAstToQueryDsl(ast, options) {
  const out = { search: null, start_time: null, end_time: null, filters: null };
  if (!ast || typeof ast !== 'object') return out;
  const detectedFaultCode = options && options.detectedFaultCode ? String(options.detectedFaultCode).trim() : null;

  const mappings = loadNlpMappings();
  const aliasToField = buildAliasToCanonical(mappings, 'fields');
  const aliasToOp = buildAliasToCanonical(mappings, 'operators');
  const lookups = mappings.lookups && typeof mappings.lookups === 'object' ? mappings.lookups : {};

  // --- Time (accept both time.type and time.relative/time.absolute) ---
  const time = ast.time;
  if (time && typeof time === 'object') {
    let rel = null;
    let abs = null;
    if (time.type === 'relative' || time.relative) {
      const r = time.relative || time;
      rel = { value: r.value, unit: r.unit };
    }
    if (time.type === 'absolute' || time.absolute) {
      const a = time.absolute || time;
      abs = { start: a.start, end: a.end };
    }
    if (abs && (abs.start || abs.end)) {
      const s = String(abs.start || '').trim();
      const e = String(abs.end || '').trim();
      if (TIME_FORMAT_RE.test(s)) out.start_time = s;
      if (TIME_FORMAT_RE.test(e)) out.end_time = e;
    }
    if (rel && (rel.value != null || rel.unit)) {
      const resolved = resolveRelativeTime(rel.value, rel.unit);
      if (resolved) {
        out.start_time = resolved.start_time;
        out.end_time = resolved.end_time;
      }
    }
  }

  // --- 收集 conditions 中的值，用于关键词去重（conditions 更准确，重复的以 conditions 为准）---
  const conditionValueSet = new Set();
  const rawConditions = Array.isArray(ast.conditions) ? ast.conditions : [];
  for (const c of rawConditions) {
    if (!c || typeof c !== 'object') continue;
    const v = c.value;
    if (v == null) continue;
    if (Array.isArray(v)) {
      v.forEach((x) => {
        const s = String(x).trim();
        if (s) conditionValueSet.add(s.toLowerCase());
        const norm = normalizeTypeCodeForBatch(s);
        if (norm) conditionValueSet.add(norm.toLowerCase());
      });
    } else {
      const s = String(v).trim();
      if (s) conditionValueSet.add(s.toLowerCase());
      const norm = normalizeTypeCodeForBatch(s);
      if (norm) conditionValueSet.add(norm.toLowerCase());
    }
  }

  const isCoveredByCondition = (kw) => {
    const t = String(kw ?? '').trim();
    if (!t) return true;
    if (conditionValueSet.has(t.toLowerCase())) return true;
    const norm = normalizeTypeCodeForBatch(t);
    if (norm && conditionValueSet.has(norm.toLowerCase())) return true;
    return false;
  };

  // --- Keywords: 合并 keyword 与 keywordPhrases，去掉已出现在 conditions 中的词（conditions 更准确）---
  const phrases = Array.isArray(ast.keywordPhrases) ? ast.keywordPhrases : [];
  const keywordLogic = String(ast.keywordLogic || 'AND').trim().toUpperCase();
  const kwLogic = keywordLogic === 'OR' ? 'OR' : 'AND';

  const singleKeyword = typeof ast.keyword === 'string' && ast.keyword.trim() ? ast.keyword.trim() : null;
  const phraseTexts = phrases
    .map((p) => (typeof p === 'object' && p != null ? String(p.text ?? '').trim() : String(p).trim()))
    .filter(Boolean);
  let allKeywords = singleKeyword && !phraseTexts.includes(singleKeyword)
    ? [singleKeyword, ...phraseTexts]
    : phraseTexts.length > 0 ? phraseTexts : (singleKeyword ? [singleKeyword] : []);
  allKeywords = allKeywords.filter((k) => !isCoveredByCondition(k));

  let keywordGroup = null;
  if (allKeywords.length === 0) {
    // 无关键词，不设置 search / keywordGroup
  } else if (allKeywords.length === 1) {
    let val = allKeywords[0];
    if (lookups.kw2canon && lookups.kw2canon[val] != null) val = lookups.kw2canon[val];
    out.search = val;
  } else {
    const kwConditions = [];
    for (const t of allKeywords) {
      let val = t;
      if (lookups.kw2canon && lookups.kw2canon[t] != null) val = lookups.kw2canon[t];
      kwConditions.push({ field: 'explanation', operator: 'contains', value: val });
    }
    if (kwConditions.length > 0) keywordGroup = { logic: kwLogic, conditions: kwConditions };
  }

  // --- Field conditions ---
  const conditions = Array.isArray(ast.conditions) ? ast.conditions : [];
  const logic = String(ast.logic || 'AND').trim().toUpperCase();
  const condLogic = logic === 'OR' ? 'OR' : 'AND';
  const compiled = [];

  for (const c of conditions) {
    if (!c || typeof c !== 'object') continue;
    const fieldLabel = String(c.fieldLabel ?? c.field ?? '').trim();
    const operatorLabel = String(c.operatorLabel ?? c.operator ?? '').trim();
    let value = c.value;

    const field = aliasToField[fieldLabel] || aliasToField[fieldLabel.toLowerCase()];
    const operator = aliasToOp[operatorLabel] || aliasToOp[operatorLabel.toLowerCase()];
    if (!field || !ALLOWED_FIELDS.has(field)) continue;
    if (!operator || !ALLOWED_OPS.has(operator)) continue;

    if (operator === 'between') {
      const arr = Array.isArray(value) ? value : [value, value];
      if (arr.length < 2) continue;
      value = [arr[0], arr[1]];
    } else {
      if (value === undefined || value === null) continue;
    }

    if (lookups.kw2canon && field === 'explanation' && typeof value === 'string') {
      const v = lookups.kw2canon[value] ?? lookups.kw2canon[value.trim()];
      if (v != null) value = v;
    }

    // 故障码用 contains 而非等于，用户可能输入不完整故障码（如 610A 而非完整 1651610A）
    let op = operator;
    if (field === 'error_code' && op === '=') op = 'contains';

    compiled.push({ field, operator: op, value });
  }

  // 若第一步已识别到故障码且当前没有 error_code 条件，则强制加入（与智能搜索一致：有故障码则必查故障码）
  if (detectedFaultCode) {
    const hasErrorCodeCondition = compiled.some((c) => c && c.field === 'error_code');
    if (!hasErrorCodeCondition) {
      compiled.push({ field: 'error_code', operator: 'contains', value: detectedFaultCode });
    }
  }

  const fieldGroup = compiled.length > 0 ? { logic: condLogic, conditions: compiled } : null;

  // --- Merge keyword group and field group ---
  if (keywordGroup && fieldGroup) {
    out.filters = { logic: 'AND', conditions: [keywordGroup, fieldGroup] };
  } else if (keywordGroup) {
    out.filters = keywordGroup;
  } else if (fieldGroup) {
    out.filters = fieldGroup;
  }

  return out;
}

function normalizeKeywords(keywords) {
  const raw = Array.isArray(keywords) ? keywords : [];
  const out = [];
  const seen = new Set();
  for (const k of raw) {
    const v = String(k ?? '').trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= 12) break;
  }
  return out;
}

function normalizeTypeCode(input) {
  const raw = String(input ?? '').trim().toUpperCase();
  if (!raw) return '';
  if (/^(?:0X)?[0-9A-F]{3}[A-E]$/.test(raw)) {
    return raw.startsWith('0X') ? raw : `0X${raw}`;
  }
  return '';
}

function normalizeStringArray(arr, maxLen = 12) {
  const raw = Array.isArray(arr) ? arr : [];
  const out = [];
  const seen = new Set();
  for (const x of raw) {
    const v = String(x ?? '').trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= maxLen) break;
  }
  return out;
}

const INTENTS = new Set(['troubleshoot', 'lookup_fault_code', 'find_case', 'definition', 'how_to_use', 'other']);

function normalizeIntent(input) {
  const s = String(input ?? '').trim();
  if (!s) return 'other';
  return INTENTS.has(s) ? s : 'other';
}

function normalizeQueryFields(parsed, defaults = {}) {
  const daysFallback = Number.isFinite(Number(defaults.days)) ? Number(defaults.days) : 180;
  const days = Number.isFinite(Number(parsed?.days)) ? Number(parsed.days) : daysFallback;
  const safeDays = Math.min(Math.max(Math.floor(days), 1), 3650);

  // keywords: for definition/how_to_use topic extraction
  const keywords = normalizeStringArray(parsed?.keywords, 12);

  const faultCodesRaw = Array.isArray(parsed?.fault_codes) ? parsed.fault_codes : [];
  const faultCodes = [];
  const seen = new Set();
  for (const c of faultCodesRaw) {
    const norm = normalizeTypeCode(c);
    if (!norm) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    faultCodes.push(norm);
    if (faultCodes.length >= 12) break;
  }

  return {
    keywords,
    fault_codes: faultCodes,
    symptom: normalizeStringArray(parsed?.symptom, 12),
    trigger: normalizeStringArray(parsed?.trigger, 12),
    component: normalizeStringArray(parsed?.component, 12),
    neg: normalizeStringArray(parsed?.neg, 12),
    days: safeDays
  };
}

function normalizeQueryPlan(parsed, defaults = {}) {
  const p = (parsed && typeof parsed === 'object') ? parsed : {};
  const hasExplicitIntent = Object.prototype.hasOwnProperty.call(p, 'intent');
  const rawIntent = normalizeIntent(p.intent);

  const queryRaw = (p.query && typeof p.query === 'object') ? p.query : p;
  const query = normalizeQueryFields(queryRaw, defaults);

  if (!hasExplicitIntent) {
    const hasFault = (query.fault_codes || []).length > 0;
    const hasText = (query.symptom || []).length || (query.trigger || []).length || (query.component || []).length;
    const inferred = hasFault && !hasText ? 'lookup_fault_code' : (hasFault || hasText ? 'troubleshoot' : 'other');
    return { intent: inferred, query };
  }

  return { intent: rawIntent, query };
}

function getHttpModuleByProtocol(protocol) {
  return protocol === 'http:' ? http : https;
}

function doJsonRequest({ method, endpoint, pathName, headers, body, timeoutMs }) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = url.parse(endpoint);
      const mod = getHttpModuleByProtocol(parsed.protocol);
      const payload = body ? JSON.stringify(body) : '';

      const req = mod.request({
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        path: (parsed.pathname ? parsed.pathname.replace(/\/$/, '') : '') + pathName,
        method,
        headers: Object.assign(
          {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          headers || {},
          payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}
        )
      }, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let json = null;
          try {
            json = data ? JSON.parse(data) : null;
          } catch (_) { }
          const status = res.statusCode || 0;
          if (status >= 200 && status < 300) return resolve({ status, json });
          const err = new Error(`LLM request failed: ${status}`);
          err.status = status;
          err.body = json || data;
          return reject(err);
        });
      });

      req.on('error', (err) => reject(err));
      req.setTimeout(timeoutMs || 12000, () => {
        try { req.destroy(new Error('Request timeout')); } catch (_) { }
        const err = new Error('LLM request timeout');
        err.code = 'ETIMEDOUT';
        reject(err);
      });

      if (payload) req.write(payload);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

function doSseRequest({ endpoint, pathName, headers, body, timeoutMs, onEvent }) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = url.parse(endpoint);
      const mod = getHttpModuleByProtocol(parsed.protocol);
      const payload = body ? JSON.stringify(body) : '';

      const req = mod.request({
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        path: (parsed.pathname ? parsed.pathname.replace(/\/$/, '') : '') + pathName,
        method: 'POST',
        headers: Object.assign(
          {
            Accept: 'text/event-stream',
            'Content-Type': 'application/json'
          },
          headers || {},
          payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}
        )
      }, (res) => {
        const status = res.statusCode || 0;
        if (status < 200 || status >= 300) {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (c) => { data += c; });
          res.on('end', () => {
            const err = new Error(`LLM stream request failed: ${status}`);
            err.status = status;
            err.body = data;
            reject(err);
          });
          return;
        }

        res.setEncoding('utf8');
        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk;
          while (true) {
            const idx = buffer.indexOf('\n\n');
            if (idx < 0) break;
            const eventBlock = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);

            const lines = eventBlock.split('\n').map((l) => l.trimEnd());
            for (const line of lines) {
              if (!line.startsWith('data:')) continue;
              const data = line.slice(5).trim();
              if (!data) continue;
              if (data === '[DONE]') {
                onEvent && onEvent({ type: 'done' });
                resolve();
                return;
              }
              try {
                const json = JSON.parse(data);
                onEvent && onEvent({ type: 'data', json });
              } catch (_) {
                onEvent && onEvent({ type: 'data_raw', data });
              }
            }
          }
        });

        res.on('end', () => resolve());
        res.on('error', (e) => reject(e));
      });

      req.on('error', (err) => reject(err));
      req.setTimeout(timeoutMs || 12000, () => {
        try { req.destroy(new Error('Request timeout')); } catch (_) { }
        const err = new Error('LLM request timeout');
        err.code = 'ETIMEDOUT';
        reject(err);
      });

      if (payload) req.write(payload);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

function buildAuthHeaders(provider) {
  if (!provider) return {};
  if (!provider.requiresApiKey) return {};
  if (!provider.apiKey) return {};
  return { Authorization: `Bearer ${provider.apiKey}` };
}

async function extractQueryPlanWithProvider({ providerId, query, defaults }) {
  const provider = resolveProvider(providerId);
  const status = getSmartSearchLlmStatusForProvider(provider);
  if (!status.available) {
    const err = new Error(`LLM not available: ${status.reason}`);
    err.code = status.reason;
    throw err;
  }

  const prompt = String(query || '').trim();
  if (!prompt) {
    return {
      plan: normalizeQueryPlan({}, defaults),
      raw: { content: '', usage: null, model: provider.model },
      model: provider.model,
      provider: { id: provider.id, label: provider.label },
      messages: buildQueryPlanExtractionMessages('', defaults)
    };
  }

  const messages = buildQueryPlanExtractionMessages(prompt, defaults);
  const request = {
    model: provider.model,
    temperature: provider.temperature ?? 0,
    top_p: provider.topP ?? 0.1,
    messages
  };

  const resp = await doJsonRequest({
    method: 'POST',
    endpoint: provider.baseUrl,
    pathName: '/chat/completions',
    headers: buildAuthHeaders(provider),
    body: request,
    timeoutMs: provider.timeoutMs
  });

  const content = resp?.json?.choices?.[0]?.message?.content ?? '';
  const parsed = extractFirstJsonObject(content);
  const plan = normalizeQueryPlan(parsed || {}, defaults);

  const raw = {
    content,
    usage: resp?.json?.usage || null,
    model: resp?.json?.model || provider.model,
    provider: provider.id
  };

  return { plan, raw, model: provider.model, provider: { id: provider.id, label: provider.label }, messages };
}

function loadSearchTemplates() {
  try {
    const p = path.join(__dirname, '../config/searchTemplates.json');
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, 'utf8');
    const data = JSON.parse(raw || '[]');
    return Array.isArray(data) ? data : [];
  } catch (_) {
    return [];
  }
}

function buildBatchIntentExtractionMessages(prompt, { timeFormat = 'YYYY-MM-DD HH:mm:ss', presetNames = [], context } = {}) {
  const promptConfig = smartSearchPrompts?.batchIntentExtraction || {};
  const systemTemplate = Array.isArray(promptConfig.system)
    ? promptConfig.system.join('\n')
    : '';
  const presetRefNamesStr = Array.isArray(presetNames) && presetNames.length > 0
    ? presetNames.map((n) => String(n).trim()).filter(Boolean).join(', ')
    : (() => {
      const templates = loadSearchTemplates();
      return templates.map((t) => (t && t.name ? String(t.name).trim() : '')).filter(Boolean).join(', ');
    })();
  const logTimeRangeStr = (context && context.logTimeRange && typeof context.logTimeRange === 'string') ? context.logTimeRange : (context && context.logTimeRange && context.logTimeRange.min != null && context.logTimeRange.max != null ? `${context.logTimeRange.min} ~ ${context.logTimeRange.max}` : '');
  const now = new Date();
  const referenceDate = (context && context.referenceDate) ? String(context.referenceDate).trim() : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const templateVars = {
    timeFormat,
    PRESET_REF_NAMES: presetRefNamesStr || '(none)',
    logTimeRange: logTimeRangeStr,
    referenceDate
  };
  const systemContent = systemTemplate
    ? renderPromptTemplate(systemTemplate, templateVars)
    : '';

  const userContent = String(prompt || '').trim();

  if (context && context.firstMessage != null && context.previousSpec != null) {
    const messages = [
      { role: 'system', content: systemContent || 'Output JSON only.' },
      { role: 'user', content: String(context.firstMessage).trim() },
      { role: 'assistant', content: JSON.stringify(context.previousSpec) }
    ];
    const answers = Array.isArray(context.answers) ? context.answers : [];
    for (const a of answers) {
      const slot = a && a.slot != null ? String(a.slot) : '';
      const value = a && a.value != null ? String(a.value) : '';
      messages.push({ role: 'user', content: slot ? `[${slot}]: ${value}` : value });
    }
    messages.push({ role: 'user', content: userContent || '(user reply)' });
    return messages;
  }

  return [
    { role: 'system', content: systemContent || 'Output JSON only.' },
    { role: 'user', content: userContent }
  ];
}

function normalizeBatchFiltersJson(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};

  const out = {};
  if (typeof obj.search === 'string' && obj.search.trim()) out.search = obj.search.trim();

  const timeRe = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/;
  if (typeof obj.start_time === 'string' && timeRe.test(obj.start_time.trim())) out.start_time = obj.start_time.trim();
  if (typeof obj.end_time === 'string' && timeRe.test(obj.end_time.trim())) out.end_time = obj.end_time.trim();

  const allowedFields = new Set(['timestamp', 'error_code', 'param1', 'param2', 'param3', 'param4', 'explanation']);
  const allowedOps = new Set(['=', '!=', '>', '>=', '<', '<=', 'between', 'contains', 'notcontains', 'regex', 'startsWith', 'endsWith']);
  const allowedLogic = new Set(['AND', 'OR']);

  const normalizeNode = (node) => {
    if (!node || typeof node !== 'object') return null;
    if (node.field && node.operator) {
      const field = String(node.field || '').trim();
      const operator = String(node.operator || '').trim();
      if (!allowedFields.has(field)) return null;
      if (!allowedOps.has(operator)) return null;

      let value = node.value;
      if (operator === 'between') {
        if (!Array.isArray(value) || value.length < 2) return null;
        value = [value[0], value[1]];
      } else {
        // allow primitive or string; keep as-is for frontend normalization
        if (value === undefined || value === null || value === '') return null;
      }
      return { field, operator, value };
    }

    if (Array.isArray(node.conditions)) {
      const logic = String(node.logic || 'AND').trim().toUpperCase();
      const logicNorm = allowedLogic.has(logic) ? logic : 'AND';
      const children = node.conditions.map(normalizeNode).filter(Boolean);
      if (children.length === 0) return null;
      return { logic: logicNorm, conditions: children };
    }

    return null;
  };

  const filters = normalizeNode(obj.filters);
  if (filters) out.filters = filters;
  return out;
}

// --- QuerySpec (filters tree + actions + meta) ---
function isQuerySpecShape(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const hasMeta = obj.meta && typeof obj.meta === 'object';
  const hasFilters = obj.filters && typeof obj.filters === 'object';
  const filterType = hasFilters ? String(obj.filters.type || '').trim() : '';
  const hasTreeOrCondition = filterType === 'group' || filterType === 'condition' || filterType === 'preset_ref';
  return hasMeta && hasFilters && (hasTreeOrCondition || Array.isArray(obj.filters?.children));
}

function parseQuerySpecFromLlm(obj) {
  const spec = { filters: null, actions: [], meta: { explain: '', status: 'ok' } };
  if (!obj || typeof obj !== 'object') return spec;

  if (obj.filters && typeof obj.filters === 'object') spec.filters = obj.filters;
  if (Array.isArray(obj.actions)) spec.actions = obj.actions;
  if (obj.meta && typeof obj.meta === 'object') {
    spec.meta = {
      explain: String(obj.meta.explain ?? '').trim(),
      status: ['ok', 'need_clarification', 'fallback'].includes(obj.meta.status) ? obj.meta.status : 'ok',
      round: Number(obj.meta.round) || 1,
      max_rounds: Number(obj.meta.max_rounds) || 1,
      missing_slots: Array.isArray(obj.meta.missing_slots) ? obj.meta.missing_slots : [],
      questions: Array.isArray(obj.meta.questions) ? obj.meta.questions : []
    };
  }
  return spec;
}

/** 不包含/不等于 的约定与后端处理：
 * - 推荐：LLM 用 op contains/eq + negate:true 表示不包含/不等于，后端仅根据 negate 翻转。
 * - 兼容：LLM 若输出 op "notcontains"/"not contains"/"neq"，后端直接映射为 operator，不依赖 negate。
 * - 最终 operator 统一为 notcontains/!=，检索时：DB 用 NOT LIKE '%value%' 或 !=，explanation 可下推 NOT LIKE 或内存 !includes。
 */
const QUERY_SPEC_OP_TO_OPERATOR = {
  eq: '=',
  ne: '!=',
  neq: '!=',
  gte: '>=',
  lte: '<=',
  gt: '>',
  lt: '<',
  contains: 'contains',
  notcontains: 'notcontains',
  'not contains': 'notcontains',
  in: 'in',
  startsWith: 'startsWith',
  endsWith: 'endsWith'
};

const BATCH_ALLOWED_FIELDS = new Set(['timestamp', 'error_code', 'param1', 'param2', 'param3', 'param4', 'explanation']);
const BATCH_ALLOWED_OPS = new Set(['=', '!=', '>', '>=', '<', '<=', 'between', 'contains', 'notcontains', 'regex', 'startsWith', 'endsWith']);

/** 将 LLM 返回的 filters 数组转为前端期望的 conditions 列表（op -> operator）；仅通过 negate 处理不等于/不包含 */
function legacyConditionsFromFiltersArray(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  const out = [];
  for (const node of arr) {
    if (!node || typeof node !== 'object') continue;
    const field = String(node.field ?? '').trim();
    const op = String(node.op ?? node.operator ?? 'eq').trim().toLowerCase().replace(/\s+/g, ' ').trim();
    let operator = QUERY_SPEC_OP_TO_OPERATOR[op] || op;
    let negate = !!node.negate;
    if (operator === 'notcontains') {
      operator = 'contains';
      negate = true;
    }
    const value = node.value;
    if (!BATCH_ALLOWED_FIELDS.has(field) || !BATCH_ALLOWED_OPS.has(operator)) continue;
    if (operator !== 'between' && (value === undefined || value === null)) continue;
    if (operator === 'between' && (!Array.isArray(value) || value.length < 2)) continue;
    const item = { field, operator, value: operator === 'between' ? [value[0], value[1]] : value };
    if (negate) item.negate = true;
    out.push(item);
  }
  return out;
}

function resolvePresetRefInFilterTree(node, templatesByName) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'preset_ref' && node.name) {
    const name = String(node.name).trim();
    const tpl = templatesByName[name];
    if (tpl && tpl.filters) return resolvePresetRefInFilterTree(tpl.filters, templatesByName);
    return null;
  }
  if (node.type === 'condition' || (node.field != null && (node.operator != null || node.op != null) && !node.type)) {
    return { type: 'condition', field: node.field, op: node.op ?? node.operator, value: node.value, negate: node.negate };
  }
  if (node.type === 'group' && Array.isArray(node.children)) {
    const children = node.children.map((c) => resolvePresetRefInFilterTree(c, templatesByName)).filter(Boolean);
    if (children.length === 0) return null;
    return { type: 'group', logic: node.logic || 'AND', children };
  }
  if (node.logic && Array.isArray(node.conditions)) {
    const children = node.conditions.map((c) => resolvePresetRefInFilterTree(c, templatesByName)).filter(Boolean);
    if (children.length === 0) return null;
    return { type: 'group', logic: node.logic || 'AND', children };
  }
  return null;
}

/** 递归检查 filter 树中是否已有 error_code 条件（避免 detectedFaultCode 重复叠加） */
function filterTreeHasErrorCode(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.field === 'error_code') return true;
  const list = node.children || node.conditions || [];
  return list.some((c) => filterTreeHasErrorCode(c));
}

function filterTreeToFlat(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'condition' && node.field) {
    const op = String(node.op || 'eq').trim().toLowerCase().replace(/\s+/g, ' ').trim();
    let operator = QUERY_SPEC_OP_TO_OPERATOR[op] || op;
    let negate = !!node.negate;
    if (operator === 'notcontains') {
      operator = 'contains';
      negate = true;
    }
    const value = node.value;
    if (value === undefined && operator !== 'between') return null;
    const out = { field: node.field, operator, value };
    if (negate) out.negate = true;
    return out;
  }
  if ((node.type === 'group' && Array.isArray(node.children)) || Array.isArray(node.conditions)) {
    const list = node.children || node.conditions || [];
    const logic = String(node.logic || 'AND').trim().toUpperCase();
    const children = list.map(filterTreeToFlat).filter(Boolean);
    if (children.length === 0) return null;
    return { logic: logic === 'OR' ? 'OR' : 'AND', conditions: children };
  }
  return null;
}

function extractTimeFromFilterTree(node) {
  const out = { start_time: null, end_time: null };
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'condition' && node.field === 'timestamp') {
    const op = String(node.op || '').toLowerCase();
    const v = node.value;
    if (op === 'gte' && v) out.start_time = String(v).trim();
    if (op === 'lte' && v) out.end_time = String(v).trim();
    if (op === 'between' && Array.isArray(v) && v.length >= 2) {
      out.start_time = String(v[0]).trim();
      out.end_time = String(v[1]).trim();
    }
    return out;
  }
  const list = node.children || node.conditions || [];
  for (const c of list) {
    const t = extractTimeFromFilterTree(c);
    if (t.start_time) out.start_time = t.start_time;
    if (t.end_time) out.end_time = t.end_time;
  }
  return out;
}

function querySpecToLegacyResult(spec, { templatesByName = {}, detectedFaultCode } = {}) {
  const legacy = { search: null, start_time: null, end_time: null, filters: null };
  const actions = Array.isArray(spec.actions) ? spec.actions : [];
  const meta = spec.meta && typeof spec.meta === 'object'
    ? { ...spec.meta }
    : { explain: '', status: 'ok' };

  if (!spec.filters) return { ...legacy, actions, meta };

  const resolved = resolvePresetRefInFilterTree(spec.filters, templatesByName);
  if (!resolved) return { ...legacy, actions, meta };

  const timeRe = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/;
  const timeRange = extractTimeFromFilterTree(resolved);
  if (timeRange.start_time && timeRe.test(timeRange.start_time)) legacy.start_time = timeRange.start_time;
  if (timeRange.end_time && timeRe.test(timeRange.end_time)) legacy.end_time = timeRange.end_time;

  let flat = filterTreeToFlat(resolved);
  if (flat && detectedFaultCode && !filterTreeHasErrorCode(resolved)) {
    const conditions = flat.conditions || [];
    flat = {
      logic: 'AND',
      conditions: [...conditions, { field: 'error_code', operator: 'contains', value: detectedFaultCode }]
    };
  }
  if (flat) {
    if (flat.field) {
      legacy.filters = { logic: 'AND', conditions: [flat] };
    } else {
      legacy.filters = flat;
    }
  }
  return { ...legacy, actions, meta };
}

async function extractBatchFiltersWithProvider({ providerId, text, presetNames, context }) {
  const provider = resolveProvider(providerId);
  const status = getSmartSearchLlmStatusForProvider(provider);
  if (!status.available) {
    const err = new Error(`LLM not available: ${status.reason}`);
    err.code = status.reason;
    throw err;
  }

  const prompt = String(text || '').trim();
  const firstMessage = (context && context.firstMessage != null) ? String(context.firstMessage).trim() : prompt;
  if (!prompt && !(context && context.previousSpec)) {
    return {
      result: {},
      raw: { content: '', usage: null, model: provider.model },
      model: provider.model,
      provider: { id: provider.id, label: provider.label },
      messages: buildBatchIntentExtractionMessages('', { presetNames })
    };
  }

  const messages = buildBatchIntentExtractionMessages(prompt, { presetNames, context });
  const request = {
    model: provider.model,
    temperature: provider.temperature ?? 0,
    top_p: provider.topP ?? 0.1,
    messages
  };

  const resp = await doJsonRequest({
    method: 'POST',
    endpoint: provider.baseUrl,
    pathName: '/chat/completions',
    headers: buildAuthHeaders(provider),
    body: request,
    timeoutMs: provider.timeoutMs
  });

  const content = resp?.json?.choices?.[0]?.message?.content ?? '';
  let intentAst = extractFirstJsonObject(content);
  if (intentAst && typeof intentAst === 'object') {
    // 兼容 LLM 返回大写键名：FILTER / ACTIONS / META -> filters / actions / meta
    if (intentAst.FILTER !== undefined && intentAst.filters === undefined) intentAst.filters = intentAst.FILTER;
    if (intentAst.ACTIONS !== undefined && intentAst.actions === undefined) intentAst.actions = intentAst.ACTIONS;
    if (intentAst.META !== undefined && intentAst.meta === undefined) intentAst.meta = intentAst.META;
    console.log('[batch-nl] Intent AST:', JSON.stringify(intentAst, null, 2));
  }

  const detectedFaultCode = detectFaultCodeFromText(firstMessage);

  let result;
  if (isQuerySpecShape(intentAst)) {
    const spec = parseQuerySpecFromLlm(intentAst);
    const templates = loadSearchTemplates();
    const templatesByName = {};
    for (const t of templates) {
      if (t && t.name) templatesByName[String(t.name).trim()] = t;
    }
    result = querySpecToLegacyResult(spec, { templatesByName, detectedFaultCode });
  } else {
    const queryDsl = intentAstToQueryDsl(intentAst || {}, { detectedFaultCode });
    result = normalizeBatchFiltersJson(queryDsl);
    if (!result.meta) result.meta = { explain: '', status: 'ok' };
    if (!result.actions) result.actions = [];
    // LLM 可能返回 filters 为数组 [ group, condition, ... ]，按树解析以保留 OR/AND，避免只剩时间条件
    if (Array.isArray(intentAst.filters) && intentAst.filters.length > 0) {
      const wrapped = { type: 'group', logic: 'AND', children: intentAst.filters };
      const templates = loadSearchTemplates();
      const templatesByName = {};
      for (const t of templates) {
        if (t && t.name) templatesByName[String(t.name).trim()] = t;
      }
      const resolved = resolvePresetRefInFilterTree(wrapped, templatesByName);
      if (resolved) {
        const timeRe = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/;
        const timeRange = extractTimeFromFilterTree(resolved);
        if (timeRange.start_time && timeRe.test(timeRange.start_time)) result.start_time = timeRange.start_time;
        if (timeRange.end_time && timeRe.test(timeRange.end_time)) result.end_time = timeRange.end_time;
        const flat = filterTreeToFlat(resolved);
        if (flat) {
          let filtersOut = flat.field ? { logic: 'AND', conditions: [flat] } : flat;
          if (detectedFaultCode && filtersOut.conditions && !filterTreeHasErrorCode(resolved)) {
            filtersOut = {
              logic: filtersOut.logic,
              conditions: [...filtersOut.conditions, { field: 'error_code', operator: 'contains', value: detectedFaultCode }]
            };
          }
          result.filters = filtersOut;
        }
      } else if (!result.filters?.conditions?.length) {
        const conditions = legacyConditionsFromFiltersArray(intentAst.filters);
        if (conditions.length > 0) result.filters = { logic: 'AND', conditions };
      }
    }
    if (Array.isArray(intentAst.actions)) result.actions = intentAst.actions;
    if (intentAst.meta && typeof intentAst.meta === 'object') {
      result.meta = { ...result.meta, ...intentAst.meta };
    }
  }

  const raw = {
    content,
    usage: resp?.json?.usage || null,
    model: resp?.json?.model || provider.model,
    provider: provider.id
  };

  return { result, raw, model: provider.model, provider: { id: provider.id, label: provider.label }, messages };
}

async function streamKeywordExtractionWithProvider({ providerId, query, onDelta, onUsage, onRawEvent }) {
  const provider = resolveProvider(providerId);
  const status = getSmartSearchLlmStatusForProvider(provider);
  if (!status.available) {
    const err = new Error(`LLM not available: ${status.reason}`);
    err.code = status.reason;
    throw err;
  }

  const prompt = String(query || '').trim();
  if (!prompt) return { keywords: [], fullContent: '', model: provider.model, provider: { id: provider.id, label: provider.label } };

  const messages = buildKeywordExtractionMessages(prompt);
  const request = {
    model: provider.model,
    temperature: provider.temperature ?? 0,
    top_p: provider.topP ?? 0.1,
    messages,
    stream: true,
    stream_options: { include_usage: true }
  };

  let fullContent = '';
  let lastUsage = null;

  await doSseRequest({
    endpoint: provider.baseUrl,
    pathName: '/chat/completions',
    headers: buildAuthHeaders(provider),
    body: request,
    timeoutMs: provider.timeoutMs,
    onEvent: (ev) => {
      onRawEvent && onRawEvent(ev);
      if (ev.type !== 'data') return;
      const delta = ev.json?.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta) {
        fullContent += delta;
        onDelta && onDelta(delta);
      }
      if (ev.json?.usage) {
        lastUsage = ev.json.usage;
        onUsage && onUsage(lastUsage);
      }
    }
  });

  const parsed = extractFirstJsonObject(fullContent);
  const keywords = normalizeKeywords(parsed?.keywords);
  return { keywords, fullContent, parsed, request, usage: lastUsage, model: provider.model, provider: { id: provider.id, label: provider.label } };
}

module.exports = {
  getAllProviders,
  getProvidersPublic,
  resolveProvider,
  getSmartSearchLlmStatusForProvider,
  buildKeywordExtractionMessages,
  buildQueryPlanExtractionMessages,
  extractQueryPlanWithProvider,
  extractBatchFiltersWithProvider,
  streamKeywordExtractionWithProvider,
  intentAstToQueryDsl,
  loadNlpMappings
};
