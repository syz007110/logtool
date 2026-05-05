const test = require('node:test');
const assert = require('node:assert/strict');

const { createTaskOrchestrator } = require('../src/agentization/orchestrator/taskOrchestrator');

test('orchestrator returns sync response when within budget', async () => {
  const orchestrator = createTaskOrchestrator({
    syncTimeoutMs: 100,
    now: (() => {
      let t = 0;
      return () => ++t;
    })(),
    executeAgent: async (request) => ({
      mode: 'sync',
      text: `handled:${request.message?.text || ''}`,
      cards: [],
      links: [],
      actions: [],
      debugMeta: {}
    })
  });

  const result = await orchestrator.execute({
    traceId: 'trace-1',
    requestId: 'req-1',
    user: { id: 'u1' },
    channel: { type: 'api', conversationType: 'single', conversationId: 'conv-1' },
    message: { id: 'msg-1', type: 'text', text: 'hello', sentAt: 1710000000001 },
    context: {}
  });

  assert.equal(result.mode, 'sync');
  assert.match(result.text, /handled:hello/);
  assert.equal(result.taskId, undefined);
});

test('orchestrator queues async task and exposes status endpoint data', async () => {
  let resolveTask;
  const taskPromise = new Promise((resolve) => {
    resolveTask = resolve;
  });

  const orchestrator = createTaskOrchestrator({
    syncTimeoutMs: 1,
    now: (() => {
      let t = 0;
      return () => ++t;
    })(),
    executeAgent: async () => {
      await taskPromise;
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

  const queued = await orchestrator.execute({
    traceId: 'trace-2',
    requestId: 'req-2',
    user: { id: 'u2' },
    channel: { type: 'api', conversationType: 'single', conversationId: 'conv-2' },
    message: { id: 'msg-2', type: 'text', text: 'slow', sentAt: 1710000000002 },
    context: { preferAsync: true }
  });

  assert.equal(queued.mode, 'async');
  assert.ok(queued.taskId);

  const running = orchestrator.getTask(queued.taskId);
  assert.equal(running.status, 'running');

  resolveTask();
  await new Promise((r) => setTimeout(r, 0));

  const done = orchestrator.getTask(queued.taskId);
  assert.equal(done.status, 'completed');
  assert.equal(done.response.text, 'done');
});
