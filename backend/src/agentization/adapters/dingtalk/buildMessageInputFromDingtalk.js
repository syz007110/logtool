const { buildMessageInput } = require('../../types/contracts');
const { generateUuidV4 } = require('../../../utils/idGenerators');
const {
  extractAttachmentCandidates,
  extractAudioRecognitionText,
  ingestDingtalkAttachments
} = require('./dingtalkAttachmentIngestService');
const {
  buildAttachmentShortCircuit,
  isAttachmentPolicyError,
} = require('../../../services/agentAttachmentPolicy');
const { getAgentFixedT } = require('../../utils/agentI18n');
const {
  validatePreOrchestratorAttachmentCandidates
} = require('../../runtime/attachmentValidationPolicy');

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
  const audioText = extractAudioRecognitionText(payload);
  if (audioText) return audioText;
  const msgtype = String(payload?.msgtype || '').trim().toLowerCase();
  if (msgtype === 'video') return '视频消息';
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

function pickMessageType(attachments) {
  return Array.isArray(attachments) && attachments.length > 0 ? 'text+attachment' : 'text';
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

function buildShortCircuitContext(reason, message, details = {}) {
  return {
    shortCircuit: {
      reason: String(reason || '').trim() || 'direct_response',
      message: String(message || '').trim() || '当前请求不支持直接处理。',
      details: details && typeof details === 'object' ? { ...details } : {}
    }
  };
}

function shouldSkipAttachmentResolution(payload) {
  return String(payload?.msgtype || '').trim().toLowerCase() === 'video';
}

function finalizeMessageInput({
  traceId,
  requestId,
  payload,
  conversationId,
  messageId,
  text,
  contentRaw,
  attachments,
  context
}) {
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
      type: pickMessageType(attachments),
      text,
      contentRaw,
      attachments,
      sentAt: Number(payload?.createAt || payload?.createTime || payload?.timestamp) || Date.now(),
      senderPlatform: String(payload?.senderPlatform || '').trim() || undefined
    },
    context,
    rawPayload: payload
  });
}

async function buildMessageInputFromDingtalkPayload(payload, options = {}) {
  const t = getAgentFixedT('zh');
  const traceId = String(options.traceId || '').trim() || generateUuidV4();
  const requestId = String(options.requestId || '').trim() || generateUuidV4();
  const text = pickText(payload);
  const messageId = pickMessageId(payload);
  const conversationId = String(payload?.conversationId || '').trim();
  if (!conversationId) {
    throw new Error('dingtalk payload conversationId is required');
  }
  let context = {};
  if (shouldSkipAttachmentResolution(payload)) {
    context = buildShortCircuitContext(
      'dingtalk_video_unsupported',
      t('shared.agent.videoUnsupported')
    );
  }
  const contentRaw = payload?.content;
  const extractedCandidates = context.shortCircuit ? [] : extractAttachmentCandidates(payload);
  if (!context.shortCircuit) {
    try {
      validatePreOrchestratorAttachmentCandidates(extractedCandidates, { language: 'zh' });
    } catch (error) {
      const shortCircuit = buildAttachmentShortCircuit(error);
      if (shortCircuit) context = { shortCircuit };
    }
  }
  const fallbackAttachments = extractedCandidates.map((candidate) => ({
    type: candidate.type,
    url: candidate.url || candidate.downloadCode || undefined,
    name: candidate.name,
    mimeType: candidate.mimeType
  }));
  const shouldResolveAttachments = fallbackAttachments.length > 0;
  const attachmentResolver = typeof options.resolveAttachments === 'function'
    ? options.resolveAttachments
    : ingestDingtalkAttachments;
  let attachments = fallbackAttachments;
  if (shouldResolveAttachments && !context.shortCircuit) {
    try {
      attachments = await attachmentResolver(payload, {
        candidates: extractedCandidates,
        uploaderId: String(payload?.senderId || payload?.senderStaffId || '').trim() || undefined
        ,robotCode: String(payload?.robotCode || '').trim() || undefined
      });
      if (!Array.isArray(attachments) || attachments.length === 0) {
        attachments = fallbackAttachments;
      }
    } catch (error) {
      if (isAttachmentPolicyError(error)) {
        const shortCircuit = buildAttachmentShortCircuit(error);
        if (shortCircuit) {
          context = { shortCircuit };
          attachments = [];
        }
        return finalizeMessageInput({
          traceId,
          requestId,
          payload,
          conversationId,
          messageId,
          text,
          contentRaw,
          attachments,
          context,
        });
      }
      attachments = fallbackAttachments;
    }
  }

  return finalizeMessageInput({
    traceId,
    requestId,
    payload,
    conversationId,
    messageId,
    text,
    contentRaw,
    attachments,
    context,
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
