const test = require('node:test');
const assert = require('node:assert/strict');

const { buildOrchestratorMessages } = require('../src/agentization/orchestrator/promptRenderer');

function zhEnvelope(overrides = {}) {
  return {
    lang: 'zh',
    currentQuery: '这个故障码怎么处理',
    currentInput: {
      assetIds: ['file-1'],
      attachments: []
    },
    historySummary: {
      summary: null
    },
    historyContext: {
      messages: [
        { role: 'user', content: '查 0X010A' },
        { role: 'assistant', content: '查询到 3 个故障码' }
      ]
    },
    ...overrides
  };
}

test('orchestrator prompt renderer builds natural-language user prompt from context envelope', () => {
  const messages = buildOrchestratorMessages(zhEnvelope());

  assert.equal(Array.isArray(messages), true);
  assert.ok(messages.length >= 2);
  assert.equal(messages[0].role, 'system');
  const userBodies = messages.filter((m) => m.role === 'user').map((m) => m.content);
  const joinedUser = userBodies.join('\n');
  assert.match(joinedUser, /这个故障码怎么处理/);
  assert.match(joinedUser, /file-1/);
  assert.match(joinedUser, /查 0X010A/);
  assert.doesNotMatch(joinedUser, /已确认槽位|confirmedSlots|errorCode=/);
  assert.doesNotMatch(joinedUser, /lastIntent|lastTool|lastResultBrief/);
});

test('orchestrator prompt renderer selects english template by lang', () => {
  const messages = buildOrchestratorMessages(zhEnvelope({
    lang: 'en-US',
    currentQuery: 'What does fault code 141010A mean?'
  }));

  const userBodies = messages.filter((m) => m.role === 'user').map((m) => m.content);
  const joinedUser = userBodies.join('\n');
  assert.match(joinedUser, /What does fault code 141010A mean\?/);
  assert.match(messages[0].content, /laparoscopic/i);
});
