const https = require('https');
const url = require('url');
const smartSearchPrompts = require('../config/smartSearchPrompts.json');

function renderPromptTemplate(template, vars) {
  const s = String(template ?? '');
  return s.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const v = vars && Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : '';
    return String(v);
  });
}

function normalizeBaseUrl(baseUrl) {
  const s = String(baseUrl || '').trim();
  if (!s) return '';
  return s.replace(/\/+$/, '');
}

function getQwenConfig() {
  const apiKey = String(process.env.DASHSCOPE_API_KEY || '').trim();
  const baseUrl = normalizeBaseUrl(process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1');
  const model = String(process.env.SMART_SEARCH_QWEN_MODEL || 'qwen-flash').trim() || 'qwen-flash';
  const timeoutMs = Number.parseInt(process.env.SMART_SEARCH_LLM_TIMEOUT_MS || '12000', 10) || 12000;

  return { apiKey, baseUrl, model, timeoutMs };
}

function doJsonRequest({ method, endpoint, pathName, headers, body, timeoutMs }) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = url.parse(endpoint);
      const payload = body ? JSON.stringify(body) : '';

      const req = https.request({
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
          try { json = data ? JSON.parse(data) : null; } catch (_) {}
          const status = res.statusCode || 0;
          if (status >= 200 && status < 300) return resolve({ status, json });
          const err = new Error(`Qwen request failed: ${status}`);
          err.status = status;
          err.body = json || data;
          return reject(err);
        });
      });

      req.on('error', (err) => reject(err));
      req.setTimeout(timeoutMs || 12000, () => {
        try { req.destroy(new Error('Request timeout')); } catch (_) {}
        const err = new Error('Qwen request timeout');
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

function extractFirstJsonObject(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  const start = s.indexOf('{');
  if (start < 0) return null;
  const end = s.lastIndexOf('}');
  if (end <= start) return null;
  const slice = s.slice(start, end + 1);
  try { return JSON.parse(slice); } catch (_) { return null; }
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
  // Allow 010A / 0x010A / 0X010A; last char must be A-E
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

const INTENTS = new Set([
  'troubleshoot',
  'lookup_fault_code',
  'find_case',
  'definition',
  'how_to_use',
  'other'
]);

function normalizeIntent(input) {
  const s = String(input ?? '').trim();
  if (!s) return 'other';
  return INTENTS.has(s) ? s : 'other';
}

function normalizeQueryFields(parsed, defaults = {}) {
  const daysFallback = Number.isFinite(Number(defaults.days)) ? Number(defaults.days) : 180;
  const days = Number.isFinite(Number(parsed?.days)) ? Number(parsed.days) : daysFallback;
  const safeDays = Math.min(Math.max(Math.floor(days), 1), 3650);

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

  // New schema: { intent, query: {...} }
  // Backward compatible: allow flat fields at top-level
  const queryRaw = (p.query && typeof p.query === 'object') ? p.query : p;
  const query = normalizeQueryFields(queryRaw, defaults);

  // If LLM didn't provide intent (old schema), infer a reasonable default.
  if (!hasExplicitIntent) {
    const hasFault = (query.fault_codes || []).length > 0;
    const hasText = (query.symptom || []).length || (query.trigger || []).length || (query.component || []).length;
    const inferred = hasFault && !hasText ? 'lookup_fault_code' : (hasFault || hasText ? 'troubleshoot' : 'other');
    return { intent: inferred, query };
  }

  return { intent: rawIntent, query };
}

function buildKeywordExtractionMessages(query) {
  const prompt = String(query || '').trim();
  const promptConfig = smartSearchPrompts?.keywordExtraction || {};
  // Support both array (readable) and string (backward compatible)
  const systemPrompt = Array.isArray(promptConfig.system)
    ? promptConfig.system.join('\n')
    : String(promptConfig.system || '').trim();
  return [
    {
      role: 'system',
      content: systemPrompt
    },
    { role: 'user', content: prompt }
  ];
}

function buildQueryPlanExtractionMessages(query, defaults = {}) {
  const prompt = String(query || '').trim();
  const daysFallback = Number.isFinite(Number(defaults.days)) ? Number(defaults.days) : 180;
  const promptConfig = smartSearchPrompts?.queryPlanExtraction || {};
  // Support both array (readable) and string (backward compatible)
  const systemTemplate = Array.isArray(promptConfig.system)
    ? promptConfig.system.join('\n')
    : String(promptConfig.system || '').trim();
  return [
    {
      role: 'system',
      content: renderPromptTemplate(systemTemplate, { daysFallback })
    },
    { role: 'user', content: prompt }
  ];
}

function doSseRequest({ endpoint, pathName, headers, body, timeoutMs, onEvent }) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = url.parse(endpoint);
      const payload = body ? JSON.stringify(body) : '';

      const req = https.request({
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
            const err = new Error(`Qwen stream request failed: ${status}`);
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
          // SSE events separated by blank line
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
        const err = new Error('Qwen request timeout');
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

async function extractKeywordsWithQwen({ query }) {
  const cfg = getQwenConfig();
  if (!cfg.apiKey) {
    const err = new Error('Missing DASHSCOPE_API_KEY');
    err.code = 'MISSING_API_KEY';
    throw err;
  }

  const prompt = String(query || '').trim();
  if (!prompt) return { keywords: [] };

  const messages = buildKeywordExtractionMessages(prompt);

  // OpenAI-compatible chat.completions endpoint (non-stream)
  const request = {
    model: cfg.model,
    temperature: 0,
    top_p: 0.1,
    messages
  };

  const resp = await doJsonRequest({
    method: 'POST',
    endpoint: cfg.baseUrl,
    pathName: '/chat/completions',
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    body: request,
    timeoutMs: cfg.timeoutMs
  });

  const content = resp?.json?.choices?.[0]?.message?.content ?? '';
  const parsed = extractFirstJsonObject(content);
  const keywords = normalizeKeywords(parsed?.keywords);

  // Optimized raw: only keep essential info
  const raw = {
    content, // LLM raw text output (for debugging)
    usage: resp?.json?.usage || null, // Token usage
    model: resp?.json?.model || cfg.model // Model name from response
  };

  return { keywords, raw, model: cfg.model };
}

async function extractQueryPlanWithQwen({ query, defaults }) {
  const cfg = getQwenConfig();
  if (!cfg.apiKey) {
    const err = new Error('Missing DASHSCOPE_API_KEY');
    err.code = 'MISSING_API_KEY';
    throw err;
  }

  const prompt = String(query || '').trim();
  if (!prompt) {
    return {
      plan: normalizeQueryPlan({}, defaults),
      raw: { content: '', usage: null, model: cfg.model },
      model: cfg.model,
      messages: buildQueryPlanExtractionMessages('', defaults)
    };
  }

  const messages = buildQueryPlanExtractionMessages(prompt, defaults);

  // OpenAI-compatible chat.completions endpoint (non-stream)
  const request = {
    model: cfg.model,
    temperature: 0,
    top_p: 0.1,
    messages
  };

  const resp = await doJsonRequest({
    method: 'POST',
    endpoint: cfg.baseUrl,
    pathName: '/chat/completions',
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    body: request,
    timeoutMs: cfg.timeoutMs
  });

  const content = resp?.json?.choices?.[0]?.message?.content ?? '';
  const parsed = extractFirstJsonObject(content);
  const plan = normalizeQueryPlan(parsed || {}, defaults);

  // Optimized raw: only keep essential info (remove duplicates with llmPrompt and queryPlan)
  const raw = {
    content, // LLM raw text output (for debugging)
    usage: resp?.json?.usage || null, // Token usage
    model: resp?.json?.model || cfg.model // Model name from response
  };

  return { plan, raw, model: cfg.model, messages };
}

async function streamKeywordExtractionWithQwen({ query, onDelta, onUsage, onRawEvent }) {
  const cfg = getQwenConfig();
  if (!cfg.apiKey) {
    const err = new Error('Missing DASHSCOPE_API_KEY');
    err.code = 'MISSING_API_KEY';
    throw err;
  }
  const prompt = String(query || '').trim();
  if (!prompt) return { keywords: [], fullContent: '' };

  const messages = buildKeywordExtractionMessages(prompt);
  const request = {
    model: cfg.model,
    temperature: 0,
    top_p: 0.1,
    messages,
    stream: true,
    stream_options: { include_usage: true }
  };

  let fullContent = '';
  let lastUsage = null;

  await doSseRequest({
    endpoint: cfg.baseUrl,
    pathName: '/chat/completions',
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    body: request,
    timeoutMs: cfg.timeoutMs,
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
  return { keywords, fullContent, parsed, request, usage: lastUsage, model: cfg.model };
}

module.exports = {
  getQwenConfig,
  extractKeywordsWithQwen,
  extractQueryPlanWithQwen,
  streamKeywordExtractionWithQwen,
  buildKeywordExtractionMessages,
  buildQueryPlanExtractionMessages
};


