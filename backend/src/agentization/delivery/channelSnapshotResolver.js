const { parseRequestSnapshot, isDeferredChannelDelivery } = require('../taskGateway/agentTaskSnapshot');

function normalizeText(value) {
  return String(value || '').trim();
}

function asObject(input) {
  return input && typeof input === 'object' && !Array.isArray(input) ? input : {};
}

function resolveChannelDeliveryContext({ request = null, taskRow = null } = {}) {
  const snapshot = taskRow ? parseRequestSnapshot(taskRow) : {};
  const requestSource = request && typeof request === 'object' ? request : snapshot;
  const channel = asObject(requestSource?.channel);
  const user = asObject(requestSource?.user);

  return {
    request: requestSource,
    requestSnapshot: snapshot,
    channelType: normalizeText(channel.type).toLowerCase() || 'web',
    conversationId: normalizeText(channel.conversationId) || null,
    threadId: normalizeText(channel.threadId) || null,
    replyWebhook: normalizeText(channel.replyWebhook) || null,
    replyWebhookExpiredAt: Number(channel.replyWebhookExpiredAt || 0) || null,
    robotCode: normalizeText(channel.robotCode) || null,
    conversationType: normalizeText(channel.conversationType).toLowerCase() || 'single',
    platformUserId: normalizeText(user.platformUserId || user.id) || null,
    userId: normalizeText(user.id) || null,
    deferredDelivery: taskRow ? isDeferredChannelDelivery(taskRow) : false,
    taskRow
  };
}

module.exports = {
  resolveChannelDeliveryContext
};
