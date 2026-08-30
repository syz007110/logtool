function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function projectQueueResultToMessageDelta(queueResult) {
  const result = asObject(queueResult);
  const text = String(result.text || '').trim();
  const attachments = Array.isArray(result.attachments) ? result.attachments : [];
  const toolTraces = Array.isArray(result.toolTraces) ? result.toolTraces : [];
  const systemMessages = Array.isArray(result.system_messages)
    ? result.system_messages
      .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
      .map((item) => ({
        kind: String(item.kind || '').trim() || 'system',
        title: String(item.title || '').trim() || '系统提示',
        text: String(item.text || '').trim(),
        presentation: String(item.presentation || '').trim() || 'action_card'
      }))
      .filter((item) => item.text)
    : [];
  const assistantMode = String(result.assistant_mode || '').trim() || 'llm_response';
  const session = result.session && typeof result.session === 'object' ? {
    conversationId: String(result.session.conversationId || '').trim() || null,
    instanceId: Number(result.session.instanceId || 0) || null
  } : null;

  const messages = [];
  if (text || attachments.length > 0 || systemMessages.length > 0) {
    messages.push({
      role: 'assistant',
      messageType: attachments.length > 0 ? 'attachment' : 'text',
      content: text,
      attachments,
      toolTraces,
      systemMessages,
      assistantMode,
      createdAt: new Date().toISOString()
    });
  }

  if (!messages.length) return null;
  return {
    session,
    messages
  };
}

module.exports = {
  projectQueueResultToMessageDelta
};
