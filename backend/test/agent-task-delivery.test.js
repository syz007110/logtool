const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isReplyWebhookValid,
  buildTextMessageBody
} = require('../src/agentization/delivery/dingtalkOutboundService');
const { isDeferredChannelDelivery } = require('../src/agentization/taskGateway/agentTaskSnapshot');

test('isReplyWebhookValid respects replyWebhookExpiredAt', () => {
  const future = Date.now() + 60_000;
  const past = Date.now() - 60_000;
  assert.equal(isReplyWebhookValid({
    replyWebhook: 'https://example.com/hook',
    replyWebhookExpiredAt: future
  }), true);
  assert.equal(isReplyWebhookValid({
    replyWebhook: 'https://example.com/hook',
    replyWebhookExpiredAt: past
  }), false);
  assert.equal(isReplyWebhookValid({ replyWebhook: '' }), false);
});

test('isDeferredChannelDelivery reads request_snapshot.delivery.deferred', () => {
  assert.equal(isDeferredChannelDelivery({
    request_snapshot: { delivery: { deferred: true, reason: 'sync_timeout' } }
  }), true);
  assert.equal(isDeferredChannelDelivery({
    request_snapshot: { delivery: { deferred: false } }
  }), false);
});

test('buildTextMessageBody wraps plain text', () => {
  const body = buildTextMessageBody('回复内容');
  assert.equal(body.msgtype, 'text');
  assert.equal(body.text.content, '回复内容');
});
