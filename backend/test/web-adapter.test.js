const test = require('node:test');
const assert = require('node:assert/strict');

const { parseInbound } = require('../src/agentization/adapters/web/webAdapter');

test('web adapter rejects request when channel is missing', () => {
  const req = { headers: {}, body: { user: { id: 'u1' }, message: { text: 'hello' } } };
  assert.throws(() => parseInbound(req), /channel is required/i);
});

test('web adapter rejects request when conversationId is missing', () => {
  const req = {
    headers: {},
    body: {
      user: { id: 'u1' },
      channel: { type: 'web', conversationType: 'single' },
      message: { text: 'hello' }
    }
  };
  assert.throws(() => parseInbound(req), /channel\.conversationId is required/i);
});

test('web adapter reuses provided conversationId', () => {
  const req = {
    headers: {},
    body: {
      user: { id: 'u1' },
      channel: { type: 'web', conversationType: 'single', conversationId: 'web_conv_fixed_1' },
      message: { text: 'hello' }
    }
  };
  const r = parseInbound(req);
  assert.equal(r.channel.conversationId, 'web_conv_fixed_1');
});
