const { createConversationOrchestrator } = require('../orchestrator/conversationOrchestrator');
const { createLogtoolToolGateway } = require('../tools/logtoolToolGateway');
const {
  prepareConversationContext,
  processConversationRequest,
  persistSystemMessage
} = require('../session/conversationSessionService');
const { persistPreOrchestratorToolEvent } = require('../session/preOrchestratorToolEventService');
const { resolveUserPermissions } = require('../security/userPermissionResolver');
const { runAttachmentScan } = require('../../services/attachmentScanQueueService');
const { appendAgentDebugMarkdown } = require('../utils/agentDebugMarkdownLogger');
const { getRuntimeTimeouts } = require('./turnPolicy');
const { withTimeout, createRuntimeStepLogger } = require('./runtimeStepUtils');
const { runTurnLoop } = require('./turnLoop');
const { fireAndForgetAgentAuditLog } = require('../audit/agentAuditLogger');
const { mergeAttachmentStatus } = require('../../services/attachmentStatusStateService');

function createDefaultRuntimeDeps() {
  return {
    conversationOrchestrator: createConversationOrchestrator(),
    toolGateway: createLogtoolToolGateway(),
    prepareConversationContext,
    processConversationRequest,
    persistSystemMessage,
    resolveUserPermissions,
    appendAgentDebugMarkdown
  };
}

function buildAttachmentScanToolResult(attachmentStatus) {
  const summary = String(attachmentStatus?.summary || '').trim();
  const nextAction = String(attachmentStatus?.nextAction || '').trim();
  const uploadPreparation = attachmentStatus?.uploadPreparation
    && typeof attachmentStatus.uploadPreparation === 'object'
    ? attachmentStatus.uploadPreparation
    : null;
  if (!summary || !nextAction || !uploadPreparation) {
    throw new Error('attachment scan result is incomplete');
  }
  return {
    status: 'success',
    text: summary,
    data: {
      nextAction,
      uploadPreparation
    },
    error: null
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
      request.context.agentDebug = request.context.agentDebug && typeof request.context.agentDebug === 'object'
        ? request.context.agentDebug
        : {};
      request.context.agentDebug.jobId = String(jobId || '');
      request.context.instanceId = instanceId;
      request.context.agentTaskId = routedTaskId || null;
      request.context.attachmentStatus = prepared?.activeAttachmentStatus || null;
      request.session = request.session && typeof request.session === 'object' ? request.session : {};
      request.session.instanceId = instanceId;
      prepared.contextEnvelope = prepared.contextEnvelope && typeof prepared.contextEnvelope === 'object'
        ? prepared.contextEnvelope
        : {};
      prepared.contextEnvelope.lang = prepared.contextEnvelope.lang
        || request.context.lang
        || 'zh-CN';

      const hasAttachments = Array.isArray(request?.message?.attachments) && request.message.attachments.length > 0;
      if (hasAttachments) {
        lastStep = 'attachment_scan';
        log('attachment_scan:start', { attachmentCount: request.message.attachments.length });
        const scanStartedAt = Date.now();
        const attachmentStatus = await withTimeout(
          runAttachmentScan({
            request,
            instanceId: instanceId,
            timeoutMs: parseInt(process.env.ATTACHMENT_SCAN_TIMEOUT_MS, 10) || 30000
          }),
          (parseInt(process.env.ATTACHMENT_SCAN_TIMEOUT_MS, 10) || 30000) + 1000,
          'runAttachmentScan'
        );
        const mergedAttachmentStatus = await mergeAttachmentStatus(
          request.context.attachmentStatus,
          attachmentStatus
        );
        log('attachment_scan:done', {
          costMs: Date.now() - scanStartedAt,
          logsFound: mergedAttachmentStatus?.scanSummary?.logsFound || attachmentStatus?.scanSummary?.logsFound || 0
        });

        if (mergedAttachmentStatus) {
          const persistedScanMessage = await persistPreOrchestratorToolEvent({
            instanceId,
            request,
            taskId: routedTaskId,
            toolName: 'attachment_scan',
            argumentsPayload: {
              attachmentCount: request.message.attachments.length
            },
            toolResult: buildAttachmentScanToolResult(mergedAttachmentStatus),
            assistantContent: mergedAttachmentStatus?.summary || null
          });

          request.context.attachmentStatus = mergedAttachmentStatus;
          prepared.contextEnvelope.historyContext = prepared.contextEnvelope.historyContext
            && typeof prepared.contextEnvelope.historyContext === 'object'
            ? prepared.contextEnvelope.historyContext
            : {};
          prepared.contextEnvelope.activeAttachmentStatus = mergedAttachmentStatus;
          const historyMessages = Array.isArray(prepared.contextEnvelope.historyContext.messages)
            ? prepared.contextEnvelope.historyContext.messages
            : [];
          prepared.contextEnvelope.historyContext.messages = [
            ...historyMessages,
            persistedScanMessage.assistantMessage,
            persistedScanMessage.toolMessage
          ];
        }
      }

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
      fireAndForgetAgentAuditLog({
        request,
        loopTrace: loopResult.loopTrace,
        result,
        status: 'success'
      });

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
      try {
        await deps.persistSystemMessage({
          instanceId: routedInstanceId,
          request,
          taskId: routedTaskId,
          systemMessage: {
            kind: 'runtime_error',
            title: '处理失败',
            text: String(err?.message || err || 'Agent 内部异常').trim(),
            presentation: 'action_card'
          },
          assistantResponse: {
            mode: 'direct_response',
            debugMeta: {
              deterministicRule: String(err?.code || lastStep || 'runtime_error').trim().toLowerCase(),
              deliveryHint: 'system_action_card',
              details: {
                stage: lastStep
              }
            }
          }
        });
      } catch (persistError) {
        console.warn('[runtime] persist system message failed:', persistError?.message || persistError);
      }
      fireAndForgetAgentAuditLog({
        request,
        loopTrace: debugAssistantResponse?.debugMeta?.loopTrace || [],
        result: null,
        status: 'failed',
        error: err
      });
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
