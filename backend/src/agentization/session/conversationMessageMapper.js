const {
  MESSAGE_TYPES,
  normalizeInboundMessageType,
  normalizeStoredMessageType,
  resolvePersistMessageType
} = require('./conversationMessageTypes');

function asPlainObject(input) {
  return input && typeof input === 'object' && !Array.isArray(input) ? input : {};
}

/**
 * @typedef {Object} ConversationMessageInput
 * @property {number} instance_id
 * @property {string} message_id
 * @property {string | undefined} request_id
 * @property {string | undefined} trace_id
 * @property {string | undefined} task_id
 * @property {'user' | 'assistant' | 'tool' | 'system'} role
 * @property {'text' | 'attachment' | 'orchestrator' | 'plan' | 'tool' | 'clarify' | 'error'} message_type
 * @property {string | undefined} content
 * @property {Record<string, unknown>} payload
 * @property {Record<string, unknown> | undefined} raw_payload
 * @property {Array<Record<string, unknown>>} attachments
 * @property {string} idempotency_key
 */

function normalizeRole(value, fallback = 'system') {
  const role = String(value || '').trim().toLowerCase();
  if (['user', 'assistant', 'tool', 'system'].includes(role)) return role;
  return fallback;
}

function normalizeAttachmentType(value) {
  const t = String(value || '').trim().toLowerCase();
  if (t === 'image' || t === 'file' || t === 'audio') return t;
  return 'file';
}

function normalizeAttachments(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      ...asPlainObject(item),
      type: normalizeAttachmentType(item.type)
    }));
}

function detectContentMessageType({ role, explicitType, content, attachments, payload }) {
  return resolvePersistMessageType({
    role,
    explicitType: normalizeStoredMessageType(explicitType),
    content,
    attachments,
    payload
  });
}

/**
 * @returns {ConversationMessageInput}
 */
function buildConversationMessageInput({
  instanceId,
  messageId,
  requestId,
  traceId,
  taskId,
  role,
  explicitMessageType,
  content,
  payload,
  rawPayload,
  attachments,
  idempotencyKey
}) {
  const normalizedPayload = asPlainObject(payload);
  const normalizedRawPayload = asPlainObject(rawPayload);
  const normalizedAttachments = normalizeAttachments(attachments);
  const normalizedRole = normalizeRole(role);
  return {
    instance_id: Number(instanceId),
    message_id: String(messageId || '').trim(),
    request_id: requestId ? String(requestId).trim() : undefined,
    trace_id: traceId ? String(traceId).trim() : undefined,
    task_id: taskId ? String(taskId).trim() : undefined,
    role: normalizedRole,
    message_type: detectContentMessageType({
      role: normalizedRole,
      explicitType: explicitMessageType,
      content,
      attachments: normalizedAttachments,
      payload: normalizedPayload
    }),
    content: content == null ? undefined : String(content),
    payload: normalizedPayload,
    raw_payload: Object.keys(normalizedRawPayload).length > 0 ? normalizedRawPayload : undefined,
    attachments: normalizedAttachments,
    idempotency_key: String(idempotencyKey || '').trim()
  };
}

module.exports = {
  MESSAGE_TYPES,
  buildConversationMessageInput,
  detectContentMessageType,
  normalizeInboundMessageType,
  normalizeRole,
  normalizeStoredMessageType
};
