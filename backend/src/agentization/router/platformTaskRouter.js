const { buildIntentResult } = require('../types/contracts');
const { extractConversationIntentWithProvider } = require('../../services/qwenService');

function parseBool(value, fallback = true) {
  const s = String(value == null ? '' : value).trim().toLowerCase();
  if (!s) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return fallback;
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
  const intentMap = new Map([
    ['fault_diagnosis', 'troubleshoot'],
    ['log_analysis', 'log_query'],
    ['error_code_lookup', 'lookup_fault_code'],
    ['knowledge_qa', 'definition'],
    ['provide_missing_info', 'other'],
    ['fault_collection', 'case_record'],
    ['continue_previous_task', 'other'],
    ['general_chat', 'other'],
    ['unknown', 'other']
  ]);

  const toolNameToIntent = new Map([
    ['errorCodeSearch', 'lookup_fault_code'],
    ['logAnalyzer', 'log_query'],
    ['knowledgeBaseSearch', 'definition'],
    ['faultCaseSearch', 'find_case'],
    ['faultCollect', 'case_record']
  ]);

  return {
    async route(request, context = {}) {
      const text = String(request?.message?.text || '').trim();
      const envelope = context?.contextEnvelope && typeof context.contextEnvelope === 'object'
        ? context.contextEnvelope
        : {};
      const resolvedQuery = String(envelope?.resolvedQuery || text).trim();
      const queryForIntent = resolvedQuery || text;
      const defaultFilters = {
        errorCode: '',
        device: '',
        Phenomenon: '',
        Concept: ''
      };

      const llmEnabled = parseBool(process.env.AGENT_INTENT_LLM_ENABLED, true);
      if (!llmEnabled) {
        const err = new Error('intent extraction is disabled by AGENT_INTENT_LLM_ENABLED');
        err.code = 'INTENT_EXTRACTION_DISABLED';
        throw err;
      }

      let llm = null;
      try {
        const llmProviderId = String(request?.context?.llmProviderId || '').trim() || undefined;
        llm = await extractConversationIntentWithProvider({ contextEnvelope: envelope, providerId: llmProviderId });
      } catch (error) {
        const err = new Error(`intent extraction failed: ${String(error?.message || error)}`);
        err.code = String(error?.code || 'INTENT_EXTRACTION_FAILED');
        throw err;
      }

      const intentV2 = String(llm?.intent || '').trim();
      if (!intentV2) {
        const err = new Error('intent extraction returned empty intent');
        err.code = 'INTENT_EXTRACTION_EMPTY_INTENT';
        throw err;
      }
      const fallbackIntent = intentMap.get(intentV2) || 'other';
      const toolDrivenIntent = llm?.toolDecision?.shouldCallTool
        ? (toolNameToIntent.get(String(llm?.toolDecision?.toolName || '').trim()) || null)
        : null;
      const intent = toolDrivenIntent || fallbackIntent;
      const llmKeywords = Array.isArray(llm?.keywords) ? llm.keywords : [];
      const llmConfidence = Number.isFinite(Number(llm?.confidence)) ? Number(llm.confidence) : 0.7;
      const llmFilters = llm?.filters && typeof llm.filters === 'object' ? llm.filters : defaultFilters;
      const llmRaw = sanitizeIntentLlmRaw(llm);
      const llmStructured = llm && typeof llm === 'object'
        ? {
            intent: llm.intent || 'unknown',
            entities: llm.entities || {},
            toolDecision: llm.toolDecision || {},
            needClarification: Boolean(llm.needClarification),
            clarificationQuestion: llm.clarificationQuestion == null ? null : String(llm.clarificationQuestion),
            nextAction: llm.nextAction || {}
          }
        : {};

      return buildIntentResult({
        intent,
        confidence: llmConfidence,
        slots: {
          query: queryForIntent,
          originalQuery: text,
          keywords: llmKeywords,
          filters: llmFilters,
          structuredIntent: llmStructured,
          llmRaw,
          pendingSlot: null
        },
        fallback: false
      });
    }
  };
}

module.exports = {
  createPlatformTaskRouter
};
