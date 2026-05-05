const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const { createDingtalkWebhookVerify } = require('../src/middlewares/dingtalkWebhookVerify');

function sign(secret, timestamp) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}\n${secret}`, 'utf8')
    .digest('base64');
}

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.payload = data;
      return this;
    }
  };
}

test('dingtalk webhook verify passes with valid signature', () => {
  const secret = 'test-secret';
  const ts = String(Date.now());
  const req = {
    query: {
      timestamp: ts,
      sign: sign(secret, ts)
    },
    headers: {}
  };
  const res = createRes();
  let called = false;
  const mw = createDingtalkWebhookVerify({
    env: { DINGTALK_BOT_VERIFY_ENABLED: 'true', DINGTALK_BOT_WEBHOOK_SECRET: secret }
  });
  mw(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
});

test('dingtalk webhook verify rejects invalid signature', () => {
  const req = { query: { timestamp: String(Date.now()), sign: 'bad-sign' }, headers: {} };
  const res = createRes();
  let called = false;
  const mw = createDingtalkWebhookVerify({
    env: { DINGTALK_BOT_VERIFY_ENABLED: 'true', DINGTALK_BOT_WEBHOOK_SECRET: 'test-secret' }
  });
  mw(req, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 401);
});

test('dingtalk webhook verify can be disabled', () => {
  const req = { query: {}, headers: {} };
  const res = createRes();
  let called = false;
  const mw = createDingtalkWebhookVerify({
    env: { DINGTALK_BOT_VERIFY_ENABLED: 'false' }
  });
  mw(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
});

