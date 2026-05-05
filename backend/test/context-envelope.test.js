const test = require('node:test');
const assert = require('node:assert/strict');

const { buildContextEnvelope } = require('../src/agentization/session/conversationSessionService');

test('context envelope follows target structure', () => {
  const request = {
    message: {
      text: '这个故障码怎么处理 0X010A',
      attachments: [{ fileId: 'file-current-1' }]
    }
  };
  const history = [
    { role: 'user', message_type: 'text', content: '查 0X010A' },
    {
      role: 'intent',
      message_type: 'json',
      payload: { intent: 'error_code_search', toolCall: { toolName: 'errorCodeSearch' } }
    },
    { role: 'assistant', message_type: 'text', content: '查询到 3 个子系统下的同类故障码，建议先检查连接。' }
  ];
  history[0].attachments = [{ fileId: 'file-history-1' }];
  const sessionState = {
    filters: [{ errorCode: '0X010A' }, { device: '4371-01' }, { Phenomenon: '' }, { Concept: '' }],
    pendingSlot: null
  };

  const envelope = buildContextEnvelope({ request, history, sessionState });

  assert.equal(envelope.currentInput.rawText.includes('这个故障码怎么处理'), true);
  assert.equal(envelope.currentInput.messageId, null);
  assert.ok(Array.isArray(envelope.currentInput.attachments));
  assert.deepEqual(envelope.currentInput.fileIds, ['file-current-1']);
  assert.equal(typeof envelope.confirmedSlots, 'object');
  assert.equal(envelope.confirmedSlots.errorCode, '0X010A');
  assert.equal(envelope.confirmedSlots.device, '4371-01');
  assert.equal(envelope.confirmedSlots.phenomenon, null);
  assert.equal(envelope.confirmedSlots.concept, null);
  assert.equal(envelope.confirmedSlots.component, null);
  assert.deepEqual(envelope.confirmedSlots.fileIds, ['file-current-1', 'file-history-1']);

  assert.equal(typeof envelope.historySummary, 'object');
  assert.equal(envelope.historySummary.lastIntent, 'error_code_search');
  assert.equal(envelope.historySummary.lastTool, 'errorCodeSearch');
  assert.equal(typeof envelope.historySummary.lastResultBrief, 'string');

  assert.equal(typeof envelope.historyContext.summary, 'string');
  assert.ok(Array.isArray(envelope.historyContext.recentTurns));
  assert.equal(envelope.historyContext.recentTurns.some((t) => t.role === 'user'), true);
  assert.equal(envelope.historyContext.recentTurns.some((t) => t.role === 'assistant'), true);
  assert.equal(envelope.contextVersion, 1);
});
