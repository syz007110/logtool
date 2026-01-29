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
          } catch (_) {}
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
        try { req.destroy(new Error('Request timeout')); } catch (_) {}
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
        try { req.destroy(new Error('Request timeout')); } catch (_) {}
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
  streamKeywordExtractionWithProvider
};

