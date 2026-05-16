const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAgentRequestFromDingtalkPayload
} = require('../src/agentization/adapters/dingtalk/buildAgentRequestFromDingtalk');
const { buildDingtalkUserVisibleText } = require('../src/agentization/adapters/dingtalk/dingtalkWebhookAdapter');

test('dingtalk richText is normalized into message.text and attachments', () => {
  const request = buildAgentRequestFromDingtalkPayload({
    msgId: 'msg-rich-1',
    msgtype: 'richText',
    senderStaffId: 'u-rich',
    conversationId: 'conv-rich-1',
    content: {
      richText: [
        { text: '请帮我看下故障' },
        { type: 'picture', downloadCode: 'img-code-1', picUrl: 'https://example.com/a.png' },
        { type: 'file', fileName: 'error.log', downloadCode: 'file-code-1' }
      ]
    }
  }, { traceId: 'trace-rich-1' });

  assert.equal(request.message.type, 'richText');
  assert.match(request.message.text, /故障/);
  assert.equal(request.message.attachments.length, 2);
  assert.equal(request.message.attachments[0].type, 'image');
  assert.equal(request.message.attachments[1].type, 'file');
});

test('dingtalk requestId is independent from platform message id', () => {
  const request = buildAgentRequestFromDingtalkPayload({
    msgId: 'msg-raw-1',
    msgtype: 'text',
    text: { content: 'hello' },
    senderStaffId: 'u-1',
    conversationId: 'conv-1'
  }, {
    traceId: 'trace-fixed',
    requestId: 'req-fixed'
  });

  assert.equal(request.requestId, 'req-fixed');
  assert.equal(request.message.id, 'msg-raw-1');
});

test('dingtalk adapter rejects payload without conversationId', () => {
  assert.throws(() => buildAgentRequestFromDingtalkPayload({
    msgId: 'msg-raw-2',
    msgtype: 'text',
    text: { content: 'hello' },
    senderStaffId: 'u-2'
  }), /conversationId is required/i);
});

test('dingtalk user-visible text prefers answer over intent stub', () => {
  assert.equal(
    buildDingtalkUserVisibleText({
      text: '故障码说明正文',
      instance: { instance_no: 2 },
      intent: { intent: 'error_code_lookup' },
      llm_raw: { intent_extraction: { x: 1 } }
    }),
    '故障码说明正文'
  );
  assert.match(
    buildDingtalkUserVisibleText({
      text: '',
      instance: { instance_no: 2 },
      intent: { intent: 'knowledge_qa' }
    }),
    /实例#2/
  );
});
