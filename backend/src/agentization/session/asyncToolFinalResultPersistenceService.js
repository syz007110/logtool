const { createMessageService } = require('./messageService');
const { buildConversationMessageInput, MESSAGE_TYPES } = require('./conversationMessageMapper');
const { buildMessageId, buildEventIdempotencyKey } = require('./conversationTurnKeys');
const { buildSyntheticToolCall, createToolResult } = require('./syntheticToolEventPersistence');

const messageService = createMessageService();

async function persistAsyncToolFinalResult({
  instanceId,
  request,
  taskId,
  toolName,
  argumentsPayload = {},
  toolResult
}) {
  const syntheticToolCall = buildSyntheticToolCall(toolName, argumentsPayload, 'async_final');
  const normalizedToolResult = createToolResult(toolResult);

  const assistantPayload = {
    source: 'system_async_tool_final',
    toolCalls: [{
      id: syntheticToolCall.id,
      toolName: String(toolName || '').trim(),
      arguments: argumentsPayload,
      rawArguments: JSON.stringify(argumentsPayload || {})
    }],
    rawMessage: {
      role: 'assistant',
      content: null,
      tool_calls: [syntheticToolCall]
    }
  };

  const assistantInput = buildConversationMessageInput({
    instanceId,
    messageId: buildMessageId(request, `async_final_${toolName}_assistant`),
    requestId: String(request?.requestId || '').trim() || undefined,
    traceId: String(request?.traceId || '').trim() || undefined,
    taskId: String(taskId || '').trim() || undefined,
    role: 'assistant',
    explicitMessageType: MESSAGE_TYPES.ORCHESTRATOR,
    content: null,
    payload: assistantPayload,
    attachments: [],
    idempotencyKey: buildEventIdempotencyKey(request, `async_final_${toolName}_assistant`)
  });
  await messageService.saveRaw({ conversationMessageInput: assistantInput });

  const toolContent = JSON.stringify(normalizedToolResult);
  const toolInput = buildConversationMessageInput({
    instanceId,
    messageId: buildMessageId(request, `async_final_${toolName}_tool`),
    requestId: String(request?.requestId || '').trim() || undefined,
    traceId: String(request?.traceId || '').trim() || undefined,
    taskId: String(taskId || '').trim() || undefined,
    role: 'tool',
    explicitMessageType: MESSAGE_TYPES.TOOL,
    content: toolContent,
    payload: {
      status: normalizedToolResult.status,
      toolCallId: syntheticToolCall.id,
      toolName: String(toolName || '').trim(),
      text: normalizedToolResult.text,
      data: normalizedToolResult.data,
      error: normalizedToolResult.error
    },
    attachments: [],
    idempotencyKey: buildEventIdempotencyKey(request, `async_final_${toolName}_tool`)
  });
  await messageService.saveRaw({ conversationMessageInput: toolInput });

  return {
    assistantMessage: {
      role: 'assistant',
      content: null,
      tool_calls: [syntheticToolCall]
    },
    toolMessage: {
      role: 'tool',
      tool_call_id: syntheticToolCall.id,
      content: toolContent
    }
  };
}

module.exports = {
  persistAsyncToolFinalResult
};
