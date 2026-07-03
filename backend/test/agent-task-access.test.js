const test = require('node:test');
const assert = require('node:assert/strict');
const { canReadAgentTask } = require('../src/agentization/security/agentTaskAccess');

test('canReadAgentTask allows owner', () => {
  assert.equal(canReadAgentTask({ user_id: '42' }, { id: 42 }, false), true);
  assert.equal(canReadAgentTask({ user_id: '42' }, { id: '42' }, false), true);
});

test('canReadAgentTask denies other users', () => {
  assert.equal(canReadAgentTask({ user_id: '42' }, { id: 99 }, false), false);
});

test('canReadAgentTask allows admin', () => {
  assert.equal(canReadAgentTask({ user_id: '42' }, { id: 99 }, true), true);
});

test('canReadAgentTask denies missing ownership', () => {
  assert.equal(canReadAgentTask({ user_id: '' }, { id: '42' }, false), false);
  assert.equal(canReadAgentTask({ user_id: '42' }, {}, false), false);
  assert.equal(canReadAgentTask(null, { id: '42' }, false), false);
});
