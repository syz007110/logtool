const {
  buildOrchestratorSuffix,
  buildToolResultSuffix
} = require('../session/conversationTurnKeys');
const { withTimeout } = require('./runtimeStepUtils');
const { projectToolTracesFromLoopTrace } = require('../types/toolTracesProjection');

const DEGRADED_FINISH_REASONS = new Set([
  'length',
  'content_filter',
  'insufficient_system_resource'
]);

const DEGRADED_PREFIX = Object.freeze({
  length: '[上下文长度限制] 回复因长度限制被截断，以下为已生成内容：',
  content_filter: '[内容过滤] 部分内容未通过安全策略，以下为可用内容：',
  insufficient_system_resource: '[推理资源不足] 系统推理资源不足，生成为部分内容：'
});

function mergeDeliveryText(prefix, content) {
  const body = String(content || '').trim();
  if (!body) return prefix;
  return `${prefix}\n\n${body}`;
}

function appendOptionalContent(prefix, content) {
  const body = String(content || '').trim();
  if (!body) return prefix;
  return `${prefix}\n\n${body}`;
}

function buildAssistantMessageFromTurnResult(turnResult) {
  const raw = turnResult?.rawMessage;
  if (raw && typeof raw === 'object' && raw.role === 'assistant') {
    const msg = {
      role: 'assistant',
      content: raw.content == null ? null : raw.content
    };
    if (Array.isArray(raw.tool_calls) && raw.tool_calls.length > 0) {
      msg.tool_calls = raw.tool_calls;
    }
    return msg;
  }

  const toolCalls = Array.isArray(turnResult?.toolCalls) ? turnResult.toolCalls : [];
  if (toolCalls.length > 0) {
    return {
      role: 'assistant',
      content: turnResult.content == null ? null : turnResult.content,
      tool_calls: toolCalls.map((tc) => ({
        id: String(tc.id || ''),
        type: 'function',
        function: {
          name: String(tc.toolName || ''),
          arguments: String(tc.rawArguments ?? JSON.stringify(tc.arguments || {}))
        }
      }))
    };
  }

  return {
    role: 'assistant',
    content: turnResult?.content == null ? null : String(turnResult.content)
  };
}

function serializeToolResultContent(toolResult) {
  if (!toolResult || typeof toolResult !== 'object') {
    return JSON.stringify({ status: 'failed', error: { code: 'INVALID_TOOL_RESULT', message: 'empty tool result' } });
  }
  return JSON.stringify(toolResult);
}

function hasToolCalls(turnResult) {
  return Array.isArray(turnResult?.toolCalls) && turnResult.toolCalls.length > 0;
}

async function runTurnLoop({
  request,
  prepared,
  conversationOrchestrator,
  toolGateway,
  policy,
  timeouts,
  stepLogger,
  onLastStep
}) {
  const { log } = stepLogger;
  const stepTimeoutMs = Number(timeouts?.stepMs) || 12000;
  const maxSteps = Number(policy?.maxSteps) || 4;
  const maxToolCalls = Number(policy?.maxToolCalls) || 3;
  const contextEnvelope = prepared?.contextEnvelope || {};

  const loopMessages = conversationOrchestrator.buildInitialLoopMessages(request, {
    contextEnvelope
  });
  const loopTrace = [];
  let toolCallsUsed = 0;
  let finalText = null;
  let lastTurnResult = null;
  let errorRuntime = null;

  for (let step = 1; step <= maxSteps; step += 1) {
    onLastStep('orchestrator');
    log('orchestrator:step:start', { step, maxSteps });

    const turnResult = await withTimeout(
      conversationOrchestrator.runWithMessages(request, {
        messages: loopMessages,
        contextEnvelope,
        allowEmptyResponse: true,
        step,
        jobId: request?.context?.agentDebug?.jobId || '',
        debugStage: 'turn_loop',
        callType: 'orchestrator'
      }),
      stepTimeoutMs,
      'conversationOrchestrator.runWithMessages'
    );

    lastTurnResult = turnResult;
    const assistantMessage = buildAssistantMessageFromTurnResult(turnResult);
    loopMessages.push(assistantMessage);

    const orchestratorSuffix = buildOrchestratorSuffix(step);
    loopTrace.push({
      kind: 'orchestrator',
      step,
      suffix: orchestratorSuffix,
      turnResult,
      rawMessage: assistantMessage
    });

    log('orchestrator:step:done', {
      step,
      kind: turnResult?.kind,
      finishReason: turnResult?.finishReason,
      toolCallCount: Array.isArray(turnResult?.toolCalls) ? turnResult.toolCalls.length : 0
    });

    if (turnResult?.kind === 'empty') {
      finalText = 'Agent 内部异常：模型未返回可用内容。';
      errorRuntime = {
        code: 'ORCHESTRATOR_LLM_EMPTY_CONTENT',
        message: finalText,
        finishReason: turnResult.finishReason || null
      };
      break;
    }

    const finishReason = String(turnResult.finishReason || '').trim();
    if (DEGRADED_FINISH_REASONS.has(finishReason)) {
      finalText = mergeDeliveryText(
        DEGRADED_PREFIX[finishReason] || '[降级回复]',
        turnResult.content
      );
      break;
    }

    if (finishReason === 'tool_calls' && !hasToolCalls(turnResult)) {
      finalText = appendOptionalContent('无法调用工具：模型未返回有效的 tool_calls。', turnResult.content);
      break;
    }

    if (hasToolCalls(turnResult)) {
      const pendingToolCalls = turnResult.toolCalls;

      if (toolCallsUsed >= maxToolCalls) {
        finalText = appendOptionalContent('调用工具次数已达上限。', turnResult.content);
        break;
      }

      if (step >= maxSteps) {
        finalText = appendOptionalContent('已达最大推理步数。', turnResult.content);
        break;
      }

      if (toolCallsUsed + pendingToolCalls.length > maxToolCalls) {
        finalText = appendOptionalContent('调用工具次数已达上限。', turnResult.content);
        break;
      }

      for (let k = 0; k < pendingToolCalls.length; k += 1) {
        const toolCall = pendingToolCalls[k];
        const subStep = k + 1;
        onLastStep('invoke_tool');
        log('invoke:tool:start', { step, subStep, toolName: toolCall.toolName });

        const invokeStartedAt = Date.now();
        const invokeResult = await withTimeout(
          toolGateway.invokeFromToolCall({ toolCall, request, turnResult }),
          stepTimeoutMs,
          'toolGateway.invokeFromToolCall'
        );
        toolCallsUsed += 1;

        const toolResult = invokeResult?.debugMeta?.toolResult || {
          status: 'failed',
          error: { code: 'TOOL_RESULT_MISSING', message: 'tool gateway returned no result matrix' }
        };
        const toolContent = serializeToolResultContent(toolResult);
        const toolMessage = {
          role: 'tool',
          tool_call_id: String(toolCall.id || ''),
          content: toolContent
        };
        loopMessages.push(toolMessage);

        loopTrace.push({
          kind: 'tool',
          step,
          subStep,
          suffix: buildToolResultSuffix(step, subStep),
          toolCallId: toolCall.id || null,
          toolName: toolCall.toolName || null,
          toolResult,
          content: toolContent,
          invokeResult
        });

        log('invoke:tool:done', {
          step,
          subStep,
          toolName: toolCall.toolName,
          status: toolResult.status,
          costMs: Date.now() - invokeStartedAt
        });
      }

      continue;
    }

    finalText = String(turnResult.content || '').trim() || '当前请求未产生可用回复。';
    break;
  }

  if (!finalText) {
    finalText = '已达最大推理步数。';
  }

  const assistantResponse = {
    text: finalText,
    attachments: [],
    toolTraces: projectToolTracesFromLoopTrace(loopTrace),
    debugMeta: {
      loopTrace,
      turnResult: lastTurnResult,
      toolCallsUsed,
      source: 'turn_loop',
      errorRuntime
    }
  };

  return {
    assistantResponse,
    loopTrace,
    loopMessages,
    errorRuntime,
    debugOrchestratorResult: lastTurnResult,
    debugContextEnvelope: contextEnvelope,
    toolCallsUsed
  };
}

module.exports = {
  runTurnLoop,
  buildAssistantMessageFromTurnResult,
  serializeToolResultContent,
  DEGRADED_PREFIX,
  mergeDeliveryText
};
