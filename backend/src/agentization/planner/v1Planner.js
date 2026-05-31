const { loadToolRegistry, getEnabledTools } = require('../tools/registry/registryLoader');
const { canonicalizeIntentResultForPipeline } = require('../intent/canonicalizeIntentResult');

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

function slotValuePresent(val) {
  if (val == null) return false;
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === 'object') return Object.keys(val).length > 0;
  return toText(val) !== '';
}

function computeMissingSlotsForTool(contextIntent, toolMeta, confirmedSlots = {}) {
  const entities = asObject(contextIntent?.entities);
  const slotVals = asObject(contextIntent?.toolSlots?.values);
  const confirmed = asObject(confirmedSlots);
  const requiredSlots = Array.isArray(toolMeta?.requiredSlots) ? toolMeta.requiredSlots : [];
  const anyOfRequired = Array.isArray(toolMeta?.anyOfRequired) ? toolMeta.anyOfRequired : [];
  const missing = [];

  const hasSlot = (slot) => {
    const k = String(slot);
    if (slotValuePresent(slotVals[k])) return true;
    if (slotValuePresent(confirmed[k])) return true;
    if (slotValuePresent(entities[k])) return true;
    return false;
  };

  for (const slot of requiredSlots) {
    if (!hasSlot(slot)) missing.push(String(slot));
  }

  for (const group of anyOfRequired) {
    if (!Array.isArray(group) || group.length === 0) continue;
    const hasOne = group.some((slot) => hasSlot(slot));
    if (!hasOne) missing.push(String(group[0]));
  }

  return Array.from(new Set(missing));
}

function resolvePlannerFallbackLanguage(planInputContext, intentResult) {
  const m = planInputContext?.latestUserMessage?.language;
  if (m) return String(m);
  const fromIntent = intentResult?.language || planInputContext?.contextIntent?.language;
  if (fromIntent) return String(fromIntent);
  return 'zh-CN';
}

function createV1Planner() {
  return {
    buildPlan(input) {
      const planInputContext = asObject(input?.planInputContext);
      const request = asObject(input?.request);
      const fbLang = resolvePlannerFallbackLanguage(planInputContext, input?.intentResult);
      const fallbackIntent = canonicalizeIntentResultForPipeline(input?.intentResult, { fallbackLanguage: fbLang });
      const rawCtx = asObject(planInputContext.contextIntent);
      const contextIntent = toText(rawCtx.intent || '')
        ? canonicalizeIntentResultForPipeline(rawCtx, { fallbackLanguage: fbLang })
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
        const llmMissing = Array.isArray(contextIntent.toolSlots?.missingSlots)
          ? contextIntent.toolSlots.missingSlots.map((x) => String(x || '').trim()).filter(Boolean)
          : [];
        const missingSlots = llmMissing.length > 0
          ? llmMissing
          : computeMissingSlotsForTool(contextIntent, preferredTool, asObject(planInputContext.confirmedSlots));
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
        const ts = contextIntent.toolSlots && typeof contextIntent.toolSlots === 'object'
          ? contextIntent.toolSlots
          : {};
        const toolSlotsSnapshot = {
          requiredSlots: Array.isArray(ts.requiredSlots) ? [...ts.requiredSlots] : [],
          optionalSlots: Array.isArray(ts.optionalSlots) ? [...ts.optionalSlots] : [],
          anyOfRequired: Array.isArray(ts.anyOfRequired)
            ? ts.anyOfRequired.map((g) => (Array.isArray(g) ? [...g] : []))
            : [],
          missingSlots: Array.isArray(ts.missingSlots) ? [...ts.missingSlots] : [],
          values: ts.values && typeof ts.values === 'object' && !Array.isArray(ts.values) ? { ...ts.values } : {}
        };
        const ent = contextIntent.entities;
        const entitiesSnapshot = {
          errorCode: ent.errorCode,
          subsystem: ent.subsystem,
          device: ent.device,
          phenomenon: ent.phenomenon,
          concept: ent.concept,
          component: ent.component,
          fileIds: Array.isArray(ent.fileIds) ? [...ent.fileIds] : []
        };
        return {
          plannerOutputVersion: 'v1',
          decision: 'call_tool',
          reason: contextIntent.toolDecision.reason || 'tool_required',
          toolCall: {
            toolName: preferredToolName,
            toolSlots: toolSlotsSnapshot,
            entities: entitiesSnapshot,
            confirmedSlots: asObject(planInputContext.confirmedSlots),
            userMessageText: toText(request?.message?.text),
            language: contextIntent.language || 'zh-CN'
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
