const https = require('https');
const url = require('url');
const smartSearchPrompts = require('../config/smartSearchPrompts.json');
const { buildIntentToolPrompt } = require('../agentization/tools/registry/toolPromptBinder');
const { getAllowedToolNames, loadToolRegistry } = require('../agentization/tools/registry/registryLoader');
const {
  resolveProvider,
  getSmartSearchLlmStatusForProvider
} = require('./smartSearchLlmService');

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

function getLlmProviderConfig(providerId) {
  const provider = resolveProvider(providerId);
  const status = getSmartSearchLlmStatusForProvider(provider);
  return {
    provider,
    available: Boolean(status?.available),
    reason: String(status?.reason || ''),
    apiKey: String(provider?.apiKey || '').trim(),
    requiresApiKey: Boolean(provider?.requiresApiKey),
    baseUrl: normalizeBaseUrl(provider?.baseUrl || ''),
    model: String(provider?.model || '').trim(),
    timeoutMs: Number.parseInt(String(provider?.timeoutMs || '12000'), 10) || 12000
  };
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

function clampConfidence(input, fallback = 0.7) {
  const n = Number(input);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function normalizeLanguageTag(input, fallback = 'zh-CN') {
  const raw = String(input || '').trim();
  if (!raw) return fallback;
  const normalized = raw.replace('_', '-');
  if (/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(normalized)) return normalized;
  return fallback;
}

function mapEnvelopeLangToBcp47(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (raw === 'zh') return 'zh-CN';
  if (raw === 'en') return 'en-US';
  return normalizeLanguageTag(input, 'zh-CN');
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

function buildConversationIntentMessages(contextEnvelope) {
  const envelope = contextEnvelope && typeof contextEnvelope === 'object' ? contextEnvelope : {};
  const requestedLang = String(envelope?.lang || envelope?.sessionMeta?.lang || 'zh').trim().toLowerCase();
  const byLang = smartSearchPrompts?.conversationIntentExtractionByLang || {};
  const promptConfig = byLang[requestedLang] || byLang.zh || {};
  const systemPrompt = Array.isArray(promptConfig.system)
    ? promptConfig.system.join('\n')
    : String(promptConfig.system || '').trim();
  const staticToolPrompt = Array.isArray(promptConfig.tool)
    ? promptConfig.tool.join('\n')
    : String(promptConfig.tool || '').trim();
  const dynamicToolPrompt = buildIntentToolPrompt();
  const toolPrompt = dynamicToolPrompt?.toolPrompt || staticToolPrompt;
  const memoryPrompt = Array.isArray(promptConfig.memory)
    ? promptConfig.memory.join('\n')
    : String(promptConfig.memory || '').trim();
  const userTemplate = Array.isArray(promptConfig.userTemplate)
    ? promptConfig.userTemplate.join('\n')
    : String(promptConfig.userTemplate || '').trim();
  const fallbackPrompt = [
    'You are a conversation intent extractor.',
    'Output JSON ONLY.',
    'Allowed intent: troubleshoot, lookup_fault_code, find_case, definition, how_to_use, other, log_query, surgery_summary, case_record.',
    'Output schema: {"intent":"","keywords":[],"confidence":0.7,"filters":{"errorCode":"","device":"","Phenomenon":"","Concept":""}}'
  ].join('\n');
  const fallbackUserTemplate = [
    'Context for intent extraction:',
    '- currentInput.rawText: {{currentInputRawText}}',
    '- currentInput.fileIds: {{currentInputFileIds}}',
    '- confirmedSlots: errorCode={{errorCode}}, device={{device}}, phenomenon={{phenomenon}}, concept={{concept}}, component={{component}}',
    '- historySummary: lastIntent={{lastIntent}}, lastTool={{lastTool}}, lastResultBrief={{lastResultBrief}}',
    '- historyContext.summary: {{historyContextSummary}}',
    '- recentTurns:',
    '{{recentTurnsText}}',
    '',
    'Return JSON only with keys: intent, keywords, confidence, filters.'
  ].join('\n');

  const currentInput = envelope?.currentInput && typeof envelope.currentInput === 'object'
    ? envelope.currentInput
    : {};
  const historyContext = envelope?.historyContext && typeof envelope.historyContext === 'object'
    ? envelope.historyContext
    : {};
  const confirmedSlots = envelope?.confirmedSlots && typeof envelope.confirmedSlots === 'object'
    ? envelope.confirmedSlots
    : {};
  const historySummary = envelope?.historySummary && typeof envelope.historySummary === 'object'
    ? envelope.historySummary
    : {};
  const recentTurns = Array.isArray(historyContext?.recentTurns) ? historyContext.recentTurns : [];
  const recentTurnsText = recentTurns.length === 0
    ? '第1轮 user: （无历史）'
    : recentTurns.map((turn) => {
        const role = String(turn?.role || '').trim() || 'user';
        const text = String(turn?.text || '').trim() || '（空）';
        return `${role}: ${text}`;
      }).join('\n');

  const userPrompt = renderPromptTemplate(userTemplate || fallbackUserTemplate, {
    currentInputRawText: String(currentInput?.rawText || '').trim(),
    currentInputFileIds: Array.isArray(currentInput?.fileIds) ? currentInput.fileIds.join(', ') : '',
    errorCode: String(confirmedSlots?.errorCode || '未确认'),
    device: String(confirmedSlots?.device || '未确认'),
    phenomenon: String(confirmedSlots?.phenomenon || '未确认'),
    concept: String(confirmedSlots?.concept || '未确认'),
    component: String(confirmedSlots?.component || '未确认'),
    lastIntent: String(historySummary?.lastIntent || '无'),
    lastTool: String(historySummary?.lastTool || '无'),
    lastResultBrief: String(historySummary?.lastResultBrief || '无'),
    historyContextSummary: String(historyContext?.summary || '无'),
    recentTurnsText
  });

  const messages = [];
  const dynamicToolRule = [
    'toolDecision.toolName 只能从以下枚举中选择：',
    `${(dynamicToolPrompt?.toolNames || []).join(' | ') || 'null'}`
  ].join('\n');
  messages.push({ role: 'system', content: [systemPrompt || fallbackPrompt, dynamicToolRule].join('\n') });
  if (userPrompt) messages.push({ role: 'user', content: userPrompt });
  if (toolPrompt) messages.push({ role: 'user', content: `[tool]\n${toolPrompt}` });
  messages.push({ role: 'user', content: `[memory]\n${memoryPrompt || '(empty)'}` });
  return messages;
}

function getConversationToolNameAllowlist() {
  const legacy = ['errorCodeSearch', 'logAnalyzer', 'knowledgeBaseSearch', 'faultCaseSearch', 'faultCollect'];
  try {
    const registry = loadToolRegistry();
    const fromRegistry = Array.from(getAllowedToolNames(registry));
    const merged = new Set([...legacy, ...fromRegistry]);
    return merged;
  } catch (_) {
    return new Set(legacy);
  }
}

function normalizeConversationIntentResult(parsed = {}, options = {}) {
  const allowedIntents = new Set([
    'fault_diagnosis',
    'log_analysis',
    'error_code_lookup',
    'knowledge_qa',
    'provide_missing_info',
    'fault_collection',
    'continue_previous_task',
    'general_chat',
    'unknown'
  ]);
  const toolNames = getConversationToolNameAllowlist();
  const nextActionTypes = new Set(['ask_user', 'call_tool', 'reply_direct']);
  const rawIntent = String(parsed.intent || '').trim();
  const intent = allowedIntents.has(rawIntent) ? rawIntent : 'unknown';
  const fallbackLanguage = mapEnvelopeLangToBcp47(options?.fallbackLanguage);

  const entitiesRaw = parsed?.entities && typeof parsed.entities === 'object' ? parsed.entities : {};
  const normalizedErrorCode = normalizeTypeCode(entitiesRaw.errorCode || '');
  const entities = {
    errorCode: normalizedErrorCode || null,
    device: String(entitiesRaw.device || '').trim() || null,
    phenomenon: String(entitiesRaw.phenomenon || '').trim() || null,
    concept: String(entitiesRaw.concept || '').trim() || null,
    component: String(entitiesRaw.component || '').trim() || null,
    fileIds: normalizeStringArray(entitiesRaw.fileIds, 20)
  };

  const toolDecisionRaw = parsed?.toolDecision && typeof parsed.toolDecision === 'object' ? parsed.toolDecision : {};
  const toolNameRaw = String(toolDecisionRaw.toolName || '').trim();
  const nextActionRaw = parsed?.nextAction && typeof parsed.nextAction === 'object' ? parsed.nextAction : {};
  const nextActionTypeRaw = String(nextActionRaw.type || '').trim();
  const wantsCallTool = Boolean(toolDecisionRaw.shouldCallTool) || nextActionTypeRaw === 'call_tool';
  const toolName = toolNames.has(toolNameRaw) ? toolNameRaw : null;
  const shouldCallTool = wantsCallTool && Boolean(toolName);
  const toolDecision = {
    shouldCallTool,
    toolName,
    reason: String(toolDecisionRaw.reason || '').trim()
  };

  const needClarification = Boolean(parsed?.needClarification);
  const clarificationQuestionRaw = String(parsed?.clarificationQuestion || '').trim();
  const clarificationQuestion = needClarification
    ? (clarificationQuestionRaw || '请补充更多信息')
    : null;

  let nextActionType = nextActionTypes.has(nextActionTypeRaw) ? nextActionTypeRaw : 'reply_direct';
  if (needClarification) nextActionType = 'ask_user';
  else if (toolDecision.shouldCallTool) nextActionType = 'call_tool';
  const nextAction = {
    type: nextActionType,
    message: String(nextActionRaw.message || '').trim()
  };

  const legacyFilters = {
    errorCode: entities.errorCode || '',
    device: entities.device || '',
    Phenomenon: entities.phenomenon || '',
    Concept: entities.concept || ''
  };

  return {
    intentVersion: /^v\d+$/i.test(String(parsed?.intentVersion || '').trim())
      ? String(parsed.intentVersion).trim().toLowerCase()
      : 'v1',
    intent,
    entities,
    toolDecision,
    needClarification,
    clarificationQuestion,
    nextAction,
    confidence: clampConfidence(parsed?.confidence, 0.7),
    language: normalizeLanguageTag(parsed?.language, fallbackLanguage),
    keywords: normalizeKeywords(parsed?.keywords).slice(0, 8),
    filters: legacyFilters
  };
}

function buildProviderAuthHeaders(provider) {
  const headers = {};
  if (provider?.requiresApiKey) {
    const apiKey = String(provider?.apiKey || '').trim();
    if (!apiKey) {
      const err = new Error('LLM provider missing api key');
      err.code = 'MISSING_API_KEY';
      throw err;
    }
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

async function extractConversationIntentWithProvider({ contextEnvelope, providerId }) {
  const provider = resolveProvider(providerId);
  const status = getSmartSearchLlmStatusForProvider(provider);
  if (!status.available) {
    const err = new Error(`smart-search llm unavailable: ${status.reason}`);
    err.code = String(status.reason || 'LLM_UNAVAILABLE').toUpperCase();
    throw err;
  }

  const messages = buildConversationIntentMessages(contextEnvelope);
  const request = {
    model: provider.model,
    temperature: 0,
    top_p: 0.1,
    messages
  };

  const resp = await doJsonRequest({
    method: 'POST',
    endpoint: provider.baseUrl,
    pathName: '/chat/completions',
    headers: buildProviderAuthHeaders(provider),
    body: request,
    timeoutMs: provider.timeoutMs
  });

  const content = resp?.json?.choices?.[0]?.message?.content ?? '';
  const parsed = extractFirstJsonObject(content) || {};
  const result = normalizeConversationIntentResult(parsed, {
    fallbackLanguage: contextEnvelope?.lang || contextEnvelope?.sessionMeta?.lang || 'zh'
  });
  const raw = {
    content,
    usage: resp?.json?.usage || null,
    model: resp?.json?.model || provider.model
  };
  return {
    ...result,
    raw,
    model: provider.model,
    provider: { id: provider.id, label: provider.label },
    messages,
    toolCatalog: (() => {
      try {
        const registry = loadToolRegistry();
        return {
          version: registry.registryVersion,
          toolNames: Array.from(getAllowedToolNames(registry))
        };
      } catch (_) {
        return null;
      }
    })()
  };
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

async function extractKeywordsWithProvider({ query, providerId }) {
  const cfg = getLlmProviderConfig(providerId);
  if (!cfg.available) {
    const err = new Error(`LLM provider unavailable: ${cfg.reason || 'unknown'}`);
    err.code = 'MISSING_API_KEY';
    throw err;
  }
  if (cfg.requiresApiKey && !cfg.apiKey) {
    const err = new Error('Missing LLM provider api key');
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

async function extractQueryPlanWithProvider({ query, defaults, providerId }) {
  const cfg = getLlmProviderConfig(providerId);
  if (!cfg.available) {
    const err = new Error(`LLM provider unavailable: ${cfg.reason || 'unknown'}`);
    err.code = 'MISSING_API_KEY';
    throw err;
  }
  if (cfg.requiresApiKey && !cfg.apiKey) {
    const err = new Error('Missing LLM provider api key');
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

async function streamKeywordExtractionWithProvider({ query, onDelta, onUsage, onRawEvent, providerId }) {
  const cfg = getLlmProviderConfig(providerId);
  if (!cfg.available) {
    const err = new Error(`LLM provider unavailable: ${cfg.reason || 'unknown'}`);
    err.code = 'MISSING_API_KEY';
    throw err;
  }
  if (cfg.requiresApiKey && !cfg.apiKey) {
    const err = new Error('Missing LLM provider api key');
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
  getLlmProviderConfig,
  extractKeywordsWithProvider,
  extractQueryPlanWithProvider,
  extractConversationIntentWithProvider,
  streamKeywordExtractionWithProvider,
  buildConversationIntentMessages,
  buildKeywordExtractionMessages,
  buildQueryPlanExtractionMessages,
  normalizeConversationIntentResult
};


