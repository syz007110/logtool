const test = require('node:test');
const assert = require('node:assert/strict');

const { buildConversationIntentMessages } = require('../src/services/qwenService');

function zhEnvelope(overrides = {}) {
  return {
    lang: 'zh',
    currentInput: {
      rawText: '这个故障码怎么处理',
      fileIds: [],
      attachments: []
    },
    confirmedSlots: {
      errorCode: '0X010A',
      device: '4371-01',
      phenomenon: null,
      concept: null,
      component: null
    },
    historySummary: {
      lastIntent: 'fault_code',
      lastTool: 'errorCodeSearch',
      lastResultBrief: '查询到 3 个结果'
    },
    historyContext: {
      summary: '无',
      recentTurns: [
        { role: 'user', text: '查 0X010A' },
        { role: 'assistant', text: '查询到 3 个故障码' }
      ]
    },
    ...overrides
  };
}

test('conversation intent prompt renderer builds natural-language user prompt from context envelope', () => {
  const messages = buildConversationIntentMessages(zhEnvelope());

  assert.equal(Array.isArray(messages), true);
  assert.ok(messages.length >= 3);
  assert.equal(messages[0].role, 'system');
  const userBodies = messages.filter((m) => m.role === 'user').map((m) => m.content);
  const joinedUser = userBodies.join('\n');
  assert.match(joinedUser, /这个故障码怎么处理/);
  assert.match(joinedUser, /errorCode=0X010A/);
  assert.match(joinedUser, /查 0X010A/);
});

test('conversation intent prompt renderer selects english template by lang', () => {
  const messages = buildConversationIntentMessages(zhEnvelope({
    lang: 'en',
    currentInput: {
      rawText: 'how to handle this fault code',
      fileIds: [],
      attachments: []
    }
  }));

  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /toolSlots/);
  const userBodies = messages.filter((m) => m.role === 'user').map((m) => m.content);
  const joinedUser = userBodies.join('\n');
  assert.match(joinedUser, /how to handle this fault code/);
});
