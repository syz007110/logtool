const qwenService = require('../../services/qwenService');

function parseBool(value, fallback = true) {
  const s = String(value == null ? '' : value).trim().toLowerCase();
  if (!s) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return fallback;
}

function isOrchestratorLlmEnabled() {
  return parseBool(process.env.AGENT_ORCHESTRATOR_LLM_ENABLED, true);
}

function sanitizeOrchestratorLlmRaw(turnResult) {
  if (!turnResult || typeof turnResult !== 'object') return null;
  return {
    request: turnResult.llmRaw?.request || turnResult.chatRequest || null,
    response: turnResult.llmRaw?.response || turnResult.chatResponse || null,
    usage: turnResult.usage || turnResult.llmRaw?.usage || null
  };
}

/** Orchestrator LLM：Chat Completions + native tool_calls */
function createConversationOrchestrator() {
  return {
    async run(request, context = {}) {
      const envelope = context?.contextEnvelope && typeof context.contextEnvelope === 'object'
        ? context.contextEnvelope
        : {};
      if (!isOrchestratorLlmEnabled()) {
        const err = new Error('orchestrator LLM is disabled by AGENT_ORCHESTRATOR_LLM_ENABLED');
        err.code = 'ORCHESTRATOR_LLM_DISABLED';
        throw err;
      }
      const llmProviderId = String(request?.context?.llmProviderId || '').trim() || undefined;
      const userPermissions = Array.isArray(request?.context?.userPermissions)
        ? request.context.userPermissions
        : undefined;
      let turnResult = null;
      try {
        turnResult = await qwenService.runOrchestratorLlmWithProvider({
          contextEnvelope: envelope,
          providerId: llmProviderId,
          userPermissions,
          traceId: request?.traceId
        });
      } catch (error) {
        const err = new Error(`orchestrator LLM failed: ${String(error?.message || error)}`);
        err.code = String(error?.code || 'ORCHESTRATOR_LLM_FAILED');
        throw err;
      }
      return {
        ...turnResult,
        llmRaw: sanitizeOrchestratorLlmRaw(turnResult)
      };
    }
  };
}

module.exports = {
  createConversationOrchestrator
};
