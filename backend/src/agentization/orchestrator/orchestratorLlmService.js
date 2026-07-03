const https = require('https');
const url = require('url');
const { assembleChatCompletionRequest, buildChatRequestFromMessages } = require('./chatRequestAssembler');
const { adaptChatCompletionRequest } = require('./chatProviderAdapter');
const { normalizeChatCompletionResponse, parseOrchestratorTurnResult } = require('./chatResponseParser');

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
          const err = new Error(`LLM request failed: ${status}`);
          err.status = status;
          err.body = json || data;
          reject(err);
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

/**
 * Run Orchestrator LLM via Chat Completions + native tool_calls parsing.
 */
async function runOrchestratorChatCompletion({
  contextEnvelope,
  provider,
  userPermissions,
  traceId,
  messages,
  allowEmptyResponse = false
}) {
  const chatRequest = Array.isArray(messages) && messages.length > 0
    ? buildChatRequestFromMessages({
      messages,
      contextEnvelope,
      userPermissions,
      model: provider.model,
      traceId
    })
    : assembleChatCompletionRequest({
      contextEnvelope,
      userPermissions,
      model: provider.model,
      traceId
    });
  const { body: httpBody } = adaptChatCompletionRequest(chatRequest, provider);

  const resp = await doJsonRequest({
    method: 'POST',
    endpoint: provider.baseUrl,
    pathName: '/chat/completions',
    headers: buildProviderAuthHeaders(provider),
    body: httpBody,
    timeoutMs: provider.timeoutMs
  });

  const chatResponse = normalizeChatCompletionResponse(resp?.json || {});
  const turnResult = parseOrchestratorTurnResult(chatResponse);

  if (turnResult.kind === 'empty' && !allowEmptyResponse) {
    const err = new Error('orchestrator LLM returned empty assistant message');
    err.code = 'ORCHESTRATOR_LLM_EMPTY_CONTENT';
    err.meta = { finishReason: turnResult.finishReason, providerId: provider.id };
    throw err;
  }

  return {
    ...turnResult,
    lang: chatRequest.extensions?.lang || 'zh-CN',
    chatRequest,
    chatResponse,
    messages: chatRequest.messages,
    model: provider.model,
    provider: { id: provider.id, label: provider.label },
    llmRaw: {
      request: httpBody,
      response: chatResponse,
      usage: chatResponse.usage || null
    }
  };
}

module.exports = {
  runOrchestratorChatCompletion,
  doJsonRequest,
  buildProviderAuthHeaders
};
