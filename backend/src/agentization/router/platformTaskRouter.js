const qwenService = require('../../services/qwenService');

function parseBool(value, fallback = true) {
  const s = String(value == null ? '' : value).trim().toLowerCase();
  if (!s) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return fallback;
}

function toText(v) {
  return String(v == null ? '' : v).trim();
}

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function normalizeContextIntent(raw) {
  const input = asObject(raw);
  const entities = asObject(input.entities);
  const nextAction = asObject(input.nextAction);
  const toolDecision = asObject(input.toolDecision);
  return {
    intentVersion: 'v1',
    intent: toText(input.intent || 'unknown') || 'unknown',
    entities: {
      errorCode: entities.errorCode == null ? null : toText(entities.errorCode) || null,
      device: entities.device == null ? null : toText(entities.device) || null,
      phenomenon: entities.phenomenon == null ? null : toText(entities.phenomenon) || null,
      concept: entities.concept == null ? null : toText(entities.concept) || null,
      component: entities.component == null ? null : toText(entities.component) || null,
      fileIds: Array.isArray(entities.fileIds) ? entities.fileIds : []
    },
    toolDecision: {
      shouldCallTool: Boolean(toolDecision.shouldCallTool),
      toolName: toText(toolDecision.toolName) || null,
      reason: toText(toolDecision.reason)
    },
    needClarification: Boolean(input.needClarification),
    clarificationQuestion: input.clarificationQuestion == null ? null : toText(input.clarificationQuestion) || null,
    answerDraft: input.answerDraft == null ? null : toText(input.answerDraft) || null,
    nextAction: {
      type: toText(nextAction.type || ''),
      message: toText(nextAction.message || '')
    },
    confidence: Number.isFinite(Number(input.confidence)) ? Math.max(0, Math.min(1, Number(input.confidence))) : 0.7,
    language: toText(input.language || 'zh-CN') || 'zh-CN'
  };
}

function sanitizeIntentLlmRaw(llm) {
  if (!llm || typeof llm !== 'object') return null;
  const messages = Array.isArray(llm.messages) ? llm.messages : [];
  const raw = llm.raw && typeof llm.raw === 'object' ? llm.raw : {};
  return {
    request: {
      model: String(llm.model || ''),
      messages
    },
    response: {
      model: String(raw.model || llm.model || ''),
      usage: raw.usage || null,
      content: String(raw.content || '')
    }
  };
}

function createPlatformTaskRouter() {
  return {
    async route(request, context = {}) {
      const envelope = context?.contextEnvelope && typeof context.contextEnvelope === 'object'
        ? context.contextEnvelope
        : {};
      const llmEnabled = parseBool(process.env.AGENT_INTENT_LLM_ENABLED, true);
      if (!llmEnabled) {
        const err = new Error('intent extraction is disabled by AGENT_INTENT_LLM_ENABLED');
        err.code = 'INTENT_EXTRACTION_DISABLED';
        throw err;
      }
      const llmProviderId = String(request?.context?.llmProviderId || '').trim() || undefined;
      let llm = null;
      try {
        llm = await qwenService.extractConversationIntentWithProvider({ contextEnvelope: envelope, providerId: llmProviderId });
      } catch (error) {
        const err = new Error(`intent extraction failed: ${String(error?.message || error)}`);
        err.code = String(error?.code || 'INTENT_EXTRACTION_FAILED');
        throw err;
      }
      const intent = normalizeContextIntent(llm);
      return {
        ...intent,
        llmRaw: sanitizeIntentLlmRaw(llm)
      };
    }
  };
}

module.exports = {
  createPlatformTaskRouter
};
