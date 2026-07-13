const { normalizeProviderCapabilities } = require('./providerCapabilities');

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function parseToolArguments(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  const text = String(raw ?? '').trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    const err = new Error('tool call arguments is not valid JSON');
    err.code = 'INVALID_TOOL_CALL_ARGUMENTS';
    throw err;
  }
}

/**
 * Normalize provider HTTP JSON to canonical ChatCompletionResponse.
 * @param {object} httpJson
 * @param {object} [capabilities]
 */
function normalizeChatCompletionResponse(httpJson = {}, capabilities = {}) {
  const caps = normalizeProviderCapabilities(capabilities);
  const body = asObject(httpJson);
  const choice = asArray(body.choices)[0] || {};
  const message = asObject(choice.message);
  const normalizedMessage = {
    role: String(message.role || 'assistant'),
    content: message.content == null ? null : String(message.content),
    tool_calls: asArray(message.tool_calls).map((tc) => ({
      id: String(tc?.id || ''),
      type: String(tc?.type || 'function'),
      function: {
        name: String(tc?.function?.name || ''),
        arguments: String(tc?.function?.arguments ?? '')
      }
    }))
  };
  if (caps.preserveReasoningContent && message.reasoning_content != null) {
    normalizedMessage.reasoning_content = String(message.reasoning_content);
  }
  return {
    id: String(body.id || ''),
    object: String(body.object || 'chat.completion'),
    created: Number(body.created || 0),
    model: String(body.model || ''),
    choices: [{
      index: Number(choice.index || 0),
      message: normalizedMessage,
      finish_reason: String(choice.finish_reason || '')
    }],
    usage: asObject(body.usage)
  };
}

/**
 * Parse canonical response into Orchestrator turn result.
 * @returns {{ turnVersion: string, kind: 'message'|'tool_call'|'empty', content: string|null, toolCalls: object[], finishReason: string, usage: object, rawMessage: object }}
 */
function parseOrchestratorTurnResult(chatResponse = {}) {
  const choice = asArray(chatResponse.choices)[0] || {};
  const message = asObject(choice.message);
  const finishReason = String(choice.finish_reason || '').trim();
  const usage = asObject(chatResponse.usage);
  const content = message.content == null ? null : String(message.content).trim() || null;

  const toolCallsRaw = asArray(message.tool_calls).filter((tc) => String(tc?.function?.name || '').trim());
  if (toolCallsRaw.length > 0) {
    const toolCalls = toolCallsRaw.map((tc) => ({
      id: String(tc.id || ''),
      toolName: String(tc.function?.name || '').trim(),
      rawArguments: String(tc.function?.arguments ?? ''),
      arguments: parseToolArguments(tc.function?.arguments)
    }));
    return {
      turnVersion: 'v1',
      kind: 'tool_call',
      content,
      toolCalls,
      finishReason: finishReason || 'tool_calls',
      usage,
      rawMessage: message
    };
  }

  if (content) {
    return {
      turnVersion: 'v1',
      kind: 'message',
      content,
      toolCalls: [],
      finishReason: finishReason || 'stop',
      usage,
      rawMessage: message
    };
  }

  return {
    turnVersion: 'v1',
    kind: 'empty',
    content: null,
    toolCalls: [],
    finishReason: finishReason || 'stop',
    usage,
    rawMessage: message
  };
}

module.exports = {
  normalizeChatCompletionResponse,
  parseOrchestratorTurnResult,
  parseToolArguments
};
