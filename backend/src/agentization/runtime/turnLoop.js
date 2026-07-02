const { withTimeout } = require('./runtimeStepUtils');

async function runTurnLoop({
  request,
  prepared,
  turnResult,
  toolGateway,
  timeouts,
  stepLogger,
  onLastStep
}) {
  const { log } = stepLogger;
  const stepTimeoutMs = Number(timeouts?.stepMs) || 12000;

  onLastStep('orchestrator_result');
  let assistantResponse = null;
  let toolCallsUsed = 0;

  if (turnResult?.kind === 'message') {
    assistantResponse = {
      text: String(turnResult.content || '').trim() || '当前请求未产生可用回复。',
      debugMeta: { turnResult, source: 'orchestrator_llm' }
    };
  } else if (turnResult?.kind === 'tool_call') {
    const toolCall = turnResult.toolCalls?.[0];
    if (!toolCall) {
      assistantResponse = {
        text: '模型发起了工具调用，但未返回有效的 tool_calls。',
        debugMeta: { turnResult, source: 'orchestrator_llm' }
      };
    } else {
      onLastStep('invoke_tool');
      log('invoke:tool:start', { toolName: toolCall.toolName });
      const invokeStartedAt = Date.now();
      assistantResponse = await withTimeout(
        toolGateway.invokeFromToolCall({ toolCall, request, turnResult }),
        stepTimeoutMs,
        'toolGateway.invokeFromToolCall'
      );
      toolCallsUsed = 1;
      log('invoke:tool:done', { toolName: toolCall.toolName, costMs: Date.now() - invokeStartedAt });
    }
  } else {
    assistantResponse = {
      text: '当前请求未产生可用回复。',
      debugMeta: { turnResult, source: 'orchestrator_llm' }
    };
  }

  return {
    assistantResponse,
    conversationPersistOrchestrator: turnResult,
    conversationPersistEnvelope: prepared.contextEnvelope,
    conversationPersistPhase: 'full',
    conversationPersistTag: 'primary',
    debugOrchestratorResult: turnResult,
    debugContextEnvelope: prepared.contextEnvelope,
    toolCallsUsed
  };
}

module.exports = {
  runTurnLoop
};
