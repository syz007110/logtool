const { createConversationOrchestrator } = require('../orchestrator/conversationOrchestrator');
const { createLogtoolToolGateway } = require('../tools/logtoolToolGateway');
const {
  prepareConversationContext,
  processConversationRequest
} = require('../session/conversationSessionService');
const { resolveUserPermissions } = require('../security/userPermissionResolver');
const { appendAgentDebugMarkdown } = require('../utils/agentDebugMarkdownLogger');
const { getRuntimeTimeouts } = require('./turnPolicy');
const { withTimeout, createRuntimeStepLogger } = require('./runtimeStepUtils');
const { runTurnLoop } = require('./turnLoop');

function createDefaultRuntimeDeps() {
  return {
    conversationOrchestrator: createConversationOrchestrator(),
    toolGateway: createLogtoolToolGateway(),
    prepareConversationContext,
    processConversationRequest,
    resolveUserPermissions,
    appendAgentDebugMarkdown
  };
}

function createConversationRuntime(options = {}) {
  const deps = {
    ...createDefaultRuntimeDeps(),
    ...options
  };

  async function executeConversationTurn({
    request,
    routing = {},
    taskId = '',
    jobId = ''
  }) {
    if (!request || typeof request !== 'object') {
      throw new Error('conversation job request is required');
    }

    const routedInstanceId = Number(routing?.instance?.id || 0);
    const routedTaskId = String(taskId || routing?.task?.id || '').trim();
    if (!Number.isFinite(routedInstanceId) || routedInstanceId <= 0) {
      throw new Error('routed instance id is required for conversation processing');
    }

    const traceId = String(request?.traceId || '');
    const requestId = String(request?.requestId || '');
    const stepLogger = createRuntimeStepLogger(jobId);
    const { log, error: logError } = stepLogger;
    const timeouts = getRuntimeTimeouts();

    let lastStep = 'init';
    let prepareStartedAt = 0;
    let debugContextEnvelope = null;
    let debugTurnResult = null;
    let debugAssistantResponse = null;
    let debugIncludePromptInjection = false;
    let prepared = null;

    try {
      lastStep = 'prepare_context';
      log('prepare:start', { routedInstanceId, traceId, requestId });
      prepareStartedAt = Date.now();
      prepared = await withTimeout(
        deps.prepareConversationContext(request, {
          instanceId: routedInstanceId,
          activeResolutionHint: routing?.activeResolution || {}
        }),
        timeouts.prepareMs,
        'prepareConversationContext'
      );
      debugContextEnvelope = prepared?.contextEnvelope || null;
      debugIncludePromptInjection = Boolean(prepared?.activeResolution?.createdNewInstance);
      log('prepare:done', { costMs: Date.now() - prepareStartedAt });

      const instanceId = Number(prepared?.instance?.id || 0);
      if (!Number.isFinite(instanceId) || instanceId <= 0) {
        throw new Error('instance id is required for conversation processing');
      }
      if (routedInstanceId !== instanceId) {
        throw new Error(`conversation instance drift detected: routed=${routedInstanceId}, actual=${instanceId}`);
      }

      lastStep = 'resolve_permissions';
      log('permissions:start');
      const permStartedAt = Date.now();
      const userPermissions = await deps.resolveUserPermissions(request?.user || {});
      log('permissions:done', { costMs: Date.now() - permStartedAt, permissionCount: userPermissions.length });

      request.context = request.context && typeof request.context === 'object' ? request.context : {};
      request.context.userPermissions = userPermissions;
      prepared.contextEnvelope = prepared.contextEnvelope && typeof prepared.contextEnvelope === 'object'
        ? prepared.contextEnvelope
        : {};
      prepared.contextEnvelope.lang = prepared.contextEnvelope.lang
        || request.context.lang
        || 'zh-CN';

      lastStep = 'turn_loop';
      log('turn_loop:start', {
        maxSteps: prepared.policy?.maxSteps,
        maxToolCalls: prepared.policy?.maxToolCalls
      });
      const loopStartedAt = Date.now();
      const loopResult = await runTurnLoop({
        request,
        prepared,
        conversationOrchestrator: deps.conversationOrchestrator,
        toolGateway: deps.toolGateway,
        policy: prepared.policy,
        timeouts: {
          stepMs: timeouts.stepMs
        },
        stepLogger,
        onLastStep: (step) => { lastStep = step; }
      });
      log('turn_loop:done', {
        costMs: Date.now() - loopStartedAt,
        toolCallsUsed: loopResult.toolCallsUsed,
        loopTraceCount: Array.isArray(loopResult.loopTrace) ? loopResult.loopTrace.length : 0
      });

      debugTurnResult = loopResult.debugOrchestratorResult;
      debugContextEnvelope = loopResult.debugContextEnvelope;
      debugAssistantResponse = loopResult.assistantResponse;

      lastStep = 'persist';
      log('persist:start');
      const persistStartedAt = Date.now();
      const result = await withTimeout(
        deps.processConversationRequest({
          request,
          loopTrace: loopResult.loopTrace,
          contextEnvelope: prepared.contextEnvelope,
          activeResolutionHint: prepared.activeResolution,
          assistantResponse: loopResult.assistantResponse,
          errorRuntime: loopResult.errorRuntime,
          taskId: routedTaskId
        }),
        timeouts.stepMs,
        'processConversationRequest'
      );
      log('persist:done', { costMs: Date.now() - persistStartedAt });

      try {
        await deps.appendAgentDebugMarkdown({
          jobId,
          request,
          contextEnvelope: prepared.contextEnvelope,
          orchestratorResult: loopResult.debugOrchestratorResult,
          assistantResponse: loopResult.assistantResponse,
          includePromptInjection: Boolean(result?.instance?.created_new),
          stage: 'persist_done'
        });
        log('agent-debug-md:done', { path: process.env.AGENT_DEBUG_MD_PATH || 'docs/agent-debug-log.md' });
      } catch (appendError) {
        console.warn('[agent-debug-md] append failed:', appendError?.message || appendError);
      }

      return result;
    } catch (err) {
      try {
        await deps.appendAgentDebugMarkdown({
          jobId,
          request,
          contextEnvelope: debugContextEnvelope,
          orchestratorResult: debugTurnResult || {},
          assistantResponse: debugAssistantResponse || { debugMeta: {} },
          includePromptInjection: debugIncludePromptInjection,
          error: err,
          stage: lastStep
        });
        log('agent-debug-md:done', {
          path: process.env.AGENT_DEBUG_MD_PATH || 'docs/agent-debug-log.md',
          failedRound: true
        });
      } catch (appendError) {
        console.warn('[agent-debug-md] append failed(on-error):', appendError?.message || appendError);
      }
      if (lastStep === 'prepare_context') {
        logError('prepare:failed', err, { costMs: Date.now() - prepareStartedAt, traceId, requestId });
      }
      logError('runtime:failed', err, { traceId, requestId, lastStep });
      throw err;
    }
  }

  return {
    executeConversationTurn
  };
}

const defaultRuntime = createConversationRuntime();

module.exports = {
  createConversationRuntime,
  executeConversationTurn: defaultRuntime.executeConversationTurn
};
