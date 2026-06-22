const test = require('node:test');
const assert = require('node:assert/strict');

const { buildIdempotencyKey } = require('../src/agentization/session/conversationTurnKeys');
const { buildQueueJobId } = require('../src/agentization/orchestrator/agentTaskKeys');
const { buildPublicTaskId, toCanonicalId } = require('../src/agentization/orchestrator/agentTaskKeys');

test('buildIdempotencyKey uses message idempotency key', () => {
  const key = buildIdempotencyKey({
    channel: { type: 'web', conversationId: 'conv-1' },
    user: { id: 'u-1' },
    message: { externalMessageId: 'msg-1' }
  });
  assert.equal(key, 'web:u-1:conv-1:msg-1');
});

test('buildQueueJobId prefixes with conversation instance id and public task id', () => {
  const taskId = buildPublicTaskId(toCanonicalId('web:u-1:conv-1:msg-1'));
  const jobId = buildQueueJobId(123, taskId);
  assert.equal(jobId, `123:${taskId}`);
});
