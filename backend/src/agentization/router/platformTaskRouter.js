const qwenService = require('../../services/qwenService');
const { canonicalizeIntentResultForPipeline } = require('../intent/canonicalizeIntentResult');

function parseBool(value, fallback = true) {
  const s = String(value == null ? '' : value).trim().toLowerCase();
  if (!s) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return fallback;
}

function pickIntentCoreFromExtraction(llm) {
  if (!llm || typeof llm !== 'object') return {};
  const {
    raw,
    model,
    messages,
    provider,
    toolCatalog,
    ...intentCore
  } = llm;
  return intentCore;
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
      const intent = pickIntentCoreFromExtraction(llm);
      const normalized = canonicalizeIntentResultForPipeline(intent, {
        fallbackLanguage: envelope?.lang || envelope?.sessionMeta?.lang || 'zh-CN'
      });
      return {
        ...normalized,
        llmRaw: sanitizeIntentLlmRaw(llm)
      };
    }
  };
}

module.exports = {
  createPlatformTaskRouter
};
