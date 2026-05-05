const test = require('node:test');
const assert = require('node:assert/strict');

const { createTaskOrchestrator } = require('../src/agentization/orchestrator/taskOrchestrator');

function baseRequest(overrides = {}) {
  return {
    traceId: 'trace-base',
    requestId: 'req-base',
    user: { id: 'u1' },
    channel: { type: 'api', conversationType: 'single', conversationId: 'conv-1' },
    message: { id: 'msg-1', type: 'text', text: 'hello', sentAt: 1710000000001 },
    context: {},
    ...overrides
  };
}

test('orchestrator reuses existing async task for duplicate idempotency key', async () => {
  let resolveTask;
  let executeCount = 0;
  const blocker = new Promise((resolve) => {
    resolveTask = resolve;
  });

  const orchestrator = createTaskOrchestrator({
    syncTimeoutMs: 10,
    executeAgent: async () => {
      executeCount += 1;
      await blocker;
      return {
        mode: 'sync',
        text: 'done',
        cards: [],
        links: [],
        actions: [],
        debugMeta: {}
      };
    }
  });

  const req = baseRequest({
    traceId: 'trace-idem',
    requestId: 'req-idem',
    message: { id: 'msg-idem', type: 'text', text: 'same', sentAt: 1710000000002 },
    context: { preferAsync: true }
  });

  const first = await orchestrator.execute(req);
  const second = await orchestrator.execute(req);

  assert.equal(first.mode, 'async');
  assert.equal(second.mode, 'async');
  assert.equal(second.taskId, first.taskId);
  assert.equal(executeCount, 1);

  resolveTask();
  await new Promise((r) => setTimeout(r, 0));
});

test('orchestrator retries retryable errors before failing', async () => {
  let attempts = 0;

  const orchestrator = createTaskOrchestrator({
    syncTimeoutMs: 100,
    taskTimeoutMs: 100,
    maxAttempts: 3,
    retryBaseMs: 1,
    executeAgent: async () => {
      attempts += 1;
      if (attempts === 1) {
        const err = new Error('temporary timeout');
        err.code = 'ETIMEDOUT';
        throw err;
      }
      return {
        mode: 'sync',
        text: 'retry-success',
        cards: [],
        links: [],
        actions: [],
        debugMeta: {}
      };
    }
  });

  const result = await orchestrator.execute(baseRequest({
    traceId: 'trace-retry',
    requestId: 'req-retry',
    message: { id: 'msg-retry', type: 'text', text: 'retry case', sentAt: 1710000000003 }
  }));

  assert.equal(result.mode, 'sync');
  assert.equal(result.text, 'retry-success');
  assert.equal(attempts, 2);
});

test('orchestrator switches to async when sync budget is exceeded', async () => {
  const orchestrator = createTaskOrchestrator({
    syncTimeoutMs: 5,
    executeAgent: async () => {
      await new Promise((r) => setTimeout(r, 30));
      return {
        mode: 'sync',
        text: 'slow-finish',
        cards: [],
        links: [],
        actions: [],
        debugMeta: {}
      };
    }
  });

  const result = await orchestrator.execute(baseRequest({
    traceId: 'trace-timeout',
    requestId: 'req-timeout',
    message: { id: 'msg-timeout', type: 'text', text: 'slow task', sentAt: 1710000000004 }
  }));

  assert.equal(result.mode, 'async');
  assert.ok(result.taskId);
});
