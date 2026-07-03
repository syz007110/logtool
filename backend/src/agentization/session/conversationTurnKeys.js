const MESSAGE_ID_MAX_LENGTH = 128;

const EVENT_SUFFIX = Object.freeze({
  ASSISTANT_FINAL: 'assistant_structured',
  ERROR_RUNTIME: 'error_runtime',
  ORCHESTRATOR_BASE: 'orchestrator',
  TOOL_RESULT_BASE: 'tool_result'
});

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

function buildOrchestratorSuffix(step) {
  const n = Number(step);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error('invalid orchestrator step');
  }
  return `${EVENT_SUFFIX.ORCHESTRATOR_BASE}_${n}`;
}

function buildToolResultSuffix(step, subStep) {
  const n = Number(step);
  const k = Number(subStep);
  if (!Number.isInteger(n) || n < 1 || !Number.isInteger(k) || k < 1) {
    throw new Error('invalid tool_result step');
  }
  return `${EVENT_SUFFIX.TOOL_RESULT_BASE}_${n}_${k}`;
}

function extractLlmTokenUsage(usage) {
  if (!usage || typeof usage !== 'object') return 0;
  const total = Number(usage.total_tokens ?? usage.totalTokens);
  return Number.isFinite(total) && total > 0 ? total : 0;
}

function extractTokenUsageFromTurnResult(turnResult) {
  if (!turnResult || typeof turnResult !== 'object') return 0;
  let total = 0;
  total += extractLlmTokenUsage(turnResult.usage);
  total += extractLlmTokenUsage(turnResult.llmRaw?.usage);
  total += extractLlmTokenUsage(turnResult.llmRaw?.response?.usage);
  return total;
}

function extractTokenUsageFromLoopTrace(loopTrace) {
  if (!Array.isArray(loopTrace)) return 0;
  let total = 0;
  for (const entry of loopTrace) {
    if (entry?.kind !== 'orchestrator') continue;
    total += extractTokenUsageFromTurnResult(entry.turnResult);
  }
  return total;
}

function extractTokenUsageFromTurn(orchestratorResult, assistantResponse) {
  let total = extractTokenUsageFromTurnResult(orchestratorResult);
  const debugMeta = assistantResponse?.debugMeta && typeof assistantResponse.debugMeta === 'object'
    ? assistantResponse.debugMeta
    : {};
  total += extractTokenUsageFromLoopTrace(debugMeta.loopTrace);
  total += extractLlmTokenUsage(debugMeta?.toolExecution?.llmRaw?.response?.usage);
  total += extractLlmTokenUsage(debugMeta?.smartSearch?.llmRaw?.response?.usage);
  return total;
}

module.exports = {
  MESSAGE_ID_MAX_LENGTH,
  EVENT_SUFFIX,
  buildContainerKey,
  buildIdempotencyKey,
  buildMessageId,
  buildEventIdempotencyKey,
  buildOrchestratorSuffix,
  buildToolResultSuffix,
  extractLlmTokenUsage,
  extractTokenUsageFromTurnResult,
  extractTokenUsageFromLoopTrace,
  extractTokenUsageFromTurn
};
