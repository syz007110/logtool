const { buildMessageInput } = require('../../types/contracts');
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
  if (fromHeader && UUID_V4_REGEX.test(fromHeader)) return fromHeader;
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
  const authUser = req?.user && typeof req.user === 'object' ? req.user : null;
  if (!authUser?.id) {
    throw new Error('authenticated user is required');
  }
  const incomingMessageId = String(body.message?.externalMessageId || '').trim();
  if (!incomingMessageId) {
    throw new Error('message.externalMessageId is required');
  }
  const externalMessageId = assertMatches(incomingMessageId, ULID_REGEX, 'message.externalMessageId');
  const requestId = buildRequestId();
  const traceId = buildTraceId(req);

  const normalizedMessage = body.message && typeof body.message === 'object'
    ? {
        ...body.message,
        externalMessageId
      }
    : {
        externalMessageId,
        type: 'text',
        text: String(body.text || '').trim(),
        attachments: Array.isArray(body.attachments) ? body.attachments : [],
        sentAt: Date.now()
      };

  const rawChannel = body.channel && typeof body.channel === 'object' ? body.channel : null;
  if (!rawChannel) {
    throw new Error('channel is required');
  }
  const channelType = String(rawChannel.type || 'web').trim().toLowerCase();
  if (channelType !== 'web') {
    throw new Error('channel.type must be web');
  }
  const conversationId = String(rawChannel.conversationId || '').trim() || generateUlid();
  const conversationIdProvided = Boolean(String(rawChannel.conversationId || '').trim());

  const request = buildMessageInput({
    traceId,
    requestId,
    user: {
      id: String(authUser.id),
      name: authUser.username || authUser.name || undefined
    },
    channel: {
      ...rawChannel,
      type: 'web',
      conversationType: String(rawChannel.conversationType || 'single').trim().toLowerCase() || 'single',
      conversationId
    },
    message: normalizedMessage,
    context: {},
    rawPayload: body.rawPayload
  });
  request.__conversationIdProvided = conversationIdProvided;
  return request;
}

function renderOutbound({ req, res, request, response }) {
  if (String(response?.mode || '').toLowerCase() !== 'sync') {
    throw new Error('phase1 supports sync mode only');
  }

  const result = response?.result && typeof response.result === 'object' ? response.result : {};
  const out = {
    text: String(result.text || '').trim(),
    attachments: Array.isArray(result.attachments) ? result.attachments : []
  };
  if (!request.__conversationIdProvided) {
    out.session = { conversationId: String(request?.channel?.conversationId || '') };
  }

  return res.json({
    ok: true,
    traceId: request.traceId,
    requestId: request.requestId,
    taskId: response.taskId,
    mode: 'sync',
    response: out
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
