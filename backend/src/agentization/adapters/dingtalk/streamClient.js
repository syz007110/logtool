const https = require('https');
const { buildAgentRequestFromDingtalkPayload } = require('./buildAgentRequestFromDingtalk');
const { createAgentRequestLogger } = require('../../utils/agentRequestLogger');

const ROBOT_TOPIC = '/v1.0/im/bot/messages/get';

function defaultLogger() {
  return {
    info: (...args) => console.log(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args)
  };
}

function parseBoolean(value, defaultValue = false) {
  if (value == null) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function parseSampleRate(value, fallback = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(1, num));
}

function maskIdentifier(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= 6) return '***';
  return `${text.slice(0, 3)}***${text.slice(-3)}`;
}

function sanitizeWebhook(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const u = new URL(text);
    return `${u.origin}${u.pathname}`;
  } catch (_) {
    return '[REDACTED_WEBHOOK]';
  }
}

function sanitizePayloadForLog(payload) {
  if (!payload || typeof payload !== 'object') return {};
  const out = { ...payload };
  if (out.sessionWebhook) out.sessionWebhook = sanitizeWebhook(out.sessionWebhook);
  if (out.senderId) out.senderId = maskIdentifier(out.senderId);
  if (out.senderStaffId) out.senderStaffId = maskIdentifier(out.senderStaffId);
  if (out.conversationId) out.conversationId = maskIdentifier(out.conversationId);
  if (out.robotCode) out.robotCode = maskIdentifier(out.robotCode);
  if (out.chatbotCorpId) out.chatbotCorpId = maskIdentifier(out.chatbotCorpId);
  return out;
}

function postJson(url, body, headers = {}) {
  const payload = JSON.stringify(body || {});
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (!data) return resolve({});
        try {
          return resolve(JSON.parse(data));
        } catch (error) {
          return resolve({ raw: data, parseError: String(error?.message || error) });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function createClientFactory() {
  let moduleExports = null;
  try {
    moduleExports = require('dingtalk-stream');
  } catch (_) {
    try {
      moduleExports = require('dingtalk-stream-sdk-nodejs');
    } catch (_) {
      moduleExports = null;
    }
  }

  const constructor = resolveClientConstructor(moduleExports);
  if (!constructor) {
    throw new Error('dingtalk-stream package not found, run: npm --prefix backend install dingtalk-stream');
  }

  return ({ clientId, clientSecret }) => new constructor({ clientId, clientSecret });
}

function resolveClientConstructor(moduleExports) {
  if (!moduleExports) return null;
  if (typeof moduleExports === 'function') return moduleExports;
  if (moduleExports && typeof moduleExports.DWClient === 'function') return moduleExports.DWClient;
  if (moduleExports && typeof moduleExports.Client === 'function') return moduleExports.Client;
  if (moduleExports && typeof moduleExports.default === 'function') return moduleExports.default;
  return null;
}

function parseStreamPayload(rawData) {
  if (!rawData) return {};
  if (typeof rawData === 'string') {
    try {
      return JSON.parse(rawData);
    } catch (_) {
      return {};
    }
  }
  if (typeof rawData === 'object') return rawData;
  return {};
}

function buildStreamConversationId(payload, headers) {
  const fromPayload = String(payload?.conversationId || '').trim();
  if (fromPayload) return fromPayload;
  const fromCandidates = [
    payload?.openConversationId,
    payload?.chatId,
    payload?.cid,
    headers?.conversationId,
    headers?.['conversation-id']
  ].map((x) => String(x || '').trim()).find(Boolean);
  if (fromCandidates) return fromCandidates;

  const sender = String(payload?.senderStaffId || payload?.senderId || payload?.senderNick || 'unknown').trim();
  return `stream:${sender}`;
}

function normalizeAgentResult(response) {
  if (response && typeof response === 'object' && response.result && typeof response.result === 'object') {
    return response.result;
  }
  return response && typeof response === 'object' ? response : {};
}

function normalizeAttachments(input) {
  if (!Array.isArray(input)) return [];
  return input.filter((a) => a && typeof a === 'object').map((a) => ({
    type: String(a.type || '').trim().toLowerCase(),
    url: String(a.url || '').trim(),
    name: String(a.name || '').trim() || undefined,
    mimeType: String(a.mimeType || '').trim() || undefined,
    fileId: String(a.fileId || a.id || '').trim() || undefined
  }));
}

function buildAttachmentBody(attachment) {
  const type = String(attachment?.type || '').trim().toLowerCase();
  const url = String(attachment?.url || '').trim();
  const fileId = String(attachment?.fileId || '').trim();
  const name = String(attachment?.name || '').trim() || 'attachment';
  if (type === 'image') {
    const mediaId = fileId || url;
    if (!mediaId) return null;
    return { msgtype: 'image', image: { mediaId } };
  }
  if (type === 'file' || type === 'audio') {
    const mediaId = fileId || url;
    if (!mediaId) return null;
    return { msgtype: 'file', file: { mediaId, fileName: name } };
  }
  return null;
}

function buildAttachmentFallbackBody(attachment) {
  const name = String(attachment?.name || '').trim() || 'attachment';
  const url = String(attachment?.url || '').trim();
  if (!url) return null;
  return {
    msgtype: 'markdown',
    markdown: {
      title: '附件',
      text: `[${name}](${url})`
    }
  };
}

function createDingtalkStreamBridge(options = {}) {
  const env = options.env || process.env;
  const logger = options.logger || defaultLogger();
  const clientFactory = options.clientFactory || createClientFactory();
  const post = options.postJson || postJson;
  const random = typeof options.random === 'function' ? options.random : Math.random;
  const agentRequestLogger = options.agentRequestLogger || createAgentRequestLogger({ env, logger, random });
  const executeRequest = (() => {
    if (typeof options.executeRequest === 'function') return options.executeRequest;
    if (options.orchestrator && typeof options.orchestrator.execute === 'function') {
      return (request) => options.orchestrator.execute(request);
    }
    return async (request) => {
      const { enqueueConversationRequest } = require('../../session/conversationQueueService');
      return enqueueConversationRequest(request, {
        waitMs: Number(env.SESSION_SYNC_WAIT_MS || env.AGENT_SYNC_TIMEOUT_MS || 4500)
      });
    };
  })();

  const enabled = parseBoolean(env.DINGTALK_STREAM_ENABLED, true);
  const debugPayload = parseBoolean(env.DINGTALK_STREAM_DEBUG_PAYLOAD, false);
  const payloadSampleRate = parseSampleRate(env.DINGTALK_STREAM_PAYLOAD_SAMPLE_RATE, 1);
  const clientId = String(env.DINGTALK_STREAM_CLIENT_ID || env.DINGTALK_APP_KEY || '').trim();
  const clientSecret = String(env.DINGTALK_STREAM_CLIENT_SECRET || env.DINGTALK_APP_SECRET || '').trim();
  let client = null;

  async function handleRobotMessage(streamEvent) {
    const headers = streamEvent?.headers || {};
    const payload = parseStreamPayload(streamEvent?.data);
    const headerMessageId = String(headers.messageId || headers['message-id'] || '').trim();
    const normalizedPayload = {
      ...payload,
      messageId: String(payload?.messageId || payload?.msgId || '').trim() || headerMessageId || undefined,
      conversationId: buildStreamConversationId(payload, headers)
    };
    const traceId = headerMessageId
      || `stream_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
    const requestId = headerMessageId || undefined;

    const request = buildAgentRequestFromDingtalkPayload(normalizedPayload, { traceId, requestId });
    agentRequestLogger.log('dingtalk-stream', request);
    if (debugPayload && random() < payloadSampleRate) {
      logger.info('[dingtalk-stream] payload_sample', {
        traceId,
        raw: sanitizePayloadForLog(normalizedPayload),
        normalized: request
      });
    }

    const response = await executeRequest(request);
    const normalized = normalizeAgentResult(response);

    const sessionWebhook = String(normalizedPayload?.sessionWebhook || '').trim();
    if (!sessionWebhook) return;

    const accessToken = typeof client.getAccessToken === 'function'
      ? await client.getAccessToken()
      : '';

    const result = await post(sessionWebhook, {
      msgtype: 'text',
      text: {
        content: response.mode === 'async'
          ? `消息已受理（taskId=${response.taskId || ''}），请稍后查询结果。`
          : (() => {
              if (normalized?.instance) {
                return `已进入会话实例#${Number(normalized?.instance?.instance_no || 0)}，识别意图：${String(normalized?.intent?.intent || 'unknown')}`;
              }
              const text = String(normalized?.text || response?.text || '').trim();
              return text || '已收到消息';
            })()
      }
    }, accessToken ? {
      'x-acs-dingtalk-access-token': accessToken
    } : {});

    if (typeof client.socketCallBackResponse === 'function' && headers.messageId) {
      client.socketCallBackResponse(headers.messageId, result);
    }

    if (response.mode === 'async') return;
    const attachments = normalizeAttachments(normalized?.attachments);
    for (const attachment of attachments) {
      const body = buildAttachmentBody(attachment);
      try {
        if (body) {
          await post(sessionWebhook, body, accessToken ? { 'x-acs-dingtalk-access-token': accessToken } : {});
          continue;
        }
      } catch (_) {}
      const fallbackBody = buildAttachmentFallbackBody(attachment);
      if (fallbackBody) {
        await post(sessionWebhook, fallbackBody, accessToken ? { 'x-acs-dingtalk-access-token': accessToken } : {});
      }
    }
  }

  async function start() {
    if (!enabled) {
      logger.info('[dingtalk-stream] disabled by DINGTALK_STREAM_ENABLED');
      return { started: false, reason: 'disabled' };
    }
    if (!clientId || !clientSecret) {
      logger.warn('[dingtalk-stream] skip start: missing client credentials');
      return { started: false, reason: 'missing_credentials' };
    }

    client = clientFactory({ clientId, clientSecret });
    client.registerCallbackListener(ROBOT_TOPIC, async (event) => {
      try {
        await handleRobotMessage(event);
      } catch (error) {
        logger.error('[dingtalk-stream] message handling failed:', error?.message || error);
      }
    });

    await client.connect();
    logger.info('[dingtalk-stream] connected');
    return { started: true };
  }

  async function stop() {
    if (!client) return;
    if (typeof client.disconnect === 'function') {
      await client.disconnect();
      return;
    }
    if (typeof client.close === 'function') {
      await client.close();
    }
  }

  return {
    start,
    stop
  };
}

module.exports = {
  createDingtalkStreamBridge,
  createClientFactory,
  postJson,
  resolveClientConstructor
};
