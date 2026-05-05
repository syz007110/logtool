const { executeViaAdapter } = require('./adapterGatewayController');

async function dingtalkBotWebhook(req, res) {
  return executeViaAdapter('dingtalk_webhook', 'dingtalk-webhook', req, res);
}

module.exports = {
  dingtalkBotWebhook
};
