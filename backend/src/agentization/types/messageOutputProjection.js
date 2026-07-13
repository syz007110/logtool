const { buildMessageOutput } = require('./contracts');

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function resolveConversationId(queueResult) {
  const directSessionId = String(queueResult?.session?.conversationId || '').trim();
  if (directSessionId) return directSessionId;

  const container = asObject(queueResult?.container);
  const containerId = String(container.conversationId || container.conversation_id || '').trim();
  if (containerId) return containerId;

  return '';
}

function projectQueueResultToMessageOutput(queueResult) {
  if (!queueResult || typeof queueResult !== 'object') {
    return buildMessageOutput({ attachments: [] }, { strict: false });
  }

  const conversationId = resolveConversationId(queueResult);
  const out = buildMessageOutput({
    text: queueResult.text,
    attachments: queueResult.attachments
  }, {
    strict: false,
    session: conversationId ? { conversationId } : undefined
  });

  if (queueResult.instance && typeof queueResult.instance === 'object' && !Array.isArray(queueResult.instance)) {
    out.instance = { ...queueResult.instance };
  }
  if (queueResult.policy && typeof queueResult.policy === 'object' && !Array.isArray(queueResult.policy)) {
    out.policy = { ...queueResult.policy };
  }
  if (Array.isArray(queueResult.toolTraces)) {
    out.toolTraces = queueResult.toolTraces;
  }

  return out;
}

module.exports = {
  projectQueueResultToMessageOutput
};
