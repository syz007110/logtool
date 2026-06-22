function assertObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
}

function assertNonEmptyString(value, fieldName) {
  const text = String(value || '').trim();
  if (!text) {
    throw new Error(`${fieldName} is required`);
  }
  return text;
}

function clampConfidence(confidence) {
  const num = Number(confidence);
  if (!Number.isFinite(num)) return 0;
  return Math.min(Math.max(num, 0), 1);
}

function optionalString(value) {
  const text = String(value || '').trim();
  return text || undefined;
}

function normalizeTimestamp(value, fallback) {
  const num = Number(value);
  if (Number.isFinite(num) && num > 0) return num;
  return fallback;
}

function normalizeConversationType(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'single' || text === 'group') return text;
  throw new Error('channel.conversationType must be one of: single, group');
}

function assertMessageHasContent(messageText, attachments) {
  const hasText = String(messageText || '').trim().length > 0;
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  if (!hasText && !hasAttachments) {
    throw new Error('message.text and message.attachments cannot both be empty');
  }
}

function normalizeChannelType(value) {
  const text = String(value || '').trim().toLowerCase();
  if (['dingtalk', 'feishu', 'wecom', 'web', 'api'].includes(text)) return text;
  throw new Error('channel.type must be one of: dingtalk, feishu, wecom, web, api');
}

function normalizeMessageType(value, attachments) {
  const text = String(value || '').trim().toLowerCase();
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  if (hasAttachments) return 'text+attachment';
  if (text === 'text+attachment' || text === 'text_with_attachment' || text === 'textwithattachment') {
    return 'text+attachment';
  }
  return 'text';
}

function normalizeAttachments(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      fileId: optionalString(item.fileId || item.id),
      type: ['image', 'file', 'audio'].includes(String(item.type || '').trim().toLowerCase())
        ? String(item.type || '').trim().toLowerCase()
        : 'file',
      name: optionalString(item.name),
      url: optionalString(item.url),
      mimeType: optionalString(item.mimeType)
    }));
}

function buildMessageInput(input) {
  assertObject(input, 'MessageInput');

  const traceId = assertNonEmptyString(input.traceId, 'traceId');
  const requestId = assertNonEmptyString(input.requestId, 'requestId');
  assertObject(input.user, 'user');
  assertObject(input.channel, 'channel');
  assertObject(input.message, 'message');

  const user = {
    id: assertNonEmptyString(input.user.id, 'user.id'),
    name: optionalString(input.user.name),
    platformUserId: optionalString(input.user.platformUserId),
    corpId: optionalString(input.user.corpId),
    isAdmin: input.user.isAdmin == null ? undefined : Boolean(input.user.isAdmin)
  };

  const channelType = normalizeChannelType(input.channel.type);
  const channel = {
    type: channelType,
    conversationType: normalizeConversationType(input.channel.conversationType),
    conversationId: assertNonEmptyString(input.channel.conversationId, 'channel.conversationId'),
    threadId: optionalString(input.channel.threadId),
    robotCode: optionalString(input.channel.robotCode),
    replyWebhook: optionalString(input.channel.replyWebhook),
    replyWebhookExpiredAt: input.channel.replyWebhookExpiredAt == null
      ? undefined
      : normalizeTimestamp(input.channel.replyWebhookExpiredAt, undefined)
  };
  if (channel.conversationType === 'group' && !channel.threadId) {
    throw new Error('channel.threadId is required when conversationType=group');
  }

  const messageInput = input.message && typeof input.message === 'object' ? input.message : {};
  const messageText = String(messageInput.text || '').trim();
  const attachments = normalizeAttachments(messageInput.attachments);
  const externalMessageId = assertNonEmptyString(
    messageInput.externalMessageId,
    'message.externalMessageId'
  );
  const message = {
    externalMessageId,
    type: normalizeMessageType(messageInput.type, attachments),
    text: messageText || undefined,
    contentRaw: messageInput.contentRaw,
    attachments,
    sentAt: normalizeTimestamp(messageInput.sentAt, Date.now()),
    senderPlatform: optionalString(messageInput.senderPlatform)
  };
  assertMessageHasContent(messageText, attachments);

  return {
    traceId,
    requestId,
    user,
    channel,
    message,
    context: {},
    rawPayload: input.rawPayload
  };
}

function buildMessageOutput(input, options = {}) {
  assertObject(input, 'MessageOutput');

  const text = String(input.text || '').trim();
  const attachments = normalizeAttachments(input.attachments);
  if (options.strict !== false) {
    assertMessageHasContent(text, attachments);
  }

  const out = { attachments };
  if (text) out.text = text;

  if (options.session?.conversationId) {
    out.session = {
      conversationId: assertNonEmptyString(options.session.conversationId, 'session.conversationId')
    };
  }

  return out;
}

function buildIntentResult(input) {
  assertObject(input, 'IntentResult');

  return {
    intent: assertNonEmptyString(input.intent, 'intent'),
    confidence: clampConfidence(input.confidence),
    slots: input.slots && typeof input.slots === 'object' ? input.slots : {},
    fallback: Boolean(input.fallback)
  };
}

function buildToolCall(input) {
  assertObject(input, 'ToolCall');

  const retryPolicy = input.retryPolicy && typeof input.retryPolicy === 'object'
    ? input.retryPolicy
    : {};

  return {
    toolName: assertNonEmptyString(input.toolName, 'toolName'),
    input: input.input && typeof input.input === 'object' ? input.input : {},
    timeoutMs: Number.isFinite(Number(input.timeoutMs)) ? Number(input.timeoutMs) : 8000,
    retryPolicy: {
      maxAttempts: Number.isFinite(Number(retryPolicy.maxAttempts)) ? Number(retryPolicy.maxAttempts) : 1,
      backoffMs: Number.isFinite(Number(retryPolicy.backoffMs)) ? Number(retryPolicy.backoffMs) : 0
    }
  };
}

function buildAgentResponse(input) {
  assertObject(input, 'AgentResponse');

  const mode = String(input.mode || 'completed').trim().toLowerCase();
  if (mode !== 'completed' && mode !== 'accepted') {
    throw new Error('mode must be completed or accepted');
  }

  const out = {
    mode,
    text: String(input.text || '').trim(),
    cards: Array.isArray(input.cards) ? input.cards : [],
    links: Array.isArray(input.links) ? input.links : [],
    actions: Array.isArray(input.actions) ? input.actions : [],
    debugMeta: input.debugMeta && typeof input.debugMeta === 'object' ? input.debugMeta : {}
  };

  if (input.taskId) {
    out.taskId = String(input.taskId);
  }

  return out;
}

module.exports = {
  buildMessageInput,
  buildMessageOutput,
  buildIntentResult,
  buildToolCall,
  buildAgentResponse
};
