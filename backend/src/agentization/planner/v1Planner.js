const { loadToolRegistry, getEnabledTools, resolveToolName } = require('../tools/registry/registryLoader');
const { resolveAgentFaultCodeToken } = require('../../services/faultCodeExtractionService');

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function toText(v) {
  return String(v == null ? '' : v).trim();
}

function firstNonEmpty(values) {
  for (const v of values) {
    const t = toText(v);
    if (t) return t;
  }
  return '';
}

function toPositiveInt(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return i >= 0 ? i : fallback;
}

function buildAvailableTools(userPermissions = []) {
  const registry = loadToolRegistry();
  const enabled = getEnabledTools(registry);
  const permissions = new Set((Array.isArray(userPermissions) ? userPermissions : []).map((x) => String(x || '').trim()));
  return enabled.map((tool) => {
    const requiredPermission = String(tool?.security?.requiredPermissions?.[0] || '').trim();
    const allowed = !requiredPermission || permissions.has(requiredPermission);
    return {
      name: tool.toolName,
      enabled: tool.enabled !== false,
      requiredPermission,
      allowed,
      requiredSlots: Array.isArray(tool?.inputContract?.requiredSlots) ? tool.inputContract.requiredSlots : [],
      anyOfRequired: Array.isArray(tool?.inputContract?.anyOfRequired) ? tool.inputContract.anyOfRequired : []
    };
  });
}

function computeMissingSlotsForTool(contextIntent, toolMeta) {
  const entities = asObject(contextIntent?.entities);
  const requiredSlots = Array.isArray(toolMeta?.requiredSlots) ? toolMeta.requiredSlots : [];
  const anyOfRequired = Array.isArray(toolMeta?.anyOfRequired) ? toolMeta.anyOfRequired : [];
  const missing = [];

  for (const slot of requiredSlots) {
    const val = entities[slot];
    if (val == null || toText(val) === '') missing.push(String(slot));
  }

  for (const group of anyOfRequired) {
    if (!Array.isArray(group) || group.length === 0) continue;
    const hasOne = group.some((slot) => {
      const val = entities[slot];
      return !(val == null || toText(val) === '');
    });
    if (!hasOne) missing.push(String(group[0]));
  }

  return Array.from(new Set(missing));
}

function normalizeContextIntent(intentResult) {
  let registry = null;
  try {
    registry = loadToolRegistry();
  } catch (_) {
    registry = null;
  }
  const structured = asObject(intentResult);
  const entities = asObject(structured.entities);
  const nextAction = asObject(structured.nextAction);
  const toolDecision = asObject(structured.toolDecision);
  return {
    intent: toText(structured.intent || 'unknown') || 'unknown',
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
      toolName: resolveToolName(toolDecision.toolName, registry || undefined)
        || (toolDecision.shouldCallTool ? resolveToolName(structured.intent, registry || undefined) : null),
      reason: toText(toolDecision.reason)
    },
    needClarification: Boolean(structured.needClarification),
    clarificationQuestion: structured.clarificationQuestion == null ? null : toText(structured.clarificationQuestion) || null,
    answerDraft: structured.answerDraft == null ? null : toText(structured.answerDraft) || null,
    nextAction: {
      type: toText(nextAction.type || ''),
      message: toText(nextAction.message || '')
    },
    confidence: Number.isFinite(Number(structured.confidence)) ? Number(structured.confidence) : 0.7,
    language: firstNonEmpty([structured.language, 'zh-CN'])
  };
}

function createV1Planner() {
  return {
    buildPlan(input) {
      const planInputContext = asObject(input?.planInputContext);
      const request = asObject(input?.request);
      const fallbackIntent = normalizeContextIntent(input?.intentResult);
      const contextIntent = asObject(planInputContext.contextIntent).intent
        ? planInputContext.contextIntent
        : fallbackIntent;
      const userPermissions = Array.isArray(planInputContext?.runtimeState?.userPermissions)
        ? planInputContext.runtimeState.userPermissions
        : (Array.isArray(request?.context?.userPermissions) ? request.context.userPermissions : []);
      const availableTools = Array.isArray(planInputContext?.availableTools)
        ? planInputContext.availableTools
        : buildAvailableTools(userPermissions);
      const findTool = (name) => availableTools.find((t) => t.name === name);

      const preferredToolName = contextIntent.toolDecision.toolName || 'error_code_lookup';
      const preferredTool = findTool(preferredToolName);
      const canCallTool = Boolean(preferredTool && preferredTool.allowed);
      const decisionType = String(contextIntent.nextAction.type || '').trim();

      if (contextIntent.needClarification || decisionType === 'ask_user') {
        const missingSlots = computeMissingSlotsForTool(contextIntent, preferredTool);
        const questionText = firstNonEmpty([
          contextIntent.answerDraft,
          contextIntent.clarificationQuestion,
          contextIntent.nextAction.message,
          '请补充必要信息后我再继续。'
        ]);
        return {
          plannerOutputVersion: 'v1',
          decision: 'ask_user',
          reason: contextIntent.clarificationQuestion ? 'missing_slots' : 'clarification_required',
          clarification: {
            question: questionText,
            missingSlots: missingSlots.length > 0 ? missingSlots : ['errorCode']
          },
          policySnapshot: asObject(planInputContext.policy).maxSteps ? planInputContext.policy : { maxSteps: 4, maxToolCalls: 2, clarifyRoundLimit: 2, timeoutBudgetMs: 12000 }
        };
      }

      if (decisionType === 'reject') {
        return {
          plannerOutputVersion: 'v1',
          decision: 'reject',
          reason: contextIntent.answerDraft || contextIntent.nextAction.message || 'request_rejected',
          policySnapshot: asObject(planInputContext.policy).maxSteps ? planInputContext.policy : { maxSteps: 4, maxToolCalls: 2, clarifyRoundLimit: 2, timeoutBudgetMs: 12000 }
        };
      }

      const policy = asObject(planInputContext.policy);
      const rt = asObject(planInputContext.runtimeState);
      const wantsCallTool = (decisionType === 'call_tool' || contextIntent.toolDecision.shouldCallTool);
      const policyMaxCalls = toPositiveInt(policy.maxToolCalls, 2);
      const remainingCalls = toPositiveInt(rt.remainingCalls, policyMaxCalls);

      if (wantsCallTool && remainingCalls <= 0) {
        const draft = firstNonEmpty([
          contextIntent.answerDraft,
          toText(rt.toolFallbackText),
          contextIntent.nextAction.message
        ]);
        return {
          plannerOutputVersion: 'v1',
          decision: 'reply_direct',
          reason: draft || '已达到工具调用上限，基于现有信息给出结果。',
          policySnapshot: asObject(planInputContext.policy).maxSteps ? planInputContext.policy : { maxSteps: 4, maxToolCalls: 2, clarifyRoundLimit: 2, timeoutBudgetMs: 12000 }
        };
      }

      if (wantsCallTool && canCallTool) {
        const query = toText(request?.message?.text);
        const slotCode = toText(planInputContext?.confirmedSlots?.errorCode);
        const entityCode = resolveAgentFaultCodeToken(contextIntent.entities.errorCode || '');
        const extractedFromQuery = resolveAgentFaultCodeToken(query);
        const errorCode = firstNonEmpty([slotCode, entityCode, extractedFromQuery]) || null;
        const argumentsPayload = {
          errorCode,
          keywords: errorCode ? null : (query || null),
          language: contextIntent.language || 'zh-CN'
        };
        return {
          plannerOutputVersion: 'v1',
          decision: 'call_tool',
          reason: contextIntent.toolDecision.reason || 'tool_required',
          toolCall: {
            toolName: preferredToolName,
            arguments: argumentsPayload
          },
          policySnapshot: asObject(planInputContext.policy).maxSteps ? planInputContext.policy : { maxSteps: 4, maxToolCalls: 2, clarifyRoundLimit: 2, timeoutBudgetMs: 12000 }
        };
      }

      return {
        plannerOutputVersion: 'v1',
        decision: 'reply_direct',
        reason: contextIntent.answerDraft || 'sufficient_information',
        policySnapshot: asObject(planInputContext.policy).maxSteps ? planInputContext.policy : { maxSteps: 4, maxToolCalls: 2, clarifyRoundLimit: 2, timeoutBudgetMs: 12000 }
      };
    }
  };
}

module.exports = {
  createV1Planner,
  buildAvailableTools
};
