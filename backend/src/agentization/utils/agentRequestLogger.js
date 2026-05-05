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

function removeUndefinedDeep(value) {
  if (Array.isArray(value)) {
    return value.map(removeUndefinedDeep);
  }
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    out[k] = removeUndefinedDeep(v);
  }
  return out;
}

function maskIdentifier(value) {
  const text = String(value || '').trim();
  if (!text) return undefined;
  if (text.length <= 6) return '***';
  return `${text.slice(0, 3)}***${text.slice(-3)}`;
}

function sanitizeWebhook(value) {
  const text = String(value || '').trim();
  if (!text) return undefined;
  try {
    const u = new URL(text);
    return `${u.origin}${u.pathname}`;
  } catch (_) {
    return '[REDACTED_WEBHOOK]';
  }
}

function normalizeRequestForLog(request) {
  const normalized = {
    traceId: String(request?.traceId || ''),
    requestId: String(request?.requestId || ''),
    user: {
      id: maskIdentifier(request?.user?.id),
      name: request?.user?.name,
      platformUserId: maskIdentifier(request?.user?.platformUserId),
      corpId: maskIdentifier(request?.user?.corpId),
      isAdmin: request?.user?.isAdmin
    },
    channel: {
      type: request?.channel?.type,
      conversationType: request?.channel?.conversationType,
      conversationId: maskIdentifier(request?.channel?.conversationId),
      threadId: maskIdentifier(request?.channel?.threadId),
      robotCode: maskIdentifier(request?.channel?.robotCode),
      replyWebhook: sanitizeWebhook(request?.channel?.replyWebhook),
      replyWebhookExpiredAt: request?.channel?.replyWebhookExpiredAt
    },
    message: {
      id: String(request?.message?.id || ''),
      type: request?.message?.type,
      text: String(request?.message?.text || ''),
      contentRaw: request?.message?.contentRaw,
      attachments: Array.isArray(request?.message?.attachments) ? request.message.attachments : [],
      sentAt: request?.message?.sentAt,
      senderPlatform: request?.message?.senderPlatform
    },
    context: request?.context || {},
    rawPayload: request?.rawPayload
  };
  return removeUndefinedDeep(normalized);
}

function createAgentRequestLogger(options = {}) {
  const env = options.env || process.env;
  const logger = options.logger || console;
  const random = typeof options.random === 'function' ? options.random : Math.random;
  const enabled = parseBoolean(env.AGENT_REQUEST_LOG, false);
  const sampleRate = parseSampleRate(env.AGENT_REQUEST_LOG_SAMPLE_RATE, 1);

  return {
    log(source, request) {
      if (!enabled) return;
      if (random() >= sampleRate) return;
      logger.info('[agent-request] normalized', {
        source: String(source || 'unknown'),
        request: normalizeRequestForLog(request)
      });
    }
  };
}

module.exports = {
  createAgentRequestLogger
};
