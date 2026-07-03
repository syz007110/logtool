const qwenService = require('../../services/qwenService');
const { buildInitialLoopMessages } = require('./chatRequestAssembler');

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

function resolveRunContext(request, context = {}) {
  const envelope = context?.contextEnvelope && typeof context.contextEnvelope === 'object'
    ? context.contextEnvelope
    : {};
  const llmProviderId = String(request?.context?.llmProviderId || '').trim() || undefined;
  const userPermissions = Array.isArray(request?.context?.userPermissions)
    ? request.context.userPermissions
    : undefined;
  return { envelope, llmProviderId, userPermissions };
}

/** Orchestrator LLM：Chat Completions + native tool_calls */
function createConversationOrchestrator() {
  return {
    buildInitialLoopMessages(request, context = {}) {
      const { envelope, userPermissions } = resolveRunContext(request, context);
      return buildInitialLoopMessages({
        contextEnvelope: envelope,
        userPermissions,
        traceId: request?.traceId
      });
    },

    async runWithMessages(request, context = {}) {
      const { envelope, llmProviderId, userPermissions } = resolveRunContext(request, context);
      const messages = Array.isArray(context.messages) ? context.messages : [];
      if (!isOrchestratorLlmEnabled()) {
        const err = new Error('orchestrator LLM is disabled by AGENT_ORCHESTRATOR_LLM_ENABLED');
        err.code = 'ORCHESTRATOR_LLM_DISABLED';
        throw err;
      }
      let turnResult = null;
      try {
        turnResult = await qwenService.runOrchestratorLlmWithMessages({
          contextEnvelope: envelope,
          messages,
          providerId: llmProviderId,
          userPermissions,
          traceId: request?.traceId,
          allowEmptyResponse: Boolean(context.allowEmptyResponse)
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
