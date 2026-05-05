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
 * @property {'user' | 'assistant' | 'tool' | 'system' | 'intent' | 'observation'} role
 * @property {'text' | 'markdown' | 'image' | 'file' | 'mixed' | 'json'} message_type
 * @property {string | undefined} content
 * @property {Record<string, unknown>} payload
 * @property {Record<string, unknown> | undefined} raw_payload
 * @property {Array<Record<string, unknown>>} attachments
 * @property {string} idempotency_key
 */

function normalizeRole(value, fallback = 'system') {
  const role = String(value || '').trim().toLowerCase();
  if (['user', 'assistant', 'tool', 'system', 'intent', 'observation'].includes(role)) return role;
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

function detectContentMessageType({ explicitType, content, attachments, payload }) {
  const t = String(explicitType || '').trim().toLowerCase();
  const hasText = String(content || '').trim().length > 0;
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  const hasPayload = payload && typeof payload === 'object' && Object.keys(payload).length > 0;

  if (t === 'markdown') return hasAttachments ? 'mixed' : 'markdown';
  if (t === 'text') return hasAttachments ? 'mixed' : 'text';
  if (t === 'image') return hasText ? 'mixed' : 'image';
  if (t === 'file' || t === 'audio') return hasText ? 'mixed' : 'file';
  if (t === 'json') return 'json';
  if (t === 'richtext' || t === 'rich_text') return hasAttachments ? 'mixed' : 'markdown';
  if (t === 'mixed') return 'mixed';

  if (hasAttachments && hasText) return 'mixed';
  if (hasAttachments) {
    const uniqueTypes = new Set(attachments.map((a) => normalizeAttachmentType(a?.type)));
    if (uniqueTypes.size === 1 && uniqueTypes.has('image')) return 'image';
    if (uniqueTypes.size === 1 && uniqueTypes.has('file')) return 'file';
    return 'mixed';
  }
  if (hasText) return 'text';
  if (hasPayload) return 'json';
  return 'text';
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
  return {
    instance_id: Number(instanceId),
    message_id: String(messageId || '').trim(),
    request_id: requestId ? String(requestId).trim() : undefined,
    trace_id: traceId ? String(traceId).trim() : undefined,
    task_id: taskId ? String(taskId).trim() : undefined,
    role: normalizeRole(role),
    message_type: detectContentMessageType({
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
  buildConversationMessageInput,
  detectContentMessageType,
  normalizeRole
};
