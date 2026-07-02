const test = require('node:test');
const assert = require('node:assert/strict');

const { defaultTurnPolicy, getRuntimeTimeouts } = require('../src/agentization/runtime/turnPolicy');
const { withTimeout, createRuntimeStepLogger } = require('../src/agentization/runtime/runtimeStepUtils');

test('defaultTurnPolicy returns stable loop limits', () => {
  const policy = defaultTurnPolicy();
  assert.equal(policy.maxSteps, 4);
  assert.equal(policy.maxToolCalls, 2);
  assert.equal(policy.timeoutBudgetMs, 12000);
  assert.equal(policy.clarifyRoundLimit, 2);
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
