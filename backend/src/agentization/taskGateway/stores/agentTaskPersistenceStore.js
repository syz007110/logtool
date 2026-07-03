const { postgresqlSequelize } = require('../../../config/postgresql');
const { buildIdempotencyKey } = require('../../session/conversationTurnKeys');
const { buildTaskIdentity } = require('../agentTaskKeys');
const { parseRequestSnapshot } = require('../agentTaskSnapshot');

function nowIso() {
  return new Date().toISOString();
}

function toTimestamp(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function nextEventId() {
  return `evt_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function buildRequestSnapshot(request) {
  return {
    traceId: request?.traceId,
    requestId: request?.requestId,
    channel: request?.channel,
    user: request?.user,
    message: {
      externalMessageId: request?.message?.externalMessageId,
      type: request?.message?.type,
      sentAt: request?.message?.sentAt
    }
  };
}

function mapQueueStateToTaskStatus(state) {
  const normalized = String(state || '').trim().toLowerCase();
  if (normalized === 'completed') return 'completed';
  if (normalized === 'failed') return 'failed';
  if (normalized === 'active') return 'running';
  if (normalized === 'waiting' || normalized === 'delayed') return 'queued';
  return 'queued';
}

function isTerminalStatus(status) {
  return ['completed', 'failed', 'cancelled', 'degraded'].includes(String(status || '').trim().toLowerCase());
}

async function appendEvent({
  taskId,
  eventType,
  fromStatus = null,
  toStatus = null,
  reason = null,
  traceId = '',
  requestId = '',
  payload = null,
  transaction = null
}) {
  await postgresqlSequelize.query(
    `INSERT INTO agent_event (
       event_id, task_id, event_type, from_status, to_status, reason, trace_id, request_id, payload, created_at
     ) VALUES (
       :eventId, :taskId, :eventType, :fromStatus, :toStatus, :reason, :traceId, :requestId, CAST(:payload AS jsonb), NOW()
     )`,
    {
      replacements: {
        eventId: nextEventId(),
        taskId: String(taskId || ''),
        eventType: String(eventType || '').trim() || 'TASK_EVENT',
        fromStatus: fromStatus ? String(fromStatus) : null,
        toStatus: toStatus ? String(toStatus) : null,
        reason: reason ? String(reason) : null,
        traceId: String(traceId || ''),
        requestId: String(requestId || ''),
        payload: JSON.stringify(payload || {})
      },
      transaction
    }
  );
}

async function getTaskByTaskId(taskId, transaction, forUpdate = false) {
  const [rows] = await postgresqlSequelize.query(
    `SELECT *
       FROM agent_task
      WHERE task_id = :taskId
      LIMIT 1
      ${forUpdate ? 'FOR UPDATE' : ''}`,
    {
      replacements: { taskId: String(taskId || '') },
      transaction
    }
  );
  return rows?.[0] || null;
}

async function getTaskByCanonicalId(canonicalId, transaction) {
  const [rows] = await postgresqlSequelize.query(
    `SELECT *
       FROM agent_task
      WHERE canonical_id = :canonicalId
      LIMIT 1`,
    {
      replacements: { canonicalId: String(canonicalId || '') },
      transaction
    }
  );
  return rows?.[0] || null;
}

function createAgentTaskPersistenceStore() {
  async function createTask({ request, instanceId }) {
    const sourceIdempotencyKey = buildIdempotencyKey(request);
    const normalizedInstanceId = Number(instanceId || 0);
    if (!Number.isFinite(normalizedInstanceId) || normalizedInstanceId <= 0) {
      throw new Error('instance id is required to create agent task');
    }

    const { canonicalId, taskId, queueJobId } = buildTaskIdentity(sourceIdempotencyKey, normalizedInstanceId);
    const requestSnapshot = buildRequestSnapshot(request);
    const transaction = await postgresqlSequelize.transaction();

    try {
      const [insertedRows] = await postgresqlSequelize.query(
        `INSERT INTO agent_task (
           task_id, canonical_id, source_idempotency_key, status,
           trace_id, request_id, channel_type, conversation_id, instance_id, queue_job_id, thread_id, user_id,
           request_snapshot, response_snapshot, error_snapshot,
           created_at, updated_at
         ) VALUES (
           :taskId, :canonicalId, :sourceIdempotencyKey, 'queued',
           :traceId, :requestId, :channelType, :conversationId, :instanceId, :queueJobId, :threadId, :userId,
           CAST(:requestSnapshot AS jsonb), NULL, NULL,
           NOW(), NOW()
         )
         ON CONFLICT (canonical_id) DO NOTHING
         RETURNING *`,
        {
          replacements: {
            taskId,
            canonicalId,
            sourceIdempotencyKey,
            traceId: String(request?.traceId || ''),
            requestId: String(request?.requestId || ''),
            channelType: String(request?.channel?.type || ''),
            conversationId: String(request?.channel?.conversationId || ''),
            instanceId: normalizedInstanceId,
            queueJobId,
            threadId: String(request?.channel?.threadId || '').trim() || null,
            userId: String(request?.user?.id || ''),
            requestSnapshot: JSON.stringify(requestSnapshot)
          },
          transaction
        }
      );

      let task = insertedRows?.[0] || null;
      let created = Boolean(task);

      if (!task) {
        task = await getTaskByCanonicalId(canonicalId, transaction);
      }
      if (!task) {
        throw new Error('agent_task not found after createTask');
      }

      if (created) {
        await appendEvent({
          taskId: task.task_id,
          eventType: 'TASK_ACCEPTED',
          fromStatus: null,
          toStatus: 'queued',
          reason: 'task_created',
          traceId: request?.traceId,
          requestId: request?.requestId,
          payload: {
            instanceId: normalizedInstanceId,
            queueJobId: task.queue_job_id || queueJobId
          },
          transaction
        });
      }

      await transaction.commit();
      return { task, created };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async function markEnqueued({ taskId, request }) {
    const transaction = await postgresqlSequelize.transaction();
    try {
      const task = await getTaskByTaskId(taskId, transaction, true);
      if (!task) {
        await transaction.rollback();
        return null;
      }
      const prevStatus = String(task.status || 'queued');
      if (prevStatus !== 'queued') {
        await transaction.commit();
        return task;
      }

      await postgresqlSequelize.query(
        `UPDATE agent_task
            SET updated_at = NOW()
          WHERE task_id = :taskId`,
        { replacements: { taskId: String(taskId || '') }, transaction }
      );

      await appendEvent({
        taskId,
        eventType: 'TASK_ENQUEUED',
        fromStatus: prevStatus,
        toStatus: 'queued',
        reason: 'queue_enqueued',
        traceId: request?.traceId,
        requestId: request?.requestId,
        payload: { queueJobId: task.queue_job_id || null },
        transaction
      });

      await transaction.commit();
      return task;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async function markRunning({ taskId, request }) {
    const transaction = await postgresqlSequelize.transaction();
    try {
      const task = await getTaskByTaskId(taskId, transaction, true);
      if (!task) {
        await transaction.rollback();
        return null;
      }
      const prevStatus = String(task.status || 'queued');
      if (prevStatus === 'running') {
        await transaction.commit();
        return task;
      }
      if (isTerminalStatus(prevStatus)) {
        await transaction.commit();
        return task;
      }

      await postgresqlSequelize.query(
        `UPDATE agent_task
            SET status = 'running',
                updated_at = NOW()
          WHERE task_id = :taskId`,
        { replacements: { taskId: String(taskId || '') }, transaction }
      );

      await appendEvent({
        taskId,
        eventType: 'TASK_STARTED',
        fromStatus: prevStatus,
        toStatus: 'running',
        reason: 'worker_started',
        traceId: request?.traceId,
        requestId: request?.requestId,
        transaction
      });

      await transaction.commit();
      return task;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async function markCompleted({ taskId, request, response, reason = 'worker_completed' }) {
    const transaction = await postgresqlSequelize.transaction();
    try {
      const task = await getTaskByTaskId(taskId, transaction, true);
      if (!task) {
        await transaction.rollback();
        return null;
      }
      const prevStatus = String(task.status || 'queued');
      const responseSnapshot = response || {};

      await postgresqlSequelize.query(
        `UPDATE agent_task
            SET status = 'completed',
                response_snapshot = CAST(:responseSnapshot AS jsonb),
                error_snapshot = NULL,
                updated_at = NOW()
          WHERE task_id = :taskId`,
        {
          replacements: {
            taskId: String(taskId || ''),
            responseSnapshot: JSON.stringify(responseSnapshot)
          },
          transaction
        }
      );

      if (prevStatus !== 'completed') {
        await appendEvent({
          taskId,
          eventType: 'TASK_COMPLETED',
          fromStatus: prevStatus,
          toStatus: 'completed',
          reason,
          traceId: request?.traceId,
          requestId: request?.requestId,
          payload: { mode: responseSnapshot?.mode || null },
          transaction
        });
      }

      await transaction.commit();
      return task;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async function markFailed({ taskId, request, error, reason = 'worker_failed' }) {
    const transaction = await postgresqlSequelize.transaction();
    try {
      const task = await getTaskByTaskId(taskId, transaction, true);
      if (!task) {
        await transaction.rollback();
        return null;
      }
      const prevStatus = String(task.status || 'queued');
      const errorSnapshot = {
        message: String(error?.message || error || 'unknown error'),
        code: error?.code ? String(error.code) : undefined,
        at: nowIso()
      };

      await postgresqlSequelize.query(
        `UPDATE agent_task
            SET status = 'failed',
                error_snapshot = CAST(:errorSnapshot AS jsonb),
                updated_at = NOW()
          WHERE task_id = :taskId`,
        {
          replacements: {
            taskId: String(taskId || ''),
            errorSnapshot: JSON.stringify(errorSnapshot)
          },
          transaction
        }
      );

      if (prevStatus !== 'failed') {
        await appendEvent({
          taskId,
          eventType: 'TASK_FAILED',
          fromStatus: prevStatus,
          toStatus: 'failed',
          reason,
          traceId: request?.traceId,
          requestId: request?.requestId,
          payload: errorSnapshot,
          transaction
        });
      }

      await transaction.commit();
      return task;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  async function recordSyncTimeout({ taskId, request, waitMs }) {
    const task = await getTaskByTaskId(taskId);
    if (!task) return null;
    await appendEvent({
      taskId,
      eventType: 'TASK_ENQUEUED',
      fromStatus: String(task.status || 'queued'),
      toStatus: String(task.status || 'queued'),
      reason: 'sync_timeout',
      traceId: request?.traceId,
      requestId: request?.requestId,
      payload: { waitMs: Number(waitMs || 0) }
    });
    return task;
  }

  async function markDeferredChannelDelivery({ taskId, reason = 'accepted', request = null, transaction = null }) {
    const snapshot = parseRequestSnapshot(await getTaskByTaskId(taskId, transaction));
    const nextSnapshot = {
      ...snapshot,
      delivery: {
        deferred: true,
        reason: String(reason || 'accepted')
      }
    };
    if (request) {
      nextSnapshot.channel = request?.channel || snapshot?.channel || null;
      nextSnapshot.user = request?.user || snapshot?.user || null;
    }
    await postgresqlSequelize.query(
      `UPDATE agent_task
          SET request_snapshot = CAST(:requestSnapshot AS jsonb),
              updated_at = NOW()
        WHERE task_id = :taskId`,
      {
        replacements: {
          taskId: String(taskId || ''),
          requestSnapshot: JSON.stringify(nextSnapshot)
        },
        transaction
      }
    );
  }

  async function getTask(taskId) {
    return getTaskByTaskId(taskId);
  }

  async function syncFromQueueTask(taskId, queueTask) {
    if (!queueTask || !taskId) return null;
    const nextStatus = mapQueueStateToTaskStatus(queueTask?.state);
    const task = await getTaskByTaskId(taskId);
    if (!task) return null;

    if (isTerminalStatus(task.status)) {
      return task;
    }

    if (nextStatus === 'running' && String(task.status) !== 'running') {
      return task;
    }

    if (nextStatus === 'completed') {
      await markCompleted({
        taskId,
        request: {
          traceId: task.trace_id,
          requestId: task.request_id
        },
        response: queueTask?.result || {},
        reason: 'poll_sync'
      });
    } else if (nextStatus === 'failed') {
      await markFailed({
        taskId,
        request: {
          traceId: task.trace_id,
          requestId: task.request_id
        },
        error: { message: String(queueTask?.failedReason || 'task failed') },
        reason: 'poll_sync'
      });
    }

    return getTaskByTaskId(taskId);
  }

  return {
    createTask,
    markEnqueued,
    markRunning,
    markCompleted,
    markFailed,
    recordSyncTimeout,
    markDeferredChannelDelivery,
    getTask,
    syncFromQueueTask
  };
}

module.exports = {
  createAgentTaskPersistenceStore
};
