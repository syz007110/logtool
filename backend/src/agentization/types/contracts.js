function assertObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
}

function optionalObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function assertNonEmptyString(value, fieldName) {
  const text = String(value || '').trim();
  if (!text) {
    throw new Error(`${fieldName} is required`);
  }
  return text;
}

function optionalString(value) {
  const text = String(value || '').trim();
  return text || undefined;
}

function optionalNullableNumber(value) {
  if (value == null || value === '') return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function optionalBoolean(value) {
  if (value == null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (text === 'true' || text === '1' || text === 'yes' || text === 'on') return true;
  if (text === 'false' || text === '0' || text === 'no' || text === 'off') return false;
  return undefined;
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

function normalizeAttachmentType(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'image' || text === 'file' || text === 'audio') return text;
  return 'file';
}

function normalizeAttachmentStatus(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'available' || text === 'deleted' || text === 'expired' || text === 'failed') {
    return text;
  }
  return 'available';
}

function normalizeAttachments(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => {
      const assetId = optionalString(item.assetId);
      const originalName = optionalString(item.originalName);
      const storedName = optionalString(item.storedName);
      const previewUrl = optionalString(item.previewUrl);
      const url = optionalString(item.url);

      return {
        assetId,
        type: normalizeAttachmentType(item.type),
        storage: optionalString(item.storage),
        objectKey: optionalString(item.objectKey),
        bucket: optionalString(item.bucket),
        originalName,
        storedName,
        mimeType: optionalString(item.mimeType),
        sizeBytes: optionalNullableNumber(item.sizeBytes),
        sha256: optionalString(item.sha256),
        uploaderId: optionalString(item.uploaderId),
        source: optionalString(item.source),
        previewUrl,
        url,
        width: item.width == null ? null : (optionalNullableNumber(item.width) ?? null),
        height: item.height == null ? null : (optionalNullableNumber(item.height) ?? null),
        status: normalizeAttachmentStatus(item.status)
      };
    });
}

function buildMessageInput(input) {
  assertObject(input, 'MessageInput');

  const traceId = assertNonEmptyString(input.traceId, 'traceId');
  const requestId = assertNonEmptyString(input.requestId, 'requestId');
  assertObject(input.user, 'user');
  assertObject(input.channel, 'channel');
  assertObject(input.message, 'message');

  const rawContext = optionalObject(input.context);
  const rawSession = optionalObject(input.session);
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

  const normalizedContext = { ...rawContext };
  const contextInstanceId = optionalNullableNumber(rawContext.instanceId);
  const sessionInstanceId = optionalNullableNumber(rawSession.instanceId);
  if (contextInstanceId != null) {
    normalizedContext.instanceId = contextInstanceId;
  } else if (sessionInstanceId != null) {
    normalizedContext.instanceId = sessionInstanceId;
  }

  const session = {};
  if (sessionInstanceId != null) {
    session.instanceId = sessionInstanceId;
  }
  const sessionForceNewInstance = optionalBoolean(rawSession.forceNewInstance);
  if (sessionForceNewInstance != null) {
    session.forceNewInstance = sessionForceNewInstance;
  }

  return {
    traceId,
    requestId,
    user,
    channel,
    message,
    context: normalizedContext,
    session,
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

  const sessionOptions = options.session && typeof options.session === 'object'
    ? options.session
    : null;
  const conversationId = optionalString(sessionOptions?.conversationId);
  const instanceId = optionalNullableNumber(sessionOptions?.instanceId);
  if (conversationId || instanceId != null) {
    out.session = {};
    if (conversationId) {
      out.session.conversationId = assertNonEmptyString(conversationId, 'session.conversationId');
    }
    if (instanceId != null) {
      out.session.instanceId = instanceId;
    }
  }

  return out;
}

module.exports = {
  buildMessageInput,
  buildMessageOutput
};
