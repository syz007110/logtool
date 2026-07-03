const test = require('node:test');
const assert = require('node:assert/strict');

const { getLoopPolicy, defaultTurnPolicy, getRuntimeTimeouts } = require('../src/agentization/runtime/turnPolicy');
const { withTimeout, createRuntimeStepLogger } = require('../src/agentization/runtime/runtimeStepUtils');

test('getLoopPolicy returns stable loop limits', () => {
  const policy = getLoopPolicy();
  assert.equal(policy.maxSteps, 4);
  assert.equal(policy.maxToolCalls, 3);
  assert.equal(policy.timeoutBudgetMs, 12000);
  assert.equal(policy.clarifyRoundLimit, 2);
});

test('defaultTurnPolicy mirrors getLoopPolicy', () => {
  assert.deepEqual(defaultTurnPolicy(), getLoopPolicy());
});

test('getRuntimeTimeouts returns positive millisecond values', () => {
  const timeouts = getRuntimeTimeouts();
  assert.ok(timeouts.prepareMs > 0);
  assert.ok(timeouts.stepMs > 0);
});

test('withTimeout rejects when promise exceeds budget', async () => {
  await assert.rejects(
    () => withTimeout(new Promise((resolve) => setTimeout(resolve, 50)), 5, 'slow-step'),
    /slow-step timeout/i
  );
});

test('createRuntimeStepLogger emits structured step logs', () => {
  const logger = createRuntimeStepLogger('job-1');
  assert.equal(typeof logger.log, 'function');
  assert.equal(typeof logger.error, 'function');
});
