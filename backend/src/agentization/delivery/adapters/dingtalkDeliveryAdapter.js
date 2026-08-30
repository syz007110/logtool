const { buildSystemMarkdownText, deliverDingtalkTextMessage } = require('../dingtalkOutboundService');

function supports(channelType) {
  return String(channelType || '').trim().toLowerCase() === 'dingtalk';
}

function buildAssistantText(result, error) {
  if (error) {
    return `处理失败: ${String(error?.message || error)}`;
  }
  return String(result?.text || '').trim() || '已收到消息';
}

function normalizeSystemMessages(result) {
  if (!Array.isArray(result?.systemMessages)) return [];
  return result.systemMessages
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      title: String(item.title || '').trim() || '系统提示',
      text: String(item.text || '').trim(),
      presentation: String(item.presentation || '').trim().toLowerCase() || 'action_card'
    }))
    .filter((item) => item.text);
}

async function sendFinalResult({ context, taskId, result, error }) {
  if (context?.deferredDelivery !== true) return null;

  const request = context?.request && typeof context.request === 'object' ? context.request : null;
  if (!request) return null;

  const systemMessages = normalizeSystemMessages(result);
  const text = buildAssistantText(result, error);
  let delivery = null;

  for (const message of systemMessages) {
    delivery = await deliverDingtalkTextMessage(request, buildSystemMarkdownText(message.text, message.title), {
      messageType: 'markdown',
      title: message.title
    });
  }

  if (String(error?.code || '').trim().toUpperCase() === 'INSTANCE_INACTIVE') {
    delivery = await deliverDingtalkTextMessage(request, buildSystemMarkdownText(String(error?.message || error), '会话状态变更'), {
      messageType: 'markdown',
      title: '会话状态变更'
    });
  } else if (!(systemMessages.length > 0 && String(result?.assistantMode || '').trim().toLowerCase() === 'direct_response')) {
    delivery = await deliverDingtalkTextMessage(request, text, {});
  }

  console.log('[agent-delivery] dingtalk deferred reply sent', {
    taskId: String(taskId || context?.taskRow?.task_id || ''),
    channel: delivery?.channel || 'unknown',
    traceId: String(request?.traceId || '')
  });
  return delivery;
}

async function sendFailure(input) {
  try {
    return await sendFinalResult(input);
  } catch (deliveryError) {
    console.warn('[agent-delivery] dingtalk deferred reply failed:', deliveryError?.message || deliveryError);
    return null;
  }
}

module.exports = {
  supports,
  buildAssistantText,
  normalizeSystemMessages,
  sendFinalResult,
  sendFailure
};
