const test = require('node:test');
const assert = require('node:assert/strict');

const {
  runTurnLoop,
  mergeDeliveryText,
  buildAssistantMessageFromTurnResult
} = require('../src/agentization/runtime/turnLoop');
const {
  buildOrchestratorSuffix,
  buildToolResultSuffix,
  extractTokenUsageFromLoopTrace
} = require('../src/agentization/session/conversationTurnKeys');

function basePrepared() {
  return {
    contextEnvelope: {
      currentQuery: '查故障码',
      historyContext: { messages: [] }
    },
    policy: { maxSteps: 4, maxToolCalls: 3 }
  };
}

function mockOrchestrator(steps) {
  let callIndex = 0;
  return {
    buildInitialLoopMessages: () => [{ role: 'system', content: 'sys' }, { role: 'user', content: '查故障码' }],
    runWithMessages: async () => {
      const next = steps[callIndex];
      callIndex += 1;
      if (!next) {
        throw new Error('unexpected extra orchestrator call');
      }
      return next;
    }
  };
}

test('event suffix helpers follow orchestrator_n and tool_result_n_k pattern', () => {
  assert.equal(buildOrchestratorSuffix(1), 'orchestrator_1');
  assert.equal(buildToolResultSuffix(2, 1), 'tool_result_2_1');
});

test('runTurnLoop returns assistant text on stop message', async () => {
  const out = await runTurnLoop({
    request: { traceId: 't-1', message: { externalMessageId: 'm-1' } },
    prepared: basePrepared(),
    conversationOrchestrator: mockOrchestrator([{
      kind: 'message',
      content: '直接回复用户。',
      toolCalls: [],
      finishReason: 'stop',
      rawMessage: { role: 'assistant', content: '直接回复用户。' }
    }]),
    toolGateway: { invokeFromToolCall: async () => ({ debugMeta: {} }) },
    policy: { maxSteps: 4, maxToolCalls: 3 },
    timeouts: { stepMs: 5000 },
    stepLogger: { log: () => {} },
    onLastStep: () => {}
  });

  assert.equal(out.assistantResponse.text, '直接回复用户。');
  assert.equal(out.toolCallsUsed, 0);
  assert.equal(out.loopTrace.length, 1);
  assert.equal(out.loopTrace[0].suffix, 'orchestrator_1');
});

test('runTurnLoop executes tool then second LLM step', async () => {
  const gateway = {
    invokeFromToolCall: async () => ({
      text: 'tool done',
      debugMeta: {
        toolResult: {
          status: 'success',
          data: { code: '141010A' },
          evidence: [{ type: 'fault_code', id: '1' }]
        }
      }
    })
  };

  const out = await runTurnLoop({
    request: { traceId: 't-1', message: { externalMessageId: 'm-1' } },
    prepared: basePrepared(),
    conversationOrchestrator: mockOrchestrator([
      {
        kind: 'tool_call',
        content: null,
        toolCalls: [{ id: 'c1', toolName: 'error_code_lookup', arguments: { errorCode: '141010A' }, rawArguments: '{}' }],
        finishReason: 'tool_calls',
        rawMessage: {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'c1', type: 'function', function: { name: 'error_code_lookup', arguments: '{}' } }]
        }
      },
      {
        kind: 'message',
        content: '141010A 表示某故障。',
        toolCalls: [],
        finishReason: 'stop',
        usage: { total_tokens: 20 },
        rawMessage: { role: 'assistant', content: '141010A 表示某故障。' }
      }
    ]),
    toolGateway: gateway,
    policy: { maxSteps: 4, maxToolCalls: 3 },
    timeouts: { stepMs: 5000 },
    stepLogger: { log: () => {} },
    onLastStep: () => {}
  });

  assert.match(out.assistantResponse.text, /141010A/);
  assert.equal(out.toolCallsUsed, 1);
  assert.equal(out.loopTrace.length, 3);
  assert.equal(out.loopTrace[1].suffix, 'tool_result_1_1');
  assert.equal(out.loopMessages.at(-2).role, 'tool');
  assert.equal(out.loopMessages.at(-2).tool_call_id, 'c1');
});

test('runTurnLoop stops when maxToolCalls reached', async () => {
  const out = await runTurnLoop({
    request: { traceId: 't-1', message: { externalMessageId: 'm-1' } },
    prepared: basePrepared(),
    conversationOrchestrator: mockOrchestrator([
      {
        kind: 'tool_call',
        content: 'partial',
        toolCalls: [{ id: 'c1', toolName: 'error_code_lookup', arguments: {}, rawArguments: '{}' }],
        finishReason: 'tool_calls',
        rawMessage: { role: 'assistant', content: 'partial', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'error_code_lookup', arguments: '{}' } }] }
      },
      {
        kind: 'tool_call',
        content: null,
        toolCalls: [{ id: 'c2', toolName: 'error_code_lookup', arguments: {}, rawArguments: '{}' }],
        finishReason: 'tool_calls',
        rawMessage: { role: 'assistant', content: null, tool_calls: [{ id: 'c2', type: 'function', function: { name: 'error_code_lookup', arguments: '{}' } }] }
      },
      {
        kind: 'tool_call',
        content: 'more',
        toolCalls: [{ id: 'c3', toolName: 'error_code_lookup', arguments: {}, rawArguments: '{}' }],
        finishReason: 'tool_calls',
        rawMessage: { role: 'assistant', content: 'more', tool_calls: [{ id: 'c3', type: 'function', function: { name: 'error_code_lookup', arguments: '{}' } }] }
      },
      {
        kind: 'tool_call',
        content: 'blocked',
        toolCalls: [{ id: 'c4', toolName: 'error_code_lookup', arguments: {}, rawArguments: '{}' }],
        finishReason: 'tool_calls',
        rawMessage: { role: 'assistant', content: 'blocked', tool_calls: [{ id: 'c4', type: 'function', function: { name: 'error_code_lookup', arguments: '{}' } }] }
      }
    ]),
    toolGateway: {
      invokeFromToolCall: async () => ({
        debugMeta: { toolResult: { status: 'success', data: {}, evidence: [{ type: 'x', id: '1' }] } }
      })
    },
    policy: { maxSteps: 4, maxToolCalls: 3 },
    timeouts: { stepMs: 5000 },
    stepLogger: { log: () => {} },
    onLastStep: () => {}
  });

  assert.match(out.assistantResponse.text, /调用工具次数已达上限/);
  assert.equal(out.toolCallsUsed, 3);
});

test('runTurnLoop merges degraded finish_reason prefix into delivery text', async () => {
  const out = await runTurnLoop({
    request: { traceId: 't-1', message: { externalMessageId: 'm-1' } },
    prepared: basePrepared(),
    conversationOrchestrator: mockOrchestrator([{
      kind: 'message',
      content: '部分内容',
      toolCalls: [],
      finishReason: 'length',
      rawMessage: { role: 'assistant', content: '部分内容' }
    }]),
    toolGateway: { invokeFromToolCall: async () => ({ debugMeta: {} }) },
    policy: { maxSteps: 4, maxToolCalls: 3 },
    timeouts: { stepMs: 5000 },
    stepLogger: { log: () => {} },
    onLastStep: () => {}
  });

  assert.match(out.assistantResponse.text, /上下文长度限制/);
  assert.match(out.assistantResponse.text, /部分内容/);
});

test('runTurnLoop records errorRuntime on empty orchestrator response', async () => {
  const out = await runTurnLoop({
    request: { traceId: 't-1', message: { externalMessageId: 'm-1' } },
    prepared: basePrepared(),
    conversationOrchestrator: mockOrchestrator([{
      kind: 'empty',
      content: null,
      toolCalls: [],
      finishReason: 'stop',
      rawMessage: { role: 'assistant', content: null }
    }]),
    toolGateway: { invokeFromToolCall: async () => ({ debugMeta: {} }) },
    policy: { maxSteps: 4, maxToolCalls: 3 },
    timeouts: { stepMs: 5000 },
    stepLogger: { log: () => {} },
    onLastStep: () => {}
  });

  assert.match(out.assistantResponse.text, /Agent 内部异常/);
  assert.equal(out.errorRuntime.code, 'ORCHESTRATOR_LLM_EMPTY_CONTENT');
});

test('extractTokenUsageFromLoopTrace sums orchestrator usage', () => {
  const total = extractTokenUsageFromLoopTrace([
    { kind: 'orchestrator', turnResult: { usage: { total_tokens: 10 } } },
    { kind: 'tool' },
    { kind: 'orchestrator', turnResult: { usage: { total_tokens: 15 } } }
  ]);
  assert.equal(total, 25);
});

test('buildAssistantMessageFromTurnResult preserves tool_calls', () => {
  const msg = buildAssistantMessageFromTurnResult({
    kind: 'tool_call',
    toolCalls: [{ id: 'c1', toolName: 'error_code_lookup', rawArguments: '{"errorCode":"A"}', arguments: { errorCode: 'A' } }]
  });
  assert.equal(msg.role, 'assistant');
  assert.equal(msg.tool_calls[0].function.name, 'error_code_lookup');
});

test('mergeDeliveryText keeps prefix when content empty', () => {
  assert.equal(mergeDeliveryText('[降级]', ''), '[降级]');
});
