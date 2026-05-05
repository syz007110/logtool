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
  async function saveRaw({ conversationMessageInput, transaction }) {
    const input = conversationMessageInput && typeof conversationMessageInput === 'object'
      ? conversationMessageInput
      : {};

    const [rows] = await postgresqlSequelize.query(
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
