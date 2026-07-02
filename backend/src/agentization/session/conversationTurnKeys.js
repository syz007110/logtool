const MESSAGE_ID_MAX_LENGTH = 128;

function buildContainerKey(request) {
  const channel = String(request?.channel?.type || '').trim().toLowerCase();
  const userId = String(request?.user?.id || '').trim();
  const conversationId = String(request?.channel?.conversationId || '').trim();
  return `${channel}:${userId}:${conversationId}`;
}

function buildIdempotencyKey(request) {
  const channel = String(request?.channel?.type || '').trim().toLowerCase();
  const userId = String(request?.user?.id || '').trim();
  const conversationId = String(request?.channel?.conversationId || '').trim();
  const messageId = String(request?.message?.externalMessageId || '').trim();
  return `${channel}:${userId}:${conversationId}:${messageId}`;
}

function buildMessageId(request, suffix) {
  const base = String(request?.message?.externalMessageId || request?.requestId || '').trim() || `msg_${Date.now()}`;
  const normalizedSuffix = String(suffix || '').trim();
  if (!normalizedSuffix) return base.slice(0, MESSAGE_ID_MAX_LENGTH);

  const delimiter = ':';
  const suffixLength = normalizedSuffix.length + delimiter.length;
  const baseMaxLength = Math.max(1, MESSAGE_ID_MAX_LENGTH - suffixLength);
  return `${base.slice(0, baseMaxLength)}${delimiter}${normalizedSuffix}`.slice(0, MESSAGE_ID_MAX_LENGTH);
}

function buildEventIdempotencyKey(request, suffix) {
  const normalizedSuffix = String(suffix || '').trim();
  if (!normalizedSuffix) return buildIdempotencyKey(request);
  return `${buildIdempotencyKey(request)}:${normalizedSuffix}`;
}

function extractLlmTokenUsage(usage) {
  if (!usage || typeof usage !== 'object') return 0;
  const total = Number(usage.total_tokens ?? usage.totalTokens);
  return Number.isFinite(total) && total > 0 ? total : 0;
}

function extractTokenUsageFromTurn(orchestratorResult, assistantResponse) {
  let total = 0;
  total += extractLlmTokenUsage(orchestratorResult?.usage);
  total += extractLlmTokenUsage(orchestratorResult?.llmRaw?.usage);
  total += extractLlmTokenUsage(orchestratorResult?.llmRaw?.response?.usage);
  const debugMeta = assistantResponse?.debugMeta && typeof assistantResponse.debugMeta === 'object'
    ? assistantResponse.debugMeta
    : {};
  total += extractLlmTokenUsage(debugMeta?.toolExecution?.llmRaw?.response?.usage);
  total += extractLlmTokenUsage(debugMeta?.smartSearch?.llmRaw?.response?.usage);
  return total;
}

module.exports = {
  MESSAGE_ID_MAX_LENGTH,
  buildContainerKey,
  buildIdempotencyKey,
  buildMessageId,
  buildEventIdempotencyKey,
  extractLlmTokenUsage,
  extractTokenUsageFromTurn
};
