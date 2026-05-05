const test = require('node:test');
const assert = require('node:assert/strict');

const { buildConversationIntentMessages } = require('../src/services/qwenService');

test('conversation intent prompt renderer builds natural-language user prompt from context envelope', () => {
  const messages = buildConversationIntentMessages({
    lang: 'zh',
    currentQuery: '这个故障码怎么处理',
    confirmedSlots: {
      errorCode: '0X010A',
      device: '4371-01',
      phenomenon: null,
      concept: null
    },
    historySummary: {
      lastDomain: 'fault_code',
      lastAction: 'search',
      lastTool: 'errorCodeSearch',
      lastResultBrief: '查询到 3 个结果'
    },
    recentTurns: [
      { turn: 1, role: 'user', text: '查 0X010A' },
      { turn: 1, role: 'assistant', text: '查询到 3 个故障码' }
    ]
  });

  assert.equal(Array.isArray(messages), true);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].role, 'user');
  assert.match(messages[1].content, /当前问题:\s*这个故障码怎么处理/);
  assert.match(messages[1].content, /errorCode=0X010A/);
  assert.match(messages[1].content, /第1轮 user: 查 0X010A/);
});

test('conversation intent prompt renderer selects english template by lang', () => {
  const messages = buildConversationIntentMessages({
    lang: 'en',
    currentQuery: 'how to handle this fault code',
    confirmedSlots: {
      errorCode: '0X010A',
      device: '4371-01',
      phenomenon: null,
      concept: null
    },
    historySummary: {
      lastDomain: 'fault_code',
      lastAction: 'search',
      lastTool: 'errorCodeSearch',
      lastResultBrief: 'found 3 related entries'
    },
    recentTurns: [
      { turn: 1, role: 'user', text: 'check 0X010A' },
      { turn: 1, role: 'assistant', text: 'found 3 fault codes' }
    ]
  });

  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].role, 'user');
  assert.match(messages[0].content, /You are a conversation intent extractor/);
  assert.match(messages[1].content, /Current query: how to handle this fault code/);
});
