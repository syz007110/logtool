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
      payload_raw_message: null,
      payload_tool_calls: [{
        id: 'call_abc',
        toolName: 'error_code_lookup',
        rawArguments: '{"errorCode":"141010A"}',
        arguments: { errorCode: '141010A' }
      }],
      payload_content: null
    },
    {
      message_id: 'msg-prev:tool_result_1_1',
      role: 'tool',
      message_type: 'tool',
      content: '{"status":"success","text":"141010A 查询完成","error":null}',
      payload_tool_call_id: 'call_abc',
      payload_status: 'success'
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
      content: '{"status":"success","text":"141010A 查询完成","error":null}'
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
      payload_raw_message: null,
      payload_tool_calls: [],
      payload_content: '你好，有什么可以帮你？'
    },
    { role: 'assistant', message_type: 'text', content: '你好，有什么可以帮你？' }
  ];

  assert.deepEqual(buildHistoryMessages(history, 5), [
    { role: 'user', content: '你好' },
    { role: 'assistant', content: '你好，有什么可以帮你？' }
  ]);
});

test('buildHistoryMessages skips unclosed orchestrator tool_calls rows', () => {
  const history = [
    {
      message_id: 'msg-prev',
      role: 'user',
      message_type: 'text',
      content: '查多个故障码'
    },
    {
      message_id: 'msg-prev:orchestrator_1',
      role: 'assistant',
      message_type: 'orchestrator',
      content: null,
      payload_raw_message: null,
      payload_tool_calls: [
        { id: 'call_1', toolName: 'error_code_lookup', rawArguments: '{"errorCode":"A"}' },
        { id: 'call_2', toolName: 'error_code_lookup', rawArguments: '{"errorCode":"B"}' }
      ],
      payload_content: null
    },
    {
      message_id: 'msg-prev:tool_result_1_1',
      role: 'tool',
      message_type: 'tool',
      content: '{"status":"success"}',
      payload_tool_call_id: 'call_1',
      payload_status: 'success'
    },
    {
      message_id: 'msg-prev:assistant_structured',
      role: 'assistant',
      message_type: 'text',
      content: '只查到部分结果。'
    }
  ];

  assert.deepEqual(buildHistoryMessages(history, 5), [
    { role: 'user', content: '查多个故障码' },
    { role: 'assistant', content: '只查到部分结果。' }
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
          content: '{"status":"success","text":"141010A 查询完成","error":null}'
        },
        { role: 'assistant', content: '141010A 表示某故障。' }
      ]
    }
  });

  assert.equal(messages.length, 4);
  assert.equal(messages[1].tool_calls[0].function.name, 'error_code_lookup');
  assert.equal(messages[2].tool_call_id, 'call_abc');
});
