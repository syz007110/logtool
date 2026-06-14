const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildMessageInputFromDingtalkPayload
} = require('../src/agentization/adapters/dingtalk/buildMessageInputFromDingtalk');

test('dingtalk input maps to text+attachment when attachments exist', () => {
  const request = buildMessageInputFromDingtalkPayload({
    msgId: 'msg-1',
    senderStaffId: 'staff-1',
    conversationId: 'conv-1',
    msgtype: 'image',
    text: { content: 'with image' },
    attachments: [{ type: 'image', url: 'https://example.com/a.png' }]
  }, {
    traceId: 'trace-1',
    requestId: 'req-1'
  });

  assert.equal(request.message.type, 'text+attachment');
  assert.equal(request.message.attachments.length, 1);
});

test('dingtalk input maps to text when attachments are absent regardless of msgtype', () => {
  const request = buildMessageInputFromDingtalkPayload({
    msgId: 'msg-2',
    senderStaffId: 'staff-2',
    conversationId: 'conv-2',
    msgtype: 'image',
    text: { content: 'plain text only' }
  }, {
    traceId: 'trace-2',
    requestId: 'req-2'
  });

  assert.equal(request.message.type, 'text');
  assert.equal(request.message.text, 'plain text only');
  assert.equal(request.message.attachments.length, 0);
});
