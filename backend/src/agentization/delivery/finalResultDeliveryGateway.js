const { resolveChannelDeliveryContext } = require('./channelSnapshotResolver');
const webDeliveryAdapter = require('./adapters/webDeliveryAdapter');
const dingtalkDeliveryAdapter = require('./adapters/dingtalkDeliveryAdapter');

const ADAPTERS = Object.freeze([
  webDeliveryAdapter,
  dingtalkDeliveryAdapter
]);

function resolveAdapter(channelType) {
  return ADAPTERS.find((adapter) => typeof adapter.supports === 'function' && adapter.supports(channelType)) || null;
}

async function deliverFinalResult({ request, taskId, taskRow, status = 'completed', result = null, error = null }) {
  const context = resolveChannelDeliveryContext({ request, taskRow });
  const adapter = resolveAdapter(context.channelType);
  if (!adapter || typeof adapter.sendFinalResult !== 'function') return null;
  return adapter.sendFinalResult({
    context,
    taskId,
    taskRow,
    status,
    result,
    error
  });
}

async function deliverFailure({ request, taskId, taskRow, error, result = null }) {
  const context = resolveChannelDeliveryContext({ request, taskRow });
  const adapter = resolveAdapter(context.channelType);
  if (!adapter) return null;
  if (typeof adapter.sendFailure === 'function') {
    return adapter.sendFailure({
      context,
      taskId,
      taskRow,
      status: 'failed',
      result,
      error
    });
  }
  if (typeof adapter.sendFinalResult === 'function') {
    return adapter.sendFinalResult({
      context,
      taskId,
      taskRow,
      status: 'failed',
      result,
      error
    });
  }
  return null;
}

module.exports = {
  deliverFinalResult,
  deliverFailure,
  resolveAdapter
};
