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
      name: authUser.username || authUser.name || undefined,
      isAdmin: authUser.isAdmin == null ? undefined : Boolean(authUser.isAdmin)
    },
    channel: {
      ...rawChannel,
      type: 'web',
      conversationType: String(rawChannel.conversationType || 'single').trim().toLowerCase() || 'single',
      conversationId
    },
    message: normalizedMessage,
    context: body.context && typeof body.context === 'object' ? body.context : {},
    rawPayload: body.rawPayload
  });
  request.__conversationIdProvided = conversationIdProvided;
  return request;
}

function renderOutbound({ req, res, request, response }) {
  const mode = String(response?.mode || 'completed').trim().toLowerCase();
  const base = {
    ok: true,
    traceId: request.traceId,
    requestId: request.requestId,
    taskId: response.taskId,
    mode
  };

  if (mode === 'accepted') {
    const payload = {
      ...base,
      message: String(response?.message || '任务已受理，处理完成后可通过 taskId 查询结果').trim()
    };
    if (!request.__conversationIdProvided) {
      payload.session = { conversationId: String(request?.channel?.conversationId || '') };
    }
    return res.json(payload);
  }

  const result = response?.result && typeof response.result === 'object' ? response.result : {};
  const out = {
    text: String(result.text || '').trim(),
    attachments: Array.isArray(result.attachments) ? result.attachments : []
  };
  if (result.instance && typeof result.instance === 'object') {
    out.instance = result.instance;
  }
  if (result.policy && typeof result.policy === 'object') {
    out.policy = result.policy;
  }
  if (!request.__conversationIdProvided) {
    out.session = { conversationId: String(request?.channel?.conversationId || '') };
  }

  return res.json({
    ...base,
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
