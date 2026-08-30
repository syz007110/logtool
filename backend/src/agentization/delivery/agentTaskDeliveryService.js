const { deliverFinalResult, deliverFailure } = require('./finalResultDeliveryGateway');
const webDeliveryAdapter = require('./adapters/webDeliveryAdapter');
const dingtalkDeliveryAdapter = require('./adapters/dingtalkDeliveryAdapter');

async function deliverWebAgentTaskStatus({ request, taskId, status, result, error }) {
  return webDeliveryAdapter.sendFinalResult({
    context: {
      request,
      userId: String(request?.user?.id || '').trim(),
      conversationId: String(request?.channel?.conversationId || '').trim()
    },
    taskId,
    status,
    result,
    error
  });
}

async function deliverDingtalkDeferredResult({ request, taskRow, result, error }) {
  return dingtalkDeliveryAdapter.sendFailure({
    context: {
      request,
      deferredDelivery: true,
      taskRow
    },
    taskId: String(taskRow?.task_id || '').trim(),
    result,
    error
  });
}

async function deliverAgentTaskOutcome({ request, taskId, taskRow, status, result, error }) {
  if (String(status || '').trim().toLowerCase() === 'failed') {
    await deliverFailure({ request, taskId, taskRow, error, result: result || null });
    return;
  }
  await deliverFinalResult({ request, taskId, taskRow, status, result, error });
}

module.exports = {
  buildAssistantText: dingtalkDeliveryAdapter.buildAssistantText,
  deliverAgentTaskOutcome,
  deliverDingtalkDeferredResult,
  deliverWebAgentTaskStatus,
  normalizeSystemMessages: dingtalkDeliveryAdapter.normalizeSystemMessages
};
