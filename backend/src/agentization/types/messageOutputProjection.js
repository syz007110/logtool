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

function resolveInstanceId(queueResult) {
  const direct = Number(queueResult?.session?.instanceId);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const instance = asObject(queueResult?.instance);
  const instanceId = Number(instance.id || instance.instanceId || instance.instance_id);
  if (Number.isFinite(instanceId) && instanceId > 0) return instanceId;

  return null;
}

function projectQueueResultToMessageOutput(queueResult) {
  if (!queueResult || typeof queueResult !== 'object') {
    return buildMessageOutput({ attachments: [] }, { strict: false });
  }

  const conversationId = resolveConversationId(queueResult);
  const instanceId = resolveInstanceId(queueResult);
  const out = buildMessageOutput({
    text: queueResult.text,
    attachments: queueResult.attachments
  }, {
    strict: false,
    session: (conversationId || instanceId != null)
      ? {
          conversationId: conversationId || undefined,
          instanceId: instanceId != null ? instanceId : undefined
        }
      : undefined
  });

  if (queueResult.instance && typeof queueResult.instance === 'object' && !Array.isArray(queueResult.instance)) {
    out.instance = { ...queueResult.instance };
  }
  if (queueResult.assistant_mode != null) {
    out.assistantMode = String(queueResult.assistant_mode || '').trim() || 'llm_response';
  }
  if (queueResult.delivery_hint != null) {
    out.deliveryHint = String(queueResult.delivery_hint || '').trim() || null;
  }
  if (Array.isArray(queueResult.system_messages)) {
    out.systemMessages = queueResult.system_messages
      .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
      .map((item) => ({
        kind: String(item.kind || '').trim() || 'system',
        title: String(item.title || '').trim() || '系统提示',
        text: String(item.text || '').trim(),
        presentation: String(item.presentation || '').trim() || 'action_card'
      }))
      .filter((item) => item.text);
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
