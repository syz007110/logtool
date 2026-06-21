const { conversationMessageQueue } = require('../../config/queue');
const { projectQueueResultToMessageOutput } = require('../types/messageOutputProjection');
const { buildIdempotencyKey, resolveConversationTarget } = require('./conversationSessionService');
const { buildPartitionedJobId } = require('./conversationQueueKeys');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeWaitMs(value, fallback) {
  const num = Number(value);
  if (Number.isFinite(num) && num >= 0) return num;
  return fallback;
}

function buildTaskIdFromRequest(request) {
  return buildIdempotencyKey(request);
}

async function getOrCreateJob({ taskId, request, routing }) {
  const instanceId = Number(routing?.instance?.id || 0);
  if (!Number.isFinite(instanceId) || instanceId <= 0) {
    throw new Error('conversation instance id is required for queue partitioning');
  }
  const jobId = buildPartitionedJobId(instanceId, taskId);
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
          activeResolution: routing.activeResolution
        }
      },
      {
        jobId
      }
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

function toTaskView(job) {
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

function buildSyncResponse(result, taskId) {
  return {
    mode: 'sync',
    taskId,
    result: projectQueueResultToMessageOutput(result)
  };
}

function buildAsyncResponse(taskId, options = {}) {
  const reason = String(options.reason || 'async_accepted').trim() || 'async_accepted';
  return {
    mode: 'async',
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
  const taskId = buildTaskIdFromRequest(request);
  const waitMs = normalizeWaitMs(options.waitMs, Number(process.env.SESSION_SYNC_WAIT_MS || 4500));
  const routing = await resolveConversationTarget(request);
  const job = await getOrCreateJob({ taskId, request, routing });
  const queueTaskId = String(job?.id || buildPartitionedJobId(routing.instance.id, taskId));

  if (isPreferAsyncRequest(request)) {
    return buildAsyncResponse(queueTaskId, { reason: 'prefer_async' });
  }

  const result = await awaitJobResult(job, waitMs);
  if (result) return buildSyncResponse(result, queueTaskId);
  return buildAsyncResponse(queueTaskId, {
    reason: 'sync_timeout',
    message: `处理超时（${waitMs}ms），任务继续在后台执行，请通过 taskId 查询结果`
  });
}

async function getConversationTask(taskId) {
  const normalized = String(taskId || '').trim();
  if (!normalized) return null;
  const job = await conversationMessageQueue.getJob(normalized);
  if (!job) return null;

  const view = toTaskView(job);
  if (view.state !== 'completed') return view;

  try {
    const result = await job.finished();
    return {
      ...view,
      result: projectQueueResultToMessageOutput(result)
    };
  } catch (error) {
    return {
      ...view,
      state: 'failed',
      failedReason: String(error?.message || error || 'failed')
    };
  }
}

module.exports = {
  buildTaskIdFromRequest,
  buildAsyncResponse,
  buildSyncResponse,
  enqueueConversationRequest,
  getConversationTask,
  isPreferAsyncRequest
};
