const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPublicTaskId,
  buildQueueJobId,
  buildTaskIdentity,
  toCanonicalId
} = require('../src/agentization/orchestrator/agentTaskKeys');
const { buildIdempotencyKey } = require('../src/agentization/session/conversationTurnKeys');

test('buildTaskIdentity derives stable task and queue ids', () => {
  const request = {
    channel: { type: 'web', conversationId: 'conv-1' },
    user: { id: 'user-1' },
    message: { externalMessageId: '01JMSG001' }
  };
  const sourceIdempotencyKey = buildIdempotencyKey(request);
  const canonicalId = toCanonicalId(sourceIdempotencyKey);
  const identity = buildTaskIdentity(sourceIdempotencyKey, 42);

  assert.equal(identity.canonicalId, canonicalId);
  assert.equal(identity.taskId, buildPublicTaskId(canonicalId));
  assert.equal(identity.queueJobId, buildQueueJobId(42, identity.taskId));
  assert.match(identity.taskId, /^task_[a-f0-9]{16}$/);
  assert.equal(identity.queueJobId, `42:${identity.taskId}`);
});
