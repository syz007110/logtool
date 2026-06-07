const { buildAgentResponse, buildMessageInput } = require('../types/contracts');
const { buildCanonicalId } = require('./idempotencyKey');
const { assertTransition, isTerminalStatus } = require('./taskStateMachine');
const { isRetryableError, computeBackoffMs } = require('./retryPolicy');
const { createInMemoryTaskStore } = require('./stores/inMemoryTaskStore');
const { createNoopAuditStore } = require('./stores/noopAuditStore');

function createDefaultIdGenerator() {
  let seq = 0;
  return () => {
    seq += 1;
    return `task_${Date.now()}_${seq}`;
  };
}

function createTaskOrchestrator(options = {}) {
  const syncTimeoutMs = Number.isFinite(Number(options.syncTimeoutMs)) ? Number(options.syncTimeoutMs) : 4500;
  const taskTimeoutMs = Number.isFinite(Number(options.taskTimeoutMs)) ? Number(options.taskTimeoutMs) : 12000;
  const maxAttempts = Number.isFinite(Number(options.maxAttempts)) ? Math.max(1, Number(options.maxAttempts)) : 3;
  const retryBaseMs = Number.isFinite(Number(options.retryBaseMs)) ? Math.max(1, Number(options.retryBaseMs)) : 300;
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const executeAgent = options.executeAgent;
  const idGenerator = typeof options.idGenerator === 'function' ? options.idGenerator : createDefaultIdGenerator();
  const taskStore = options.taskStore || createInMemoryTaskStore();
  const auditStore = options.auditStore || createNoopAuditStore();

  if (typeof executeAgent !== 'function') {
    throw new Error('executeAgent function is required');
  }

  const inFlight = new Map();

  function runtimeLog(event, payload = {}) {
    const raw = String(process.env.AGENT_RUNTIME_STATE_DEBUG || 'true').trim().toLowerCase();
    const enabled = raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
    if (!enabled) return;
    console.log('[agent-runtime-orchestrator]', {
      event: String(event || ''),
      ...payload
    });
  }

  function isPromiseLike(value) {
    return Boolean(value) && typeof value.then === 'function';
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  async function appendAudit(event) {
    try {
      await auditStore.append(event);
    } catch (_) {
      // 审计失败不阻塞主流程
    }
  }

  async function transitionTask(taskId, toStatus, mutate, reason) {
    let previousStatus = null;
    runtimeLog('TRANSITION_BEGIN', { taskId, toStatus, reason: reason || null });
    let nextTask = taskStore.updateTask(taskId, (task) => {
      assertTransition(task.status, toStatus);
      previousStatus = task.status;
      task.status = toStatus;
      task.updatedAt = now();
      if (typeof mutate === 'function') mutate(task);
    });
    if (isPromiseLike(nextTask)) nextTask = await nextTask;

    if (!nextTask) return null;
    runtimeLog('TRANSITION_DONE', {
      taskId,
      fromStatus: previousStatus,
      toStatus,
      attempt: Number(nextTask?.attempt || 0),
      reason: reason || null
    });

    appendAudit({
      taskId,
      eventType: 'TASK_TRANSITION',
      fromStatus: previousStatus,
      toStatus,
      reason: reason || null,
      traceId: nextTask?.request?.traceId,
      requestId: nextTask?.request?.requestId,
      payload: {
        status: nextTask?.status,
        attempt: nextTask?.attempt,
        channelType: nextTask?.request?.channel?.type
      },
      timestamp: now()
    });

    return nextTask;
  }

  function toTaskView(task) {
    if (!task) return null;
    return {
      taskId: task.taskId,
      canonicalId: task.canonicalId,
      sourceIdempotencyKey: task.sourceIdempotencyKey,
      status: task.status,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      finishedAt: task.finishedAt,
      updatedAt: task.updatedAt,
      attempt: task.attempt,
      maxAttempts: task.maxAttempts,
      nextRetryAt: task.nextRetryAt || null,
      response: task.response || null,
      error: task.error || null,
      request: task.request
    };
  }

  function normalizeError(error) {
    return {
      message: String(error?.message || error || 'unknown error'),
      code: String(error?.code || 'TASK_EXECUTION_FAILED')
    };
  }

  async function executeWithTimeout(request) {
    let timer = null;
    try {
      return await Promise.race([
        executeAgent(request),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            const timeoutErr = new Error(`task timed out in ${taskTimeoutMs}ms`);
            timeoutErr.code = 'TASK_TIMEOUT';
            timeoutErr.retryable = true;
            reject(timeoutErr);
          }, taskTimeoutMs);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function runTask(taskId, request) {
    runtimeLog('RUN_TASK_START', {
      taskId,
      traceId: String(request?.traceId || ''),
      requestId: String(request?.requestId || '')
    });
    let task = taskStore.getTask(taskId);
    if (isPromiseLike(task)) task = await task;
    if (!task || isTerminalStatus(task.status)) return task;

    while (true) {
      task = taskStore.getTask(taskId);
      if (isPromiseLike(task)) task = await task;
      if (!task || isTerminalStatus(task.status)) return task;

      if (task.status === 'queued' || task.status === 'retry_wait') {
        task = await transitionTask(
          taskId,
          'running',
          (current) => {
            if (!current.startedAt) current.startedAt = now();
            current.attempt = Number(current.attempt || 0) + 1;
            current.lastAttemptAt = now();
            current.nextRetryAt = null;
          },
          'start_or_retry'
        );
        if (!task) return null;
      }

      try {
        const response = await executeWithTimeout(request);
        task = await transitionTask(
          taskId,
          'completed',
          (current) => {
            current.finishedAt = now();
            current.response = response;
            current.error = null;
          },
          'completed'
        );
        return task;
      } catch (error) {
        runtimeLog('RUN_TASK_EXECUTE_ERROR', {
          taskId,
          message: String(error?.message || error || ''),
          code: String(error?.code || ''),
          retryable: isRetryableError(error)
        });
        const retryable = isRetryableError(error);
        let updatedTask = taskStore.getTask(taskId);
        if (isPromiseLike(updatedTask)) updatedTask = await updatedTask;
        const currentAttempt = Number(updatedTask?.attempt || task?.attempt || 1);

        if (retryable && currentAttempt < maxAttempts) {
          const backoffMs = computeBackoffMs(currentAttempt, retryBaseMs);
          task = await transitionTask(
            taskId,
            'retry_wait',
            (current) => {
              current.error = normalizeError(error);
              current.nextRetryAt = now() + backoffMs;
            },
            'retryable_error'
          );

          appendAudit({
            taskId,
            eventType: 'TASK_RETRY_SCHEDULED',
            attempt: currentAttempt,
            maxAttempts,
            backoffMs,
            error: normalizeError(error),
            timestamp: now()
          });

          await sleep(backoffMs);
          continue;
        }

        task = await transitionTask(
          taskId,
          'failed',
          (current) => {
            current.finishedAt = now();
            current.error = normalizeError(error);
          },
          retryable ? 'retry_exhausted' : 'non_retryable_error'
        );

        return task;
      }
    }
  }

  function startRunner(taskId, request) {
    if (inFlight.has(taskId)) return inFlight.get(taskId);

    const runner = runTask(taskId, request)
      .finally(() => {
        inFlight.delete(taskId);
      });

    inFlight.set(taskId, runner);
    return runner;
  }

  function buildAsyncAcceptedResponse(taskId, strategy) {
    return buildAgentResponse({
      mode: 'async',
      text: '任务已进入异步队列，请稍后查询任务状态',
      actions: [{ type: 'poll_task', taskId }],
      taskId,
      debugMeta: {
        orchestrator: {
          syncTimeoutMs,
          taskTimeoutMs,
          maxAttempts,
          strategy
        }
      }
    });
  }

  function buildSyncResponse(response, strategy, elapsedMs) {
    return buildAgentResponse({
      ...response,
      mode: 'sync',
      debugMeta: {
        ...(response?.debugMeta || {}),
        orchestrator: {
          syncTimeoutMs,
          taskTimeoutMs,
          maxAttempts,
          elapsedMs,
          strategy
        }
      }
    });
  }

  async function ensureTask(request) {
    const { canonicalId, sourceIdempotencyKey } = buildCanonicalId(request);
    let existing = taskStore.getTaskByCanonicalId(canonicalId);
    if (isPromiseLike(existing)) existing = await existing;
    if (existing) return { task: existing, created: false };

    const taskId = idGenerator();
    const createdAt = now();
    let out = taskStore.createTask({
      taskId,
      canonicalId,
      sourceIdempotencyKey,
      status: 'queued',
      createdAt,
      updatedAt: createdAt,
      startedAt: null,
      finishedAt: null,
      attempt: 0,
      maxAttempts,
      nextRetryAt: null,
      response: null,
      error: null,
      request: {
        traceId: request.traceId,
        requestId: request.requestId,
        channel: request.channel,
        user: request.user
      }
    });
    if (isPromiseLike(out)) out = await out;

    if (out.created) {
      appendAudit({
        taskId,
        eventType: 'TASK_CREATED',
        toStatus: 'queued',
        traceId: request.traceId,
        timestamp: createdAt
      });
    }

    return { task: out.task, created: out.created };
  }

  async function execute(input) {
    const request = buildMessageInput(input);
    const preferAsync = Boolean(request.context.preferAsync);
    const startedAt = now();
    const { task, created } = await ensureTask(request);
    const taskId = task.taskId;

    if (isTerminalStatus(task.status)) {
      if (task.status === 'completed' && task.response) {
        return buildSyncResponse(task.response, 'idempotent_cached', Math.max(0, Number(now()) - Number(startedAt)));
      }
      return buildAsyncAcceptedResponse(taskId, 'idempotent_terminal');
    }

    const runner = startRunner(taskId, request);

    if (preferAsync || !created) {
      return buildAsyncAcceptedResponse(taskId, created ? 'async_requested' : 'idempotent_inflight');
    }

    const timeoutRace = await Promise.race([
      runner.then((finalTask) => ({ type: 'done', finalTask })),
      sleep(syncTimeoutMs).then(() => ({ type: 'timeout' }))
    ]);

    if (timeoutRace.type === 'done' && timeoutRace.finalTask?.status === 'completed' && timeoutRace.finalTask.response) {
      const elapsedMs = Math.max(0, Number(now()) - Number(startedAt));
      return buildSyncResponse(timeoutRace.finalTask.response, 'sync', elapsedMs);
    }

    if (timeoutRace.type === 'done' && timeoutRace.finalTask?.status === 'failed') {
      throw new Error(timeoutRace.finalTask?.error?.message || 'task failed');
    }

    return buildAsyncAcceptedResponse(taskId, 'sync_timeout_fallback_async');
  }

  function getTask(taskId) {
    const out = taskStore.getTask(String(taskId || ''));
    if (out && typeof out.then === 'function') {
      return out.then((task) => toTaskView(task));
    }
    return toTaskView(out);
  }

  return {
    execute,
    getTask,
    _internal: {
      runTask
    }
  };
}

module.exports = {
  createTaskOrchestrator
};
