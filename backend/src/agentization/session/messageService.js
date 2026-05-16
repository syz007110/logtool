const { postgresqlSequelize } = require('../../config/postgresql');
const { buildConversationMessageInput } = require('./conversationMessageMapper');

function normalizeMessageId(request) {
  const messageId = String(request?.message?.id || '').trim();
  if (messageId) return messageId;
  return `msg_${Date.now()}`;
}

function normalizeRequestId(request) {
  const text = String(request?.requestId || '').trim();
  return text || undefined;
}

function normalizeTraceId(request) {
  const text = String(request?.traceId || '').trim();
  return text || undefined;
}

function normalizeUserPayload(request) {
  return {
    id: request?.message?.id,
    type: request?.message?.type,
    text: request?.message?.text || '',
    contentRaw: request?.message?.contentRaw ?? null,
    attachments: Array.isArray(request?.message?.attachments) ? request.message.attachments : [],
    sentAt: Number(request?.message?.sentAt || Date.now())
  };
}

function createMessageService() {
  async function logLockDiagnostics({ idempotencyKey, instanceId, messageId }) {
    try {
      const [rows] = await postgresqlSequelize.query(
        `WITH waiting AS (
           SELECT
             a.pid,
             a.usename,
             a.application_name,
             a.state,
             a.wait_event_type,
             a.wait_event,
             a.query_start,
             a.xact_start,
             left(a.query, 500) AS query_text,
             pg_blocking_pids(a.pid) AS blockers
           FROM pg_stat_activity a
           WHERE a.datname = current_database()
             AND a.wait_event_type = 'Lock'
         ),
         expanded AS (
           SELECT
             w.*,
             unnest(CASE WHEN cardinality(w.blockers) > 0 THEN w.blockers ELSE ARRAY[NULL::int] END) AS blocker_pid
           FROM waiting w
         )
         SELECT
           e.pid AS waiting_pid,
           e.usename AS waiting_user,
           e.application_name AS waiting_app,
           e.state AS waiting_state,
           e.wait_event_type AS waiting_wait_type,
           e.wait_event AS waiting_wait_event,
           e.query_start AS waiting_query_start,
           e.xact_start AS waiting_xact_start,
           e.query_text AS waiting_query,
           e.blocker_pid,
           b.usename AS blocker_user,
           b.application_name AS blocker_app,
           b.state AS blocker_state,
           b.wait_event_type AS blocker_wait_type,
           b.wait_event AS blocker_wait_event,
           b.query_start AS blocker_query_start,
           b.xact_start AS blocker_xact_start,
           left(b.query, 500) AS blocker_query
         FROM expanded e
         LEFT JOIN pg_stat_activity b ON b.pid = e.blocker_pid
         ORDER BY e.query_start ASC`
      );
      console.error('[message-save-lock-diagnostics]', {
        idempotencyKey: String(idempotencyKey || ''),
        instanceId: Number(instanceId || 0),
        messageId: String(messageId || ''),
        blockers: Array.isArray(rows) ? rows : []
      });
    } catch (diagError) {
      console.error('[message-save-lock-diagnostics-failed]', {
        message: String(diagError?.message || diagError)
      });
    }
  }

  async function saveRaw({ conversationMessageInput, transaction }) {
    const input = conversationMessageInput && typeof conversationMessageInput === 'object'
      ? conversationMessageInput
      : {};

    let rows = [];
    try {
      const [insertedRows] = await postgresqlSequelize.query(
        `INSERT INTO conversation_messages (
           instance_id, message_id, request_id, trace_id, task_id,
           role, message_type, content, payload, raw_payload, attachments, idempotency_key, created_at
         ) VALUES (
           :instanceId, :messageId, :requestId, :traceId, :taskId,
           :role, :messageType, :content,
           CAST(:payload AS jsonb),
           CAST(:rawPayload AS jsonb),
           CAST(:attachments AS jsonb),
           :idempotencyKey, NOW()
         )
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING *`,
        {
          replacements: {
            instanceId: Number(input.instance_id),
            messageId: String(input.message_id || ''),
            requestId: String(input.request_id || '').trim() || null,
            traceId: String(input.trace_id || '').trim() || null,
            taskId: String(input.task_id || '').trim() || null,
            role: String(input.role || 'system'),
            messageType: String(input.message_type || 'text'),
            content: input.content == null ? null : String(input.content),
            payload: JSON.stringify(input.payload || {}),
            rawPayload: JSON.stringify(input.raw_payload || {}),
            attachments: JSON.stringify(Array.isArray(input.attachments) ? input.attachments : []),
            idempotencyKey: String(input.idempotency_key || '')
          },
          transaction
        }
      );
      rows = insertedRows || [];
    } catch (error) {
      const msg = String(error?.message || '').toLowerCase();
      if (msg.includes('lock timeout') || msg.includes('could not obtain lock')) {
        await logLockDiagnostics({
          idempotencyKey: String(input.idempotency_key || ''),
          instanceId: Number(input.instance_id || 0),
          messageId: String(input.message_id || '')
        });
      }
      throw error;
    }

    if (rows.length > 0) return { row: rows[0], inserted: true };

    const [existing] = await postgresqlSequelize.query(
      `SELECT *
         FROM conversation_messages
        WHERE idempotency_key = :idempotencyKey
        LIMIT 1`,
      {
        replacements: { idempotencyKey: String(input.idempotency_key || '') },
        transaction
      }
    );
    return { row: existing[0] || null, inserted: false };
  }

  async function saveUser({ instanceId, request, idempotencyKey, transaction }) {
    const messageInput = buildConversationMessageInput({
      instanceId,
      messageId: normalizeMessageId(request),
      requestId: normalizeRequestId(request),
      traceId: normalizeTraceId(request),
      taskId: undefined,
      role: 'user',
      explicitMessageType: request?.message?.type || 'text',
      content: request?.message?.text || '',
      payload: normalizeUserPayload(request),
      rawPayload: request?.rawPayload && typeof request.rawPayload === 'object' ? request.rawPayload : undefined,
      attachments: Array.isArray(request?.message?.attachments) ? request.message.attachments : [],
      idempotencyKey
    });
    return saveRaw({
      conversationMessageInput: messageInput,
      transaction
    });
  }

  return {
    saveRaw,
    saveUser
  };
}

module.exports = {
  createMessageService
};
