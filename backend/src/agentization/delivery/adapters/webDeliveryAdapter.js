const websocketService = require('../../../services/websocketService');

function supports(channelType) {
  return String(channelType || '').trim().toLowerCase() === 'web';
}

async function sendFinalResult({ context, taskId, status, result, error }) {
  const userId = String(context?.userId || '').trim();
  if (!userId || !taskId) return null;
  await websocketService.pushAgentTaskStatus(taskId, status, userId, {
    traceId: String(context?.request?.traceId || ''),
    requestId: String(context?.request?.requestId || ''),
    conversationId: String(context?.conversationId || ''),
    result: status === 'completed' ? result : null,
    error: status === 'failed' ? { message: String(error?.message || error || 'unknown error') } : null
  });
  return { channel: 'websocket' };
}

async function sendFailure(input) {
  return sendFinalResult(input);
}

module.exports = {
  supports,
  sendFinalResult,
  sendFailure
};
