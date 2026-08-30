const { logOperation } = require('../../utils/operationLogger');
const { extractTokenUsageFromLoopTrace } = require('../session/conversationTurnKeys');

function normalizeText(value) {
  return String(value || '').trim();
}

function pickToolNames(loopTrace) {
  const entries = Array.isArray(loopTrace) ? loopTrace : [];
  const names = [];
  for (const entry of entries) {
    if (!entry || entry.kind !== 'tool') continue;
    const toolName = normalizeText(entry.toolName);
    if (!toolName) continue;
    names.push(toolName);
  }
  return {
    toolNames: Array.from(new Set(names)),
    toolCallCount: names.length
  };
}

async function writeAgentAuditLog({
  request,
  loopTrace = [],
  result = null,
  status = 'success',
  error = null
}) {
  const { toolNames, toolCallCount } = pickToolNames(loopTrace);
  const tokenUsage = extractTokenUsageFromLoopTrace(loopTrace);
  const userIdRaw = request?.user?.id;
  const userId = Number.isFinite(Number(userIdRaw)) ? Number(userIdRaw) : null;
  const username = normalizeText(request?.user?.name || request?.user?.username);
  const channel = normalizeText(request?.channel?.type || 'unknown');
  const conversationId = normalizeText(request?.channel?.conversationId);
  const instanceId = Number(result?.session?.instanceId || result?.instance?.id || 0) || null;

  await logOperation({
    operation: 'agent_conversation_turn',
    description: `Agent 对话${status === 'success' ? '完成' : '失败'}: channel=${channel}, tools=${toolCallCount}`,
    user_id: userId,
    username,
    status,
    details: {
      traceId: normalizeText(request?.traceId),
      requestId: normalizeText(request?.requestId),
      conversationId: conversationId || null,
      instanceId,
      channel,
      toolNames,
      toolCallCount,
      tokenUsage,
      error: error ? {
        code: normalizeText(error?.code) || 'AGENT_RUNTIME_FAILED',
        message: normalizeText(error?.message || error)
      } : null
    }
  });
}

function fireAndForgetAgentAuditLog(payload) {
  Promise.resolve()
    .then(async () => {
      await writeAgentAuditLog(payload);
    })
    .catch((err) => {
      console.warn('[agent-audit] logOperation failed (ignored):', err?.message || err);
    });
}

module.exports = {
  writeAgentAuditLog,
  fireAndForgetAgentAuditLog
};
