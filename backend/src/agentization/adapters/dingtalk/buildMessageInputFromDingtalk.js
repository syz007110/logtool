const { buildMessageInput } = require('../../types/contracts');
const { generateUuidV4 } = require('../../../utils/idGenerators');

function buildTraceIdFromRequest(req) {
  const headerTraceId = String(req?.headers?.['x-dingtalk-request-id'] || '').trim();
  if (headerTraceId) return headerTraceId;
  return generateUuidV4();
}

function buildRequestIdFromRequest(req) {
  const headerRequestId = String(req?.headers?.['x-request-id'] || '').trim();
  if (headerRequestId) return headerRequestId;
  return generateUuidV4();
}

function pickSender(payload) {
  const sender = payload?.senderStaffId || payload?.senderId || payload?.senderNick || 'unknown';
  return {
    id: String(sender),
    name: String(payload?.senderNick || '').trim() || undefined,
    platformUserId: String(payload?.senderId || '').trim() || undefined,
    corpId: String(payload?.senderCorpId || '').trim() || undefined,
    isAdmin: payload?.isAdmin == null ? undefined : Boolean(payload.isAdmin)
  };
}

function pickText(payload) {
  if (typeof payload?.text?.content === 'string') return payload.text.content.trim();
  if (typeof payload?.content === 'string') {
    const contentText = payload.content.trim();
    if (!contentText) return '';
    try {
      const parsed = JSON.parse(contentText);
      return extractTextFromRichContent(parsed);
    } catch (_) {
      return contentText;
    }
  }
  if (payload?.content && typeof payload.content === 'object') {
    return extractTextFromRichContent(payload.content);
  }
  return '';
}

function pickConversationType(payload) {
  const raw = String(payload?.conversationType || '').trim().toLowerCase();
  if (raw === '2' || raw === 'group' || raw === 'chat') return 'group';
  return 'single';
}

function pickMessageType(payload, text) {
  const raw = String(payload?.msgtype || payload?.msgType || '').trim().toLowerCase();
  if (raw === 'text' || raw === 'image' || raw === 'file' || raw === 'audio') return raw;
  if (raw === 'richtext' || raw === 'rich_text') return 'richText';
  return text ? 'text' : 'unknown';
}

function pickMessageId(payload) {
  const msgId = String(payload?.msgId || payload?.messageId || '').trim();
  if (msgId) return msgId;
  return `dingtalk_msg_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function visitNodes(value, visitor) {
  if (Array.isArray(value)) {
    value.forEach((item) => visitNodes(item, visitor));
    return;
  }
  if (!value || typeof value !== 'object') return;
  visitor(value);
  Object.values(value).forEach((child) => {
    if (child && typeof child === 'object') visitNodes(child, visitor);
  });
}

function extractTextFromRichContent(content) {
  if (!content || typeof content !== 'object') return '';
  const texts = [];
  visitNodes(content, (node) => {
    const t1 = typeof node.text === 'string' ? node.text.trim() : '';
    if (t1) texts.push(t1);
    const type = String(node.type || node.msgtype || '').trim().toLowerCase();
    const t2 = typeof node.content === 'string' ? node.content.trim() : '';
    if (t2 && (type.includes('text') || !type)) texts.push(t2);
  });
  return Array.from(new Set(texts)).join('\n').trim();
}

function inferAttachmentType(node) {
  const rawType = String(node.type || node.msgtype || node.mediaType || '').trim().toLowerCase();
  if (rawType.includes('image') || rawType.includes('picture') || rawType.includes('pic') || rawType.includes('photo')) {
    return 'image';
  }
  if (rawType.includes('audio') || rawType.includes('voice')) return 'audio';
  if (rawType.includes('file') || rawType.includes('doc')) return 'file';

  const url = String(node.url || node.picUrl || node.imageUrl || node.downloadUrl || node.fileUrl || '').trim().toLowerCase();
  if (/\.(png|jpg|jpeg|gif|webp|bmp|svg)($|\?)/.test(url)) return 'image';
  if (/\.(mp3|wav|aac|m4a|ogg)($|\?)/.test(url)) return 'audio';
  if (url) return 'file';
  if (node.downloadCode) return 'file';
  return null;
}

function extractAttachmentsFromRichContent(content) {
  if (!content || typeof content !== 'object') return [];
  const out = [];
  visitNodes(content, (node) => {
    const type = inferAttachmentType(node);
    if (!type) return;
    const url = String(node.url || node.picUrl || node.imageUrl || node.downloadUrl || node.fileUrl || '').trim()
      || String(node.downloadCode || '').trim()
      || undefined;
    out.push({
      type,
      name: String(node.fileName || node.name || node.title || '').trim() || undefined,
      url,
      mimeType: String(node.mimeType || '').trim() || undefined
    });
  });
  return out;
}

function buildMessageInputFromDingtalkPayload(payload, options = {}) {
  const traceId = String(options.traceId || '').trim() || generateUuidV4();
  const requestId = String(options.requestId || '').trim() || generateUuidV4();
  const text = pickText(payload);
  const messageId = pickMessageId(payload);
  const conversationId = String(payload?.conversationId || '').trim();
  if (!conversationId) {
    throw new Error('dingtalk payload conversationId is required');
  }
  const contentRaw = payload?.content;
  const richContent = contentRaw && typeof contentRaw === 'object'
    ? contentRaw
    : (() => {
        if (typeof contentRaw !== 'string') return null;
        try {
          const parsed = JSON.parse(contentRaw);
          return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (_) {
          return null;
        }
      })();
  const richAttachments = extractAttachmentsFromRichContent(richContent);
  const rawAttachments = Array.isArray(payload?.attachments) ? payload.attachments : [];
  const attachments = rawAttachments.length > 0 ? rawAttachments : richAttachments;

  return buildMessageInput({
    traceId,
    requestId,
    user: pickSender(payload),
    channel: {
      type: 'dingtalk',
      conversationType: pickConversationType(payload),
      conversationId,
      threadId: String(payload?.openThreadId || '').trim() || undefined,
      robotCode: String(payload?.robotCode || '').trim() || undefined,
      replyWebhook: String(payload?.sessionWebhook || '').trim() || undefined,
      replyWebhookExpiredAt: Number(payload?.sessionWebhookExpiredTime)
    },
    message: {
      externalMessageId: messageId,
      type: pickMessageType(payload, text),
      text,
      contentRaw,
      attachments,
      sentAt: Number(payload?.createAt || payload?.createTime || payload?.timestamp) || Date.now(),
      senderPlatform: String(payload?.senderPlatform || '').trim() || undefined
    },
    context: {
      atBot: payload?.isInAtList == null ? undefined : Boolean(payload.isInAtList),
      chatbotCorpId: String(payload?.chatbotCorpId || '').trim() || undefined
    },
    rawPayload: payload
  });
}

function buildMessageInputFromDingtalk(req) {
  const payload = req?.body && typeof req.body === 'object' ? req.body : {};
  return buildMessageInputFromDingtalkPayload(payload, {
    traceId: buildTraceIdFromRequest(req),
    requestId: buildRequestIdFromRequest(req)
  });
}

module.exports = {
  buildMessageInputFromDingtalk,
  buildMessageInputFromDingtalkPayload
};
