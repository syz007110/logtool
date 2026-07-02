const test = require('node:test');
const assert = require('node:assert/strict');

const { assembleChatCompletionRequest } = require('../src/agentization/orchestrator/chatRequestAssembler');
const {
  normalizeChatCompletionResponse,
  parseOrchestratorTurnResult,
  parseToolArguments
} = require('../src/agentization/orchestrator/chatResponseParser');
const { adaptChatCompletionRequest } = require('../src/agentization/orchestrator/chatProviderAdapter');
const { runTurnLoop } = require('../src/agentization/runtime/turnLoop');

test('assembleChatCompletionRequest builds system + history + current user messages', () => {
  const req = assembleChatCompletionRequest({
    contextEnvelope: {
      lang: 'zh-CN',
      currentQuery: '查 141010A',
      currentInput: { fileIds: ['f-1'] },
      historySummary: { summary: '用户此前查询过故障码' },
      historyContext: {
        messages: [
          { role: 'user', content: '你好' },
          { role: 'assistant', content: '你好，有什么可以帮你？' }
        ]
      }
    },
    userPermissions: ['error_code:read'],
    model: 'test-model',
    traceId: 'trace-1'
  });

  assert.equal(req.model, 'test-model');
  assert.equal(req.messages[0].role, 'system');
  assert.equal(req.tool_choice, 'auto');
  assert.ok(Array.isArray(req.tools) && req.tools.length > 0);
  assert.equal(req.response_format, null);
  assert.equal(req.extensions.traceId, 'trace-1');

  const joined = req.messages.map((m) => m.content).join('\n');
  assert.match(joined, /查 141010A/);
  assert.match(joined, /f-1/);
  assert.match(joined, /用户此前查询过故障码/);
  assert.match(joined, /你好/);
});

test('adaptChatCompletionRequest strips extensions from provider body', () => {
  const chatRequest = assembleChatCompletionRequest({
    contextEnvelope: { currentQuery: 'x', historyContext: { messages: [] } },
    model: 'm'
  });
  const { body } = adaptChatCompletionRequest(chatRequest, { id: 'qwen', model: 'qwen-max' });
  assert.equal(body.extensions, undefined);
  assert.equal(Array.isArray(body.messages), true);
  assert.equal(body.stream, false);
});

test('parseOrchestratorTurnResult handles tool_calls', () => {
  const chatResponse = normalizeChatCompletionResponse({
    choices: [{
      finish_reason: 'tool_calls',
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call-1',
          type: 'function',
          function: {
            name: 'error_code_lookup',
            arguments: '{"errorCode":"141010A","language":"zh-CN"}'
          }
        }]
      }
    }],
    usage: { total_tokens: 99 }
  });

  const turn = parseOrchestratorTurnResult(chatResponse);
  assert.equal(turn.kind, 'tool_call');
  assert.equal(turn.toolCalls[0].toolName, 'error_code_lookup');
  assert.equal(turn.toolCalls[0].arguments.errorCode, '141010A');
});

test('parseOrchestratorTurnResult handles content message', () => {
  const turn = parseOrchestratorTurnResult(normalizeChatCompletionResponse({
    choices: [{
      finish_reason: 'stop',
      message: { role: 'assistant', content: '请提供故障码。' }
    }]
  }));
  assert.equal(turn.kind, 'message');
  assert.match(turn.content, /故障码/);
});

test('parseToolArguments rejects invalid JSON', () => {
  assert.throws(() => parseToolArguments('{bad'), /not valid JSON/i);
});

test('runTurnLoop passthroughs message content without planner', async () => {
  const out = await runTurnLoop({
    request: { traceId: 't-1' },
    prepared: { contextEnvelope: { currentQuery: 'x' } },
    turnResult: { kind: 'message', content: '直接回复用户。' },
    toolGateway: { invokeFromToolCall: async () => ({ text: 'unused' }) },
    timeouts: { stepMs: 5000 },
    stepLogger: { log: () => {} },
    onLastStep: () => {}
  });
  assert.equal(out.assistantResponse.text, '直接回复用户。');
  assert.equal(out.toolCallsUsed, 0);
});

test('runTurnLoop invokes gateway on tool_call', async (t) => {
  const gateway = {
    invokeFromToolCall: async () => ({ text: 'tool done', debugMeta: {} })
  };

  const out = await runTurnLoop({
    request: { traceId: 't-1' },
    prepared: { contextEnvelope: {} },
    turnResult: {
      kind: 'tool_call',
      toolCalls: [{ id: 'c1', toolName: 'error_code_lookup', arguments: { errorCode: '141010A' } }]
    },
    toolGateway: gateway,
    timeouts: { stepMs: 5000 },
    stepLogger: { log: () => {} },
    onLastStep: () => {}
  });
  assert.equal(out.assistantResponse.text, 'tool done');
  assert.equal(out.toolCallsUsed, 1);
});
