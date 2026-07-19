const test = require('node:test');
const assert = require('node:assert/strict');

const { buildContextEnvelope } = require('../src/agentization/session/conversationSessionService');

test('context envelope follows target structure', () => {
  const request = {
    message: {
      externalMessageId: 'msg-current',
      text: '这个故障码怎么处理 0X010A',
      attachments: [{ assetId: 'file-current-1' }]
    }
  };
  const history = [
    { role: 'user', message_type: 'text', content: '查 0X010A' },
    {
      role: 'assistant',
      message_type: 'orchestrator',
      payload: { intent: 'error_code_search', toolCall: { toolName: 'errorCodeSearch' } }
    },
    { role: 'assistant', message_type: 'text', content: '查询到 3 个子系统下的同类故障码，建议先检查连接。' }
  ];
  history[0].attachments = [{ assetId: 'file-history-1' }];

  const envelope = buildContextEnvelope({ request, history });

  assert.equal(envelope.currentQuery.includes('这个故障码怎么处理'), true);
  assert.equal(envelope.currentInput.messageId, 'msg-current');
  assert.ok(Array.isArray(envelope.currentInput.attachments));
  assert.deepEqual(envelope.currentInput.assetIds, ['file-current-1']);
  assert.equal(Object.prototype.hasOwnProperty.call(envelope, 'confirmedSlots'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(envelope, 'sessionState'), false);

  assert.deepEqual(envelope.historySummary, { summary: null });

  assert.equal(Object.prototype.hasOwnProperty.call(envelope.historyContext, 'summary'), false);
  assert.ok(Array.isArray(envelope.historyContext.messages));
  assert.equal(envelope.historyContext.messages.some((t) => t.role === 'user'), true);
  assert.equal(envelope.historyContext.messages.some((t) => t.role === 'assistant'), true);
  assert.equal(envelope.contextVersion, 2);
});

test('context envelope keeps current query as the only current text source', () => {
  const request = {
    message: {
      externalMessageId: 'msg-current',
      text: '141010A 什么意思',
      attachments: []
    }
  };
  const envelope = buildContextEnvelope({ request, history: [] });
  assert.equal(envelope.currentQuery, '141010A 什么意思');
  assert.deepEqual(envelope.currentInput.assetIds, []);
  assert.equal(Object.prototype.hasOwnProperty.call(envelope, 'confirmedSlots'), false);
});

test('context envelope excludes current user message from history messages', () => {
  const request = {
    message: {
      externalMessageId: 'msg-current',
      text: '请继续解释这个故障码',
      attachments: []
    }
  };
  const history = [
    { message_id: 'msg-prev', role: 'user', message_type: 'text', content: '故障码141010A是什么意思' },
    { message_id: 'msg-prev:assistant', role: 'assistant', message_type: 'text', content: '141010A 表示……' },
    { message_id: 'msg-current', role: 'user', message_type: 'text', content: '请继续解释这个故障码' }
  ];

  const envelope = buildContextEnvelope({ request, history });

  assert.equal(envelope.currentQuery, '请继续解释这个故障码');
  assert.deepEqual(envelope.historyContext.messages, [
    { role: 'user', content: '故障码141010A是什么意思' },
    { role: 'assistant', content: '141010A 表示……' }
  ]);
});
