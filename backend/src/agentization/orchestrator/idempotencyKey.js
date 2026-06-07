const crypto = require('crypto');

function normalizePart(value) {
  const text = String(value || '').trim();
  return text || '-';
}

function createSourceIdempotencyKey(request) {
  const platform = normalizePart(request?.channel?.type);
  const corpId = normalizePart(request?.user?.corpId || request?.context?.chatbotCorpId);
  const robotCode = normalizePart(request?.channel?.robotCode);
  const conversationId = normalizePart(request?.channel?.conversationId);
  const threadId = normalizePart(request?.channel?.threadId);
  const senderId = normalizePart(request?.user?.platformUserId || request?.user?.id);
  const messageId = normalizePart(request?.message?.externalMessageId || request?.requestId);

  return [
    platform,
    corpId,
    robotCode,
    conversationId,
    threadId,
    senderId,
    messageId
  ].join('|');
}

function buildCanonicalId(request) {
  const sourceIdempotencyKey = createSourceIdempotencyKey(request);
  const canonicalId = crypto.createHash('sha256').update(sourceIdempotencyKey).digest('hex');
  return {
    sourceIdempotencyKey,
    canonicalId
  };
}

module.exports = {
  createSourceIdempotencyKey,
  buildCanonicalId
};
