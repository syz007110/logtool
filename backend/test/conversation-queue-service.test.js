const test = require('node:test');
const assert = require('node:assert/strict');

const { buildIdempotencyKey } = require('../src/agentization/session/conversationSessionService');
const { buildPartitionedJobId } = require('../src/agentization/session/conversationQueueKeys');

test('buildIdempotencyKey uses message idempotency key', () => {
  const taskId = buildIdempotencyKey({
    channel: { type: 'web', conversationId: 'conv-1' },
    user: { id: 'u-1' },
    message: { id: 'msg-1' }
  });
  assert.equal(taskId, 'web:u-1:conv-1:msg-1');
});

test('buildPartitionedJobId prefixes with conversation instance id', () => {
  const jobId = buildPartitionedJobId(123, 'web:u-1:conv-1:msg-1');
  assert.equal(jobId, '123:web:u-1:conv-1:msg-1');
});
