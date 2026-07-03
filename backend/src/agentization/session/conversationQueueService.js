const { conversationMessageQueue } = require('../../config/queue');
const { createAgentTaskPersistenceStore } = require('../taskGateway/stores/agentTaskPersistenceStore');
const { projectQueueResultToMessageOutput } = require('../types/messageOutputProjection');
const {
  resolveConversationTarget,
  persistUserMessageAtTurn
} = require('./conversationSessionService');

const taskStore = createAgentTaskPersistenceStore();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeWaitMs(value, fallback) {
  const num = Number(value);
  if (Number.isFinite(num) && num >= 0) return num;
  return fallback;
}

function isTerminalTaskStatus(status) {
  return ['completed', 'failed', 'cancelled', 'degraded'].includes(String(status || '').trim().toLowerCase());
}

async function getOrCreateJob({ queueJobId, request, routing, taskId }) {
  const instanceId = Number(routing?.instance?.id || 0);
  if (!Number.isFinite(instanceId) || instanceId <= 0) {
    throw new Error('conversation instance id is required for queue partitioning');
  }
  const jobId = String(queueJobId || '').trim();
  if (!jobId) {
    throw new Error('queue job id is required for conversation queue');
  }

  try {
    return await conversationMessageQueue.add(
      'process-conversation',
      {
        request,
        routing: {
          container: {
            id: routing.container.id,
            container_key: routing.container.container_key
          },
          instance: {
            id: routing.instance.id
          },
          activeResolution: routing.activeResolution,
          task: {
            id: String(taskId || '')
          }
        }
      },
      { jobId }
    );
  } catch (error) {
    if (!String(error?.message || '').includes('Job already exists')) throw error;
    const existing = await conversationMessageQueue.getJob(jobId);
    if (existing) return existing;
    throw error;
  }
}

function toJobState(job) {
  if (!job) return 'not_found';
  if (job.finishedOn) return 'completed';
  if (job.failedReason) return 'failed';
  if (job.processedOn) return 'active';
  if (job.delay && job.delay > 0) return 'delayed';
  return 'waiting';
}

function toQueueTaskView(job) {
  if (!job) return null;
  return {
    taskId: String(job.id),
    queue: job.queue?.name || 'conversation-message',
    state: toJobState(job),
    attemptsMade: Number(job.attemptsMade || 0),
    timestamp: Number(job.timestamp || 0),
    processedOn: Number(job.processedOn || 0) || null,
    finishedOn: Number(job.finishedOn || 0) || null,
    failedReason: job.failedReason || null
  };
}

function toPersistedTaskView(taskRow, queueView = null) {
  if (!taskRow) return null;
  const status = String(taskRow.status || 'queued');
  const out = {
    taskId: String(taskRow.task_id || ''),
    queueJobId: String(taskRow.queue_job_id || ''),
    status,
    traceId: String(taskRow.trace_id || ''),
    requestId: String(taskRow.request_id || ''),
    instanceId: taskRow.instance_id == null ? null : Number(taskRow.instance_id),
    createdAt: taskRow.created_at || null,
    updatedAt: taskRow.updated_at || null,
    queue: queueView?.queue || 'conversation-message',
    state: queueView?.state || status,
    attemptsMade: Number(queueView?.attemptsMade || 0),
    processedOn: queueView?.processedOn || null,
    finishedOn: queueView?.finishedOn || null,
    failedReason: queueView?.failedReason || null
  };

  if (status === 'completed' && taskRow.response_snapshot) {
    out.result = taskRow.response_snapshot;
  }
  if (status === 'failed' && taskRow.error_snapshot) {
    out.error = taskRow.error_snapshot;
  }
  return out;
}

function buildCompletedResponse(result, taskId) {
  return {
    mode: 'completed',
    taskId,
    result: projectQueueResultToMessageOutput(result)
  };
}

function buildAcceptedResponse(taskId, options = {}) {
  const reason = String(options.reason || 'task_accepted').trim() || 'task_accepted';
  return {
    mode: 'accepted',
    taskId,
    reason,
    message: String(options.message || '任务已受理，处理完成后可通过 taskId 查询结果').trim()
  };
}

function isPreferAsyncRequest(request) {
  const ctx = request?.context && typeof request.context === 'object' ? request.context : {};
  return Boolean(ctx.preferAsync);
}

async function awaitJobResult(job, waitMs) {
  if (!job) return null;
  if (waitMs <= 0) return null;

  const timeout = sleep(waitMs).then(() => ({ timeout: true }));
  const finished = job.finished()
    .then((value) => ({ timeout: false, value }))
    .catch((error) => {
      throw error;
    });

  const raced = await Promise.race([timeout, finished]);
  if (raced?.timeout) return null;
  return raced.value;
}

async function enqueueConversationRequest(request, options = {}) {
  const waitMs = normalizeWaitMs(options.waitMs, Number(process.env.SESSION_SYNC_WAIT_MS || 4500));
  const routing = await resolveConversationTarget(request);
  const { task } = await taskStore.createTask({
    request,
    instanceId: routing.instance.id
  });

  const publicTaskId = String(task?.task_id || '').trim();
  const queueJobId = String(task?.queue_job_id || '').trim();
  if (!publicTaskId || !queueJobId) {
    throw new Error('agent task id and queue job id are required');
  }
  await persistUserMessageAtTurn({
    request,
    instanceId: routing.instance.id,
    taskId: publicTaskId
  });

  const job = await getOrCreateJob({
    queueJobId,
    request,
    routing,
    taskId: publicTaskId
  });
  await taskStore.markEnqueued({ taskId: publicTaskId, request });

  if (isPreferAsyncRequest(request)) {
    await taskStore.markDeferredChannelDelivery({
      taskId: publicTaskId,
      reason: 'prefer_async',
      request
    });
    return buildAcceptedResponse(publicTaskId, { reason: 'prefer_async' });
  }

  const result = await awaitJobResult(job, waitMs);
  if (result) return buildCompletedResponse(result, publicTaskId);

  await taskStore.recordSyncTimeout({ taskId: publicTaskId, request, waitMs });
  await taskStore.markDeferredChannelDelivery({
    taskId: publicTaskId,
    reason: 'sync_timeout',
    request
  });
  return buildAcceptedResponse(publicTaskId, {
    reason: 'sync_timeout',
    message: `处理超时（${waitMs}ms），任务继续在后台执行，请通过 taskId 查询结果`
  });
}

async function getConversationTask(taskId) {
  const normalized = String(taskId || '').trim();
  if (!normalized) return null;

  let taskRow = await taskStore.getTask(normalized);
  if (!taskRow) return null;

  const queueJobId = String(taskRow.queue_job_id || '').trim();
  const job = queueJobId ? await conversationMessageQueue.getJob(queueJobId) : null;
  const queueView = toQueueTaskView(job);

  if (job && !isTerminalTaskStatus(taskRow.status)) {
    let queueResult = null;
    if (queueView?.state === 'completed') {
      try {
        queueResult = await job.finished();
      } catch (error) {
        queueView.state = 'failed';
        queueView.failedReason = String(error?.message || error || 'failed');
      }
    }

    await taskStore.syncFromQueueTask(normalized, {
      ...queueView,
      result: queueResult ? projectQueueResultToMessageOutput(queueResult) : null
    });
    taskRow = await taskStore.getTask(normalized);
  }

  return toPersistedTaskView(taskRow, queueView);
}

module.exports = {
  buildAcceptedResponse,
  buildCompletedResponse,
  enqueueConversationRequest,
  getConversationTask,
  isPreferAsyncRequest,
  toPersistedTaskView
};
