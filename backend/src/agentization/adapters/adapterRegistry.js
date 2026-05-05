const webAdapter = require('./web/webAdapter');
const dingtalkWebhookAdapter = require('./dingtalk/dingtalkWebhookAdapter');

const registry = new Map([
  ['web', webAdapter],
  ['dingtalk_webhook', dingtalkWebhookAdapter]
]);

function getAdapter(key) {
  const normalized = String(key || '').trim().toLowerCase();
  const adapter = registry.get(normalized);
  if (!adapter) {
    throw new Error(`adapter not found: ${normalized}`);
  }
  return adapter;
}

module.exports = {
  getAdapter
};

