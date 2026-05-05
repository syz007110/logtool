const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildConversationMessageInput,
  detectContentMessageType
} = require('../src/agentization/session/conversationMessageMapper');

test('detectContentMessageType maps rich text to markdown', () => {
  const t = detectContentMessageType({
    explicitType: 'richText',
    content: 'hello',
    attachments: [],
    payload: {}
  });
  assert.equal(t, 'markdown');
});

test('detectContentMessageType maps text + attachments to mixed', () => {
  const t = detectContentMessageType({
    explicitType: 'text',
    content: 'hello',
    attachments: [{ type: 'file' }],
    payload: {}
  });
  assert.equal(t, 'mixed');
});

test('buildConversationMessageInput falls back unknown role to system', () => {
  const out = buildConversationMessageInput({
    instanceId: 1,
    messageId: 'msg-1',
    requestId: 'req-1',
    traceId: 'trace-1',
    role: 'intent',
    explicitMessageType: 'json',
    content: null,
    payload: { intent: 'find_case' },
    attachments: [],
    idempotencyKey: 'idem-1'
  });
  assert.equal(out.role, 'system');
  assert.equal(out.message_type, 'json');
  assert.equal(out.instance_id, 1);
});

test('buildConversationMessageInput falls back observation role to system', () => {
  const out = buildConversationMessageInput({
    instanceId: 1,
    messageId: 'msg-obs-1',
    requestId: 'req-obs-1',
    traceId: 'trace-obs-1',
    role: 'observation',
    explicitMessageType: 'json',
    payload: { summary: 'normalized tool result' },
    attachments: [],
    idempotencyKey: 'idem-obs-1'
  });

  assert.equal(out.role, 'system');
  assert.equal(out.message_type, 'json');
});
