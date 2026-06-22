const MESSAGE_TYPES = Object.freeze({
  TEXT: 'text',
  ATTACHMENT: 'attachment',
  INTENT: 'intent',
  PLAN: 'plan',
  TOOL: 'tool',
  CLARIFY: 'clarify',
  ERROR: 'error'
});

const PIPELINE_MESSAGE_TYPES = Object.freeze([
  MESSAGE_TYPES.INTENT,
  MESSAGE_TYPES.PLAN,
  MESSAGE_TYPES.TOOL,
  MESSAGE_TYPES.CLARIFY,
  MESSAGE_TYPES.ERROR
]);

const DIALOGUE_MESSAGE_TYPES = Object.freeze([
  MESSAGE_TYPES.TEXT,
  MESSAGE_TYPES.ATTACHMENT
]);

const LEGACY_MESSAGE_TYPE_ALIASES = Object.freeze({
  intent_result: MESSAGE_TYPES.INTENT,
  tool_result: MESSAGE_TYPES.TOOL,
  clarification: MESSAGE_TYPES.CLARIFY,
  mixed: MESSAGE_TYPES.ATTACHMENT,
  markdown: MESSAGE_TYPES.TEXT,
  image: MESSAGE_TYPES.ATTACHMENT,
  file: MESSAGE_TYPES.ATTACHMENT,
  json: MESSAGE_TYPES.PLAN
});

const ALLOWED_MESSAGE_TYPES = Object.freeze([
  ...DIALOGUE_MESSAGE_TYPES,
  ...PIPELINE_MESSAGE_TYPES
]);

function hasAttachments(attachments) {
  return Array.isArray(attachments) && attachments.length > 0;
}

function normalizeStoredMessageType(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return MESSAGE_TYPES.TEXT;
  if (ALLOWED_MESSAGE_TYPES.includes(text)) return text;
  return LEGACY_MESSAGE_TYPE_ALIASES[text] || text;
}

function isIntentMessageType(messageType) {
  return normalizeStoredMessageType(messageType) === MESSAGE_TYPES.INTENT;
}

function isPipelineMessageType(messageType) {
  return PIPELINE_MESSAGE_TYPES.includes(normalizeStoredMessageType(messageType));
}

function resolveDialogueMessageType({ content, attachments }) {
  if (hasAttachments(attachments)) return MESSAGE_TYPES.ATTACHMENT;
  return MESSAGE_TYPES.TEXT;
}

function normalizeInboundMessageType(inputType, attachments) {
  const explicit = String(inputType || '').trim().toLowerCase();
  if (explicit === 'attachment' || explicit === 'text+attachment' || explicit === 'text_with_attachment') {
    return MESSAGE_TYPES.ATTACHMENT;
  }
  if (hasAttachments(attachments)) return MESSAGE_TYPES.ATTACHMENT;
  return MESSAGE_TYPES.TEXT;
}

function resolvePersistMessageType({
  role,
  explicitType,
  content,
  attachments,
  payload
}) {
  const explicit = normalizeStoredMessageType(explicitType);
  if (PIPELINE_MESSAGE_TYPES.includes(explicit)) return explicit;

  const roleNorm = String(role || '').trim().toLowerCase();
  if (roleNorm === 'user' || roleNorm === 'assistant') {
    if (explicit === MESSAGE_TYPES.CLARIFY) return MESSAGE_TYPES.CLARIFY;
    return resolveDialogueMessageType({ content, attachments });
  }

  const hasPayload = payload && typeof payload === 'object' && Object.keys(payload).length > 0;
  if (hasPayload) return MESSAGE_TYPES.PLAN;
  return MESSAGE_TYPES.TEXT;
}

module.exports = {
  MESSAGE_TYPES,
  PIPELINE_MESSAGE_TYPES,
  DIALOGUE_MESSAGE_TYPES,
  ALLOWED_MESSAGE_TYPES,
  LEGACY_MESSAGE_TYPE_ALIASES,
  normalizeStoredMessageType,
  normalizeInboundMessageType,
  resolveDialogueMessageType,
  resolvePersistMessageType,
  isIntentMessageType,
  isPipelineMessageType
};
