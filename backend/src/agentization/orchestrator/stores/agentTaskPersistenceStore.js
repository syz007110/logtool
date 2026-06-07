const crypto = require('crypto');
const { postgresqlSequelize } = require('../../../config/postgresql');
const { buildIdempotencyKey } = require('../../session/conversationSessionService');

function nowIso() {
  return new Date().toISOString();
}

function toTimestamp(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toCanonicalId(sourceIdempotencyKey) {
  return crypto.createHash('sha256').update(String(sourceIdempotencyKey || '')).digest('hex');
}

function nextId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function mapQueueStateToTaskStatus(state) {
  const normalized = String(state || '').trim().toLowerCase();
  if (normalized === 'completed') return 'completed';
  if (normalized === 'failed') return 'failed';
  if (normalized === 'active') return 'running';
  if (normalized === 'waiting' || normalized === 'delayed') return 'queued';
  return 'queued';
}

async function appendEvent({
  taskId,
  runId = null,
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
       event_id, task_id, run_id, event_type, from_status, to_status, reason, trace_id, request_id, payload, created_at
     ) VALUES (
       :eventId, :taskId, :runId, :eventType, :fromStatus, :toStatus, :reason, :traceId, :requestId, CAST(:payload AS jsonb), NOW()
     )`,
    {
      replacements: {
        eventId: nextId('evt'),
        taskId: String(taskId || ''),
        runId: runId ? String(runId) : null,
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

async function getTaskForUpdate(taskId, transaction) {
  const [rows] = await postgresqlSequelize.query(
    `SELECT task_id, status, latest_run_no
       FROM agent_task
      WHERE task_id = :taskId
      LIMIT 1
      FOR UPDATE`,
    {
      replacements: { taskId: String(taskId || '') },
      transaction
    }
  );
  return rows?.[0] || null;
}

async function getLatestRunForUpdate(taskId, transaction) {
  const [rows] = await postgresqlSequelize.query(
    `SELECT run_id, run_no, status
       FROM agent_run
      WHERE task_id = :taskId
      ORDER BY run_no DESC
      LIMIT 1
      FOR UPDATE`,
    {
      replacements: { taskId: String(taskId || '') },
      transaction
    }
  );
  return rows?.[0] || null;
}

function createAgentTaskPersistenceStore() {
  async function ensureAccepted({ taskId, request, mode }) {
    const sourceIdempotencyKey = buildIdempotencyKey(request);
    const canonicalId = toCanonicalId(sourceIdempotencyKey);
    const requestSnapshot = {
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

    const initialStatus = mode === 'sync' ? 'running' : 'queued';
    const transaction = await postgresqlSequelize.transaction();
    try {
      await postgresqlSequelize.query(
        `INSERT INTO agent_task (
           task_id, canonical_id, source_idempotency_key, status,
           trace_id, request_id, channel_type, conversation_id, instance_id, thread_id, user_id,
           request_snapshot, response_snapshot, error_snapshot, latest_run_no,
           created_at, updated_at
         ) VALUES (
           :taskId, :canonicalId, :sourceIdempotencyKey, :status,
           :traceId, :requestId, :channelType, :conversationId, NULL, :threadId, :userId,
           CAST(:requestSnapshot AS jsonb), NULL, NULL, 0,
           NOW(), NOW()
         )
         ON CONFLICT (task_id)
         DO UPDATE SET
           updated_at = NOW(),
           trace_id = EXCLUDED.trace_id,
           request_id = EXCLUDED.request_id`,
        {
          replacements: {
            taskId: String(taskId || ''),
            canonicalId,
            sourceIdempotencyKey,
            status: initialStatus,
            traceId: String(request?.traceId || ''),
            requestId: String(request?.requestId || ''),
            channelType: String(request?.channel?.type || ''),
            conversationId: String(request?.channel?.conversationId || ''),
            threadId: String(request?.channel?.threadId || '').trim() || null,
            userId: String(request?.user?.id || ''),
            requestSnapshot: JSON.stringify(requestSnapshot)
          },
          transaction
        }
      );

      const currentTask = await getTaskForUpdate(taskId, transaction);
      if (!currentTask) throw new Error('agent_task not found after ensureAccepted');

      let run = await getLatestRunForUpdate(taskId, transaction);
      if (!run) {
        const runNo = Number(currentTask.latest_run_no || 0) + 1;
        const runId = nextId('run');
        await postgresqlSequelize.query(
          `INSERT INTO agent_run (
             run_id, task_id, run_no, status, attempt, max_attempts, next_retry_at,
             worker_id, lease_token, lease_expires_at,
             input_snapshot, output_snapshot, error_snapshot,
             started_at, finished_at, created_at, updated_at
           ) VALUES (
             :runId, :taskId, :runNo, :status, 0, 3, NULL,
             NULL, NULL, NULL,
             CAST(:inputSnapshot AS jsonb), NULL, NULL,
             CASE WHEN :status = 'running' THEN NOW() ELSE NULL END, NULL, NOW(), NOW()
           )`,
          {
            replacements: {
              runId,
              taskId: String(taskId || ''),
              runNo,
              status: initialStatus,
              inputSnapshot: JSON.stringify(requestSnapshot)
            },
            transaction
          }
        );
        await postgresqlSequelize.query(
          `UPDATE agent_task
              SET latest_run_no = :runNo,
                  status = :status,
                  updated_at = NOW()
            WHERE task_id = :taskId`,
          {
            replacements: { runNo, status: initialStatus, taskId: String(taskId || '') },
            transaction
          }
        );
        run = { run_id: runId, run_no: runNo, status: initialStatus };
      }

      await appendEvent({
        taskId,
        runId: run.run_id,
        eventType: 'TASK_ACCEPTED',
        fromStatus: null,
        toStatus: currentTask.status || initialStatus,
        reason: mode === 'sync' ? 'sync_request' : 'async_accepted',
        traceId: request?.traceId,
        requestId: request?.requestId,
        payload: { mode, runNo: run.run_no },
        transaction
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async function markCompleted({ taskId, request, response }) {
    const transaction = await postgresqlSequelize.transaction();
    try {
      const task = await getTaskForUpdate(taskId, transaction);
      if (!task) {
        await transaction.rollback();
        return;
      }
      const run = await getLatestRunForUpdate(taskId, transaction);
      const prevStatus = String(task.status || 'queued');

      if (run) {
        await postgresqlSequelize.query(
          `UPDATE agent_run
              SET status = 'completed',
                  output_snapshot = CAST(:outputSnapshot AS jsonb),
                  error_snapshot = NULL,
                  finished_at = NOW(),
                  updated_at = NOW()
            WHERE run_id = :runId`,
          {
            replacements: {
              runId: String(run.run_id || ''),
              outputSnapshot: JSON.stringify(response || {})
            },
            transaction
          }
        );
      }

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
            responseSnapshot: JSON.stringify(response || {})
          },
          transaction
        }
      );

      await appendEvent({
        taskId,
        runId: run?.run_id || null,
        eventType: 'TASK_COMPLETED',
        fromStatus: prevStatus,
        toStatus: 'completed',
        reason: 'sync_done',
        traceId: request?.traceId,
        requestId: request?.requestId,
        payload: { mode: 'sync' },
        transaction
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async function markFailed({ taskId, request, error }) {
    const transaction = await postgresqlSequelize.transaction();
    try {
      const task = await getTaskForUpdate(taskId, transaction);
      if (!task) {
        await transaction.rollback();
        return;
      }
      const run = await getLatestRunForUpdate(taskId, transaction);
      const prevStatus = String(task.status || 'queued');
      const errorSnapshot = {
        message: String(error?.message || error || 'unknown error'),
        at: nowIso()
      };

      if (run) {
        await postgresqlSequelize.query(
          `UPDATE agent_run
              SET status = 'failed',
                  error_snapshot = CAST(:errorSnapshot AS jsonb),
                  finished_at = NOW(),
                  updated_at = NOW()
            WHERE run_id = :runId`,
          {
            replacements: {
              runId: String(run.run_id || ''),
              errorSnapshot: JSON.stringify(errorSnapshot)
            },
            transaction
          }
        );
      }

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

      await appendEvent({
        taskId,
        runId: run?.run_id || null,
        eventType: 'TASK_FAILED',
        fromStatus: prevStatus,
        toStatus: 'failed',
        reason: 'execute_error',
        traceId: request?.traceId,
        requestId: request?.requestId,
        payload: errorSnapshot,
        transaction
      });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  async function syncFromQueueTask(taskId, queueTask) {
    if (!queueTask || !taskId) return;
    const nextStatus = mapQueueStateToTaskStatus(queueTask?.state);
    const transaction = await postgresqlSequelize.transaction();
    try {
      const task = await getTaskForUpdate(taskId, transaction);
      if (!task) {
        await transaction.rollback();
        return;
      }
      const run = await getLatestRunForUpdate(taskId, transaction);
      const prevStatus = String(task.status || '');

      if (prevStatus === nextStatus) {
        await postgresqlSequelize.query(
          `UPDATE agent_task SET updated_at = NOW() WHERE task_id = :taskId`,
          { replacements: { taskId: String(taskId || '') }, transaction }
        );
        await transaction.commit();
        return;
      }

      const responseSnapshot = nextStatus === 'completed' ? JSON.stringify(queueTask?.result || {}) : null;
      const errorSnapshot = nextStatus === 'failed'
        ? JSON.stringify({ message: String(queueTask?.failedReason || 'task failed') })
        : null;
      const finishedAt = (nextStatus === 'completed' || nextStatus === 'failed')
        ? toTimestamp(queueTask?.finishedOn || Date.now())
        : null;
      const startedAt = toTimestamp(queueTask?.processedOn || null);

      if (run) {
        await postgresqlSequelize.query(
          `UPDATE agent_run
              SET status = :status,
                  started_at = COALESCE(started_at, :startedAt),
                  finished_at = CASE WHEN :finishedAt IS NULL THEN finished_at ELSE :finishedAt END,
                  output_snapshot = CASE WHEN :responseSnapshot IS NULL THEN output_snapshot ELSE CAST(:responseSnapshot AS jsonb) END,
                  error_snapshot = CASE WHEN :errorSnapshot IS NULL THEN error_snapshot ELSE CAST(:errorSnapshot AS jsonb) END,
                  updated_at = NOW()
            WHERE run_id = :runId`,
          {
            replacements: {
              runId: String(run.run_id || ''),
              status: nextStatus,
              startedAt,
              finishedAt,
              responseSnapshot,
              errorSnapshot
            },
            transaction
          }
        );
      }

      await postgresqlSequelize.query(
        `UPDATE agent_task
            SET status = :status,
                response_snapshot = CASE WHEN :responseSnapshot IS NULL THEN response_snapshot ELSE CAST(:responseSnapshot AS jsonb) END,
                error_snapshot = CASE WHEN :errorSnapshot IS NULL THEN error_snapshot ELSE CAST(:errorSnapshot AS jsonb) END,
                updated_at = NOW()
          WHERE task_id = :taskId`,
        {
          replacements: {
            taskId: String(taskId || ''),
            status: nextStatus,
            responseSnapshot,
            errorSnapshot
          },
          transaction
        }
      );

      await appendEvent({
        taskId,
        runId: run?.run_id || null,
        eventType: 'TASK_STATUS_SYNC',
        fromStatus: prevStatus,
        toStatus: nextStatus,
        reason: 'poll_sync',
        payload: {
          attemptsMade: Number(queueTask?.attemptsMade || 0),
          processedOn: queueTask?.processedOn || null,
          finishedOn: queueTask?.finishedOn || null
        },
        transaction
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  return {
    ensureAccepted,
    markCompleted,
    markFailed,
    syncFromQueueTask
  };
}

module.exports = {
  createAgentTaskPersistenceStore
};
