const websocketService = require('../../services/websocketService');
const { deliverDingtalkTextMessage } = require('./dingtalkOutboundService');
const { isDeferredChannelDelivery } = require('../taskGateway/agentTaskSnapshot');

function buildAssistantText(result, error) {
  if (error) {
    return `处理失败: ${String(error?.message || error)}`;
  }
  const text = String(result?.text || '').trim();
  if (text) return text;
  return '已收到消息';
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
  const text = buildAssistantText(result, error);
  try {
    const delivery = await deliverDingtalkTextMessage(request, text);
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
