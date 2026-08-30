const {
  MAX_FILES,
  MAX_TOTAL_SIZE
} = require('../../../services/agentAttachmentPolicy');
const {
  extractAttachmentCandidates,
  extractAudioRecognitionText
} = require('./dingtalkAttachmentIngestService');

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

function parsePositiveInt(value, fallback) {
  const normalized = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(normalized) || normalized <= 0) return fallback;
  return normalized;
}

function buildMessageId(payload) {
  return String(payload?.messageId || payload?.msgId || '').trim();
}

function buildAggregationKey(payload) {
  const channelType = 'dingtalk';
  const conversationId = String(payload?.conversationId || '').trim();
  const senderStaffId = String(payload?.senderStaffId || '').trim();
  if (!conversationId || !senderStaffId) return '';
  return `${channelType}:${conversationId}:${senderStaffId}`;
}

function parseContentObject(payload) {
  const content = payload?.content;
  if (content && typeof content === 'object' && !Array.isArray(content)) return content;
  if (typeof content !== 'string') return null;
  const text = content.trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
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

function collectCandidateSizeMap(payload) {
  const content = parseContentObject(payload);
  const sizeMap = new Map();
  visitNodes(content, (node) => {
    if (!node || typeof node !== 'object') return;
    const downloadCode = String(node.downloadCode || node.pictureDownloadCode || '').trim();
    const url = String(node.url || '').trim();
    const name = String(
      node.fileName
      || node.pictureName
      || node.videoName
      || node.name
      || ''
    ).trim();
    if (!downloadCode && !url) return;
    const sizeBytes = Number(
      node.sizeBytes
      || node.fileSize
      || node.pictureSize
      || node.videoSize
      || node.size
      || 0
    );
    sizeMap.set(`${downloadCode}|${url}|${name}`, Number.isFinite(sizeBytes) ? sizeBytes : 0);
  });
  return sizeMap;
}

function estimateAttachmentSizeBytes(payload, candidate) {
  const key = `${candidate?.downloadCode || ''}|${candidate?.url || ''}|${candidate?.name || ''}`;
  const contentSizeMap = collectCandidateSizeMap(payload);
  return Number(contentSizeMap.get(key) || 0);
}

function extractMessageText(payload) {
  if (typeof payload?.text?.content === 'string') return payload.text.content.trim();
  const audioText = extractAudioRecognitionText(payload);
  if (audioText) return audioText;
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

function normalizeRawMessage(payload, arrivedAt) {
  const attachments = extractAttachmentCandidates(payload).map((candidate) => ({
    type: candidate.type,
    name: candidate.name,
    mimeType: candidate.mimeType,
    downloadCode: candidate.downloadCode,
    url: candidate.url,
    sizeBytes: estimateAttachmentSizeBytes(payload, candidate)
  }));
  return {
    messageId: buildMessageId(payload),
    arrivedAt,
    type: String(payload?.msgtype || 'text').trim().toLowerCase() || 'text',
    text: extractMessageText(payload),
    attachments
  };
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(candidates) ? candidates : []) {
    if (!item || typeof item !== 'object') continue;
    const key = `${item.downloadCode || ''}|${item.url || ''}|${item.name || ''}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function buildRichTextNode(candidate) {
  const type = String(candidate?.sourceNodeType || candidate?.type || '').trim().toLowerCase();
  if (type === 'picture' || type === 'image') {
    return {
      type: 'picture',
      downloadCode: candidate.downloadCode,
      pictureName: candidate.name,
      pictureType: candidate.mimeType,
      pictureSize: Number(candidate.sizeBytes || 0) || undefined
    };
  }
  if (type === 'video') {
    return {
      type: 'video',
      downloadCode: candidate.downloadCode,
      videoName: candidate.name,
      videoType: candidate.mimeType,
      videoSize: Number(candidate.sizeBytes || 0) || undefined
    };
  }
  return {
    type: 'file',
    downloadCode: candidate.downloadCode,
    url: candidate.url,
    fileName: candidate.name,
    fileType: candidate.mimeType,
    fileSize: Number(candidate.sizeBytes || 0) || undefined
  };
}

function buildBatchMessageId() {
  return `dingtalk_batch_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function buildAggregatedPayload(entry, flushReason, batchMessageId = buildBatchMessageId()) {
  const firstPayload = entry.messages[0]?.payload || {};
  const lastPayload = entry.messages[entry.messages.length - 1]?.payload || {};
  const textParts = [];
  const attachments = [];
  const rawMessages = [];

  for (const item of entry.messages) {
    const text = extractMessageText(item.payload);
    if (text) textParts.push(text);
    const candidates = extractAttachmentCandidates(item.payload).map((candidate) => ({
      ...candidate,
      sizeBytes: estimateAttachmentSizeBytes(item.payload, candidate)
    }));
    attachments.push(...candidates);
    rawMessages.push(normalizeRawMessage(item.payload, item.arrivedAt));
  }

  const dedupedAttachments = dedupeCandidates(attachments);
  const aggregatedPayload = {
    ...firstPayload,
    ...lastPayload,
    msgId: batchMessageId,
    messageId: batchMessageId,
    msgtype: dedupedAttachments.length > 0 ? 'richtext' : 'text',
    text: {
      content: textParts.join('\n').trim()
    },
    rawMessages,
    aggregationMeta: {
      batchMessageId,
      startedAt: entry.startedAt,
      lastMessageAt: entry.lastMessageAt,
      flushedAt: entry.flushedAt,
      flushReason,
      messageCount: entry.messages.length,
      deduplicatedCount: entry.deduplicatedCount
    }
  };

  if (dedupedAttachments.length > 0) {
    aggregatedPayload.content = JSON.stringify({
      richText: dedupedAttachments.map(buildRichTextNode)
    });
  } else if (aggregatedPayload.text.content) {
    aggregatedPayload.content = aggregatedPayload.text.content;
  }

  return aggregatedPayload;
}

function createDingtalkInboundMessageAggregator(options = {}) {
  const env = options.env || process.env;
  const logger = options.logger || defaultLogger();
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const setTimer = typeof options.setTimer === 'function' ? options.setTimer : setTimeout;
  const clearTimer = typeof options.clearTimer === 'function' ? options.clearTimer : clearTimeout;
  const onFlush = typeof options.onFlush === 'function' ? options.onFlush : async () => {};
  const enabled = parseBoolean(env.DINGTALK_STREAM_MESSAGE_AGGREGATION_ENABLED, true);
  const maxWindowMs = parsePositiveInt(env.DINGTALK_STREAM_MESSAGE_AGGREGATION_MAX_WINDOW_MS, 3000);
  const silenceMs = parsePositiveInt(env.DINGTALK_STREAM_MESSAGE_AGGREGATION_SILENCE_MS, 800);
  const state = new Map();

  async function flushEntry(key, reason) {
    const entry = state.get(key);
    if (!entry || entry.flushing) return;
    entry.flushing = true;
    if (entry.maxTimer) clearTimer(entry.maxTimer);
    if (entry.silenceTimer) clearTimer(entry.silenceTimer);
    entry.flushedAt = now();
    state.delete(key);
    const payload = buildAggregatedPayload(entry, reason);
    logger.info('[dingtalk-stream] aggregate_flush', {
      key,
      flushReason: reason,
      messageCount: entry.messages.length,
      deduplicatedCount: entry.deduplicatedCount
    });
    await onFlush({
      payload,
      headers: entry.messages[entry.messages.length - 1]?.headers || {},
      flushReason: reason,
      rawMessages: payload.rawMessages
    });
  }

  function scheduleSilenceFlush(key) {
    const entry = state.get(key);
    if (!entry) return;
    if (entry.silenceTimer) clearTimer(entry.silenceTimer);
    entry.silenceTimer = setTimer(() => {
      flushEntry(key, 'silence').catch((error) => {
        logger.error('[dingtalk-stream] aggregate silence flush failed:', error?.message || error);
      });
    }, silenceMs);
  }

  function shouldFlushByAttachmentThreshold(entry) {
    return entry.attachmentCount >= MAX_FILES || entry.totalAttachmentSizeBytes >= MAX_TOTAL_SIZE;
  }

  async function accept({ headers = {}, payload = {} }) {
    if (!enabled) {
      await onFlush({
        payload,
        headers,
        flushReason: 'disabled',
        rawMessages: [normalizeRawMessage(payload, now())]
      });
      return;
    }

    const key = buildAggregationKey(payload);
    if (!key) {
      await onFlush({
        payload,
        headers,
        flushReason: 'missing_key',
        rawMessages: [normalizeRawMessage(payload, now())]
      });
      return;
    }

    const arrivedAt = now();
    const messageId = buildMessageId(payload);
    let entry = state.get(key);
    if (!entry) {
      entry = {
        key,
        startedAt: arrivedAt,
        lastMessageAt: arrivedAt,
        flushedAt: null,
        messages: [],
        seenMessageIds: new Set(),
        deduplicatedCount: 0,
        attachmentCount: 0,
        totalAttachmentSizeBytes: 0,
        maxTimer: null,
        silenceTimer: null,
        flushing: false
      };
      entry.maxTimer = setTimer(() => {
        flushEntry(key, 'max_window').catch((error) => {
          logger.error('[dingtalk-stream] aggregate max-window flush failed:', error?.message || error);
        });
      }, maxWindowMs);
      state.set(key, entry);
    }

    if (messageId && entry.seenMessageIds.has(messageId)) {
      entry.deduplicatedCount += 1;
      return;
    }
    if (messageId) entry.seenMessageIds.add(messageId);

    const candidates = extractAttachmentCandidates(payload).map((candidate) => ({
      ...candidate,
      sizeBytes: estimateAttachmentSizeBytes(payload, candidate)
    }));
    entry.attachmentCount += candidates.length;
    entry.totalAttachmentSizeBytes += candidates.reduce((sum, item) => sum + Number(item?.sizeBytes || 0), 0);
    entry.lastMessageAt = arrivedAt;
    entry.messages.push({
      headers,
      payload,
      arrivedAt
    });

    if (shouldFlushByAttachmentThreshold(entry)) {
      await flushEntry(key, 'attachment_threshold');
      return;
    }

    scheduleSilenceFlush(key);
  }

  return {
    accept
  };
}

module.exports = {
  buildAggregationKey,
  buildAggregatedPayload,
  createDingtalkInboundMessageAggregator
};
