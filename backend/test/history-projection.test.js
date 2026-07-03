const test = require('node:test');
const assert = require('node:assert/strict');

const { buildHistoryMessages } = require('../src/agentization/session/historyProjection');
const { buildHistoryMessages: assembleHistoryMessages } = require('../src/agentization/orchestrator/chatRequestAssembler');

test('buildHistoryMessages replays orchestrator tool_calls and tool results for LLM history', () => {
  const history = [
    {
      message_id: 'msg-prev',
      role: 'user',
      message_type: 'text',
      content: '查 141010A'
    },
    {
      message_id: 'msg-prev:orchestrator_1',
      role: 'assistant',
      message_type: 'orchestrator',
      content: null,
      payload: {
        kind: 'tool_call',
        toolCalls: [{
          id: 'call_abc',
          toolName: 'error_code_lookup',
          rawArguments: '{"errorCode":"141010A"}',
          arguments: { errorCode: '141010A' }
        }]
      }
    },
    {
      message_id: 'msg-prev:tool_result_1_1',
      role: 'tool',
      message_type: 'tool',
      content: '{"status":"success","data":{"code":"141010A"},"evidence":[{"type":"fault_code","id":"1"}]}',
      payload: {
        status: 'success',
        data: { code: '141010A' },
        evidence: [{ type: 'fault_code', id: '1' }],
        toolCallId: 'call_abc',
        toolName: 'error_code_lookup'
      }
    },
    {
      message_id: 'msg-prev:assistant_structured',
      role: 'assistant',
      message_type: 'text',
      content: '141010A 表示某故障。'
    }
  ];

  assert.deepEqual(buildHistoryMessages(history, 5), [
    { role: 'user', content: '查 141010A' },
    {
      role: 'assistant',
      content: null,
      tool_calls: [{
        id: 'call_abc',
        type: 'function',
        function: {
          name: 'error_code_lookup',
          arguments: '{"errorCode":"141010A"}'
        }
      }]
    },
    {
      role: 'tool',
      tool_call_id: 'call_abc',
      content: '{"status":"success","data":{"code":"141010A"},"evidence":[{"type":"fault_code","id":"1"}]}'
    },
    { role: 'assistant', content: '141010A 表示某故障。' }
  ]);
});

test('buildHistoryMessages skips orchestrator rows without tool_calls', () => {
  const history = [
    { role: 'user', message_type: 'text', content: '你好' },
    {
      role: 'assistant',
      message_type: 'orchestrator',
      payload: { kind: 'message', content: '你好，有什么可以帮你？' }
    },
    { role: 'assistant', message_type: 'text', content: '你好，有什么可以帮你？' }
  ];

  assert.deepEqual(buildHistoryMessages(history, 5), [
    { role: 'user', content: '你好' },
    { role: 'assistant', content: '你好，有什么可以帮你？' }
  ]);
});

test('chatRequestAssembler passes tool_calls and tool_call_id from historyContext', () => {
  const messages = assembleHistoryMessages({
    historyContext: {
      messages: [
        { role: 'user', content: '查 141010A' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call_abc',
            type: 'function',
            function: { name: 'error_code_lookup', arguments: '{"errorCode":"141010A"}' }
          }]
        },
        {
          role: 'tool',
          tool_call_id: 'call_abc',
          content: '{"status":"success","data":{"code":"141010A"}}'
        },
        { role: 'assistant', content: '141010A 表示某故障。' }
      ]
    }
  });

  assert.equal(messages.length, 4);
  assert.equal(messages[1].tool_calls[0].function.name, 'error_code_lookup');
  assert.equal(messages[2].tool_call_id, 'call_abc');
});
