const test = require('node:test');
const assert = require('node:assert/strict');

const qwenService = require('../src/services/qwenService');
const { createConversationOrchestrator } = require('../src/agentization/orchestrator/conversationOrchestrator');

function baseRequest() {
  return {
    requestId: 'req-1',
    traceId: 'trace-1',
    message: { text: '查 141010A', externalMessageId: 'm-1' },
    channel: { conversationId: 'c-1' },
    context: { userPermissions: ['error_code:read'] }
  };
}

test('conversation orchestrator runWithMessages returns native tool_call turn result', async (t) => {
  const original = qwenService.runOrchestratorLlmWithMessages;
  qwenService.runOrchestratorLlmWithMessages = async () => ({
    turnVersion: 'v1',
    kind: 'tool_call',
    content: null,
    toolCalls: [{
      id: 'call-1',
      toolName: 'error_code_lookup',
      arguments: { errorCode: '141010A', language: 'zh-CN' },
      rawArguments: '{"errorCode":"141010A","language":"zh-CN"}'
    }],
    finishReason: 'tool_calls',
    usage: { total_tokens: 42 },
    chatRequest: { messages: [] },
    chatResponse: { choices: [] }
  });

  t.after(() => { qwenService.runOrchestratorLlmWithMessages = original; });

  const orchestrator = createConversationOrchestrator();
  const out = await orchestrator.runWithMessages(baseRequest(), {
    messages: [{ role: 'user', content: '查 141010A' }],
    contextEnvelope: { currentQuery: '查 141010A', historyContext: { messages: [] } }
  });

  assert.equal(out.turnVersion, 'v1');
  assert.equal(out.kind, 'tool_call');
  assert.equal(out.toolCalls[0].toolName, 'error_code_lookup');
  assert.ok(out.llmRaw);
});

test('conversation orchestrator buildInitialLoopMessages includes system and user', () => {
  const orchestrator = createConversationOrchestrator();
  const messages = orchestrator.buildInitialLoopMessages(baseRequest(), {
    contextEnvelope: {
      currentQuery: '查 141010A',
      historyContext: { messages: [{ role: 'user', content: '你好' }] }
    }
  });

  assert.equal(messages[0].role, 'system');
  assert.ok(messages.some((m) => m.role === 'user' && /141010A/.test(m.content)));
});

test('conversation orchestrator runWithMessages returns message turn result with content passthrough', async (t) => {
  const original = qwenService.runOrchestratorLlmWithMessages;
  qwenService.runOrchestratorLlmWithMessages = async () => ({
    turnVersion: 'v1',
    kind: 'message',
    content: '请提供故障码后我再查询。',
    toolCalls: [],
    finishReason: 'stop',
    usage: { total_tokens: 10 }
  });

  t.after(() => { qwenService.runOrchestratorLlmWithMessages = original; });

  const orchestrator = createConversationOrchestrator();
  const out = await orchestrator.runWithMessages(baseRequest(), {
    messages: [{ role: 'user', content: '这个问题怎么处理' }],
    contextEnvelope: { currentQuery: '这个问题怎么处理', historyContext: { messages: [] } }
  });

  assert.equal(out.kind, 'message');
  assert.match(out.content, /故障码/);
});
