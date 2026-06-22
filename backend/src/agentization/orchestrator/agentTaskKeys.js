const crypto = require('crypto');

function toCanonicalId(sourceIdempotencyKey) {
  return crypto.createHash('sha256').update(String(sourceIdempotencyKey || '')).digest('hex');
}

function buildPublicTaskId(canonicalId) {
  const suffix = String(canonicalId || '').slice(0, 16);
  return `task_${suffix}`;
}

function buildQueueJobId(instanceId, taskId) {
  return `${String(instanceId)}:${String(taskId)}`;
}

function buildTaskIdentity(sourceIdempotencyKey, instanceId) {
  const canonicalId = toCanonicalId(sourceIdempotencyKey);
  const taskId = buildPublicTaskId(canonicalId);
  const queueJobId = buildQueueJobId(instanceId, taskId);
  return { canonicalId, taskId, queueJobId };
}

module.exports = {
  toCanonicalId,
  buildPublicTaskId,
  buildQueueJobId,
  buildTaskIdentity
};
