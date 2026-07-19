const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const url = require('url');
const {
  assembleChatCompletionRequest,
  buildChatRequestFromMessages,
  buildCurrentUserMessage
} = require('./chatRequestAssembler');
const { adaptChatCompletionRequest } = require('./chatProviderAdapter');
const { normalizeChatCompletionResponse, parseOrchestratorTurnResult } = require('./chatResponseParser');
const { appendLlmApiDebugMarkdown } = require('../utils/agentDebugMarkdownLogger');
const { sanitizeMultimodalPayload } = require('../utils/multimodalPayloadSanitizer');
const {
  STORAGE,
  LOCAL_DIR,
  getOssClient
} = require('../../config/agentAssetStorage');

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeImageAttachments(contextEnvelope = {}) {
  const currentInput = asObject(contextEnvelope.currentInput);
  return (Array.isArray(currentInput.attachments) ? currentInput.attachments : [])
    .filter((attachment) => {
      if (!attachment || typeof attachment !== 'object') return false;
      if (String(attachment.type || '').trim().toLowerCase() !== 'image') return false;
      const status = String(attachment.status || 'available').trim().toLowerCase();
      return status === 'available';
    });
}

async function readImageAttachmentBuffer(attachment) {
  const objectKey = String(attachment?.objectKey || '').trim().replace(/\\/g, '/');
  if (!objectKey) return null;

  if (String(attachment?.storage || '').trim().toLowerCase() === 'oss' || STORAGE === 'oss') {
    const client = await getOssClient();
    if (!client) return null;
    const tmpPath = path.join(os.tmpdir(), `agent-asset-${Date.now()}-${Math.random().toString(16).slice(2)}${path.extname(objectKey)}`);
    try {
      await client.get(objectKey.replace(/^\//, ''), tmpPath);
      return await fs.promises.readFile(tmpPath);
    } finally {
      try { await fs.promises.unlink(tmpPath); } catch (_) {}
    }
  }

  const resolved = path.resolve(LOCAL_DIR, objectKey);
  return fs.promises.readFile(resolved);
}

async function buildImageContentBlocks(contextEnvelope = {}) {
  const attachments = normalizeImageAttachments(contextEnvelope);
  const blocks = [];
  for (const attachment of attachments) {
    const mimeType = String(attachment?.mimeType || '').trim().toLowerCase();
    if (!mimeType.startsWith('image/')) continue;
    try {
      const buffer = await readImageAttachmentBuffer(attachment);
      if (!buffer || buffer.length === 0) continue;
      blocks.push({
        type: 'image_url',
        image_url: `data:${mimeType};base64,${buffer.toString('base64')}`
      });
    } catch (_) {}
  }
  return blocks;
}

async function enrichChatRequestWithImageAttachments(chatRequest, contextEnvelope, provider) {
  if (!provider?.capabilities?.imageInput) return chatRequest;
  const currentUser = buildCurrentUserMessage(contextEnvelope);
  const expectedContent = String(currentUser?.content || '').trim();
  if (!expectedContent) return chatRequest;

  const imageBlocks = await buildImageContentBlocks(contextEnvelope);
  if (imageBlocks.length === 0) return chatRequest;

  const messages = Array.isArray(chatRequest?.messages)
    ? chatRequest.messages.map((message) => ({ ...message }))
    : [];
  const targetIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (String(message?.role || '').trim() !== 'user') continue;
      if (String(message?.content || '').trim() !== expectedContent) continue;
      return i;
    }
    return -1;
  })();
  if (targetIndex < 0) return chatRequest;

  const queryText = String(contextEnvelope?.currentQuery || '').trim();
  const contentBlocks = [];
  if (queryText) {
    contentBlocks.push({ type: 'text', text: queryText });
  }
  contentBlocks.push(...imageBlocks);
  messages[targetIndex] = {
    ...messages[targetIndex],
    content: contentBlocks
  };
  return {
    ...chatRequest,
    messages
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
  channelType,
  traceId,
  requestId,
  conversationId,
  jobId,
  debugStage,
  debugStep,
  debugCallType,
  messages,
  allowEmptyResponse = false
}) {
  const chatRequest = Array.isArray(messages) && messages.length > 0
    ? buildChatRequestFromMessages({
      messages,
      contextEnvelope,
      userPermissions,
      channelType,
      model: provider.model,
      traceId
    })
    : assembleChatCompletionRequest({
      contextEnvelope,
      userPermissions,
      channelType,
      model: provider.model,
      traceId
    });
  const preparedRequest = await enrichChatRequestWithImageAttachments(chatRequest, contextEnvelope, provider);
  const { body: httpBody } = adaptChatCompletionRequest(preparedRequest, provider);

  let resp = null;
  try {
    resp = await doJsonRequest({
      method: 'POST',
      endpoint: provider.baseUrl,
      pathName: '/chat/completions',
      headers: buildProviderAuthHeaders(provider),
      body: httpBody,
      timeoutMs: provider.timeoutMs
    });
  } catch (error) {
    try {
      await appendLlmApiDebugMarkdown({
        jobId,
        requestId,
        traceId,
        conversationId,
        step: debugStep,
        callType: debugCallType || 'orchestrator',
        stage: debugStage || 'orchestrator_llm',
        requestPayload: httpBody,
        responsePayload: error?.body || null,
        error
      });
    } catch (_) {}
    throw error;
  }

  const chatResponse = normalizeChatCompletionResponse(resp?.json || {}, provider?.capabilities);
  try {
    await appendLlmApiDebugMarkdown({
      jobId,
      requestId,
      traceId,
      conversationId,
      step: debugStep,
      callType: debugCallType || 'orchestrator',
      stage: debugStage || 'orchestrator_llm',
      requestPayload: httpBody,
      responsePayload: chatResponse
    });
  } catch (_) {}
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
    chatRequest: sanitizeMultimodalPayload(preparedRequest),
    chatResponse,
    messages: sanitizeMultimodalPayload(preparedRequest.messages),
    model: provider.model,
    provider: { id: provider.id, label: provider.label },
    llmRaw: {
      request: sanitizeMultimodalPayload(httpBody),
      response: chatResponse,
      usage: chatResponse.usage || null
    }
  };
}

module.exports = {
  runOrchestratorChatCompletion,
  doJsonRequest,
  buildProviderAuthHeaders,
  enrichChatRequestWithImageAttachments
};
