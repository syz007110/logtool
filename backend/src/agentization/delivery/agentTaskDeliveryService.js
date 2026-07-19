const websocketService = require('../../services/websocketService');
const { buildSystemMarkdownText, deliverDingtalkTextMessage } = require('./dingtalkOutboundService');
const { isDeferredChannelDelivery } = require('../taskGateway/agentTaskSnapshot');

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

async function deliverWebAgentTaskStatus({ request, taskId, status, result, error }) {
  const userId = String(request?.user?.id || '').trim();
  if (!userId || !taskId) return;
  await websocketService.pushAgentTaskStatus(taskId, status, userId, {
    traceId: String(request?.traceId || ''),
    requestId: String(request?.requestId || ''),
    conversationId: String(request?.channel?.conversationId || ''),
    result: status === 'completed' ? result : null,
    error: status === 'failed' ? { message: String(error?.message || error || 'unknown error') } : null
  });
}

async function deliverDingtalkDeferredResult({ request, taskRow, result, error }) {
  if (!isDeferredChannelDelivery(taskRow)) return null;
  const systemMessages = normalizeSystemMessages(result);
  const text = buildAssistantText(result, error);
  try {
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
      taskId: String(taskRow?.task_id || ''),
      channel: delivery?.channel || 'unknown',
      traceId: String(request?.traceId || '')
    });
    return delivery;
  } catch (deliveryError) {
    console.warn('[agent-delivery] dingtalk deferred reply failed:', deliveryError?.message || deliveryError);
    return null;
  }
}

async function deliverAgentTaskOutcome({ request, taskId, taskRow, status, result, error }) {
  if (!request || typeof request !== 'object') return;

  const channelType = String(request?.channel?.type || '').trim().toLowerCase();
  if (channelType === 'web') {
    await deliverWebAgentTaskStatus({ request, taskId, status, result, error });
    return;
  }
  if (channelType === 'dingtalk') {
    await deliverDingtalkDeferredResult({ request, taskRow, result, error });
  }
}

module.exports = {
  buildAssistantText,
  deliverAgentTaskOutcome,
  deliverDingtalkDeferredResult,
  deliverWebAgentTaskStatus
};
