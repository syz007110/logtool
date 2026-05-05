const { buildAgentRequest } = require('../../types/contracts');
const { generateUlid, generateUuidV4 } = require('../../../utils/idGenerators');

const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertMatches(value, pattern, fieldName) {
  const text = String(value || '').trim();
  if (!pattern.test(text)) {
    throw new Error(`${fieldName} format is invalid`);
  }
  return text;
}

function buildTraceId(req) {
  const fromHeader = String(req?.headers?.['x-trace-id'] || '').trim();
  if (fromHeader) return fromHeader;
  return generateUuidV4();
}

function buildWebMessageId(timestampMs = Date.now()) {
  return generateUlid(timestampMs);
}

function buildRequestId() {
  return generateUuidV4();
}

function parseInbound(req) {
  const body = req?.body && typeof req.body === 'object' ? req.body : {};
  const incomingMessageId = String(body.message?.id || '').trim();
  const messageId = incomingMessageId
    ? assertMatches(incomingMessageId, ULID_REGEX, 'message.id')
    : buildWebMessageId(body.message?.sentAt || Date.now());
  const requestIdRaw = String(body.requestId || '').trim() || buildRequestId();
  const traceIdRaw = String(body.traceId || '').trim() || buildTraceId(req);
  const requestId = assertMatches(requestIdRaw, UUID_V4_REGEX, 'requestId');
  const traceId = assertMatches(traceIdRaw, UUID_V4_REGEX, 'traceId');

  const normalizedMessage = body.message && typeof body.message === 'object'
    ? {
        ...body.message,
        id: messageId
      }
    : {
        id: messageId,
        type: 'text',
        text: String(body.text || '').trim(),
        attachments: Array.isArray(body.attachments) ? body.attachments : [],
        sentAt: Date.now()
      };

  const rawChannel = body.channel && typeof body.channel === 'object' ? body.channel : null;
  if (!rawChannel) {
    throw new Error('channel is required');
  }
  const conversationId = String(rawChannel.conversationId || '').trim();
  if (!conversationId) {
    throw new Error('channel.conversationId is required');
  }

  const request = buildAgentRequest({
    traceId,
    requestId,
    user: body.user || { id: 'internal' },
    channel: rawChannel,
    message: normalizedMessage,
    context: body.context || {},
    rawPayload: body.rawPayload
  });
  return request;
}

function renderOutbound({ req, res, request, response }) {
  if (response.mode === 'async') {
    return res.status(202).json({
      ok: true,
      traceId: request.traceId,
      requestId: request.requestId,
      taskId: response.taskId,
      mode: 'async'
    });
  }

  return res.json({
    ok: true,
    traceId: request.traceId,
    requestId: request.requestId,
    taskId: response.taskId,
    mode: 'sync',
    response: response.result
  });
}

function renderError({ req, res, error }) {
  return res.status(400).json({
    ok: false,
    message: String(error?.message || error)
  });
}

module.exports = {
  parseInbound,
  renderOutbound,
  renderError,
  buildTraceId,
  buildWebMessageId,
  buildRequestId
};
