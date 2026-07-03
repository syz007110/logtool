const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildMessageInput,
  buildMessageOutput
} = require('../src/agentization/types/contracts');

test('buildMessageInput builds request with required fields', () => {
  const request = buildMessageInput({
    traceId: 'trace-1',
    requestId: 'req-1',
    user: { id: 'u1' },
    channel: { type: 'dingtalk', conversationId: 'conv-1', conversationType: 'single' },
    message: {
      externalMessageId: 'msg-1',
      type: 'text',
      text: 'search alarm',
      sentAt: 1710000000000
    },
    context: { source: 'bot' }
  });

  assert.equal(request.traceId, 'trace-1');
  assert.equal(request.requestId, 'req-1');
  assert.equal(request.user.id, 'u1');
  assert.equal(request.channel.type, 'dingtalk');
  assert.equal(request.channel.conversationId, 'conv-1');
  assert.equal(request.channel.conversationType, 'single');
  assert.equal(request.message.externalMessageId, 'msg-1');
  assert.equal(request.message.type, 'text');
  assert.equal(request.message.sentAt, 1710000000000);
  assert.equal(request.message.text, 'search alarm');
  assert.equal(request.text, undefined);
  assert.equal(request.attachments, undefined);
  assert.deepEqual(request.context, {});
});

test('buildMessageInput ignores inbound context and keeps it empty', () => {
  const request = buildMessageInput({
    traceId: 'trace-empty-ctx',
    requestId: 'req-empty-ctx',
    user: { id: 'u-empty' },
    channel: { type: 'web', conversationType: 'single', conversationId: 'conv-empty' },
    message: {
      externalMessageId: 'msg-empty',
      type: 'text',
      text: 'hello',
      sentAt: Date.now()
    },
    context: {
      source: 'should-not-appear',
      preferAsync: true,
      userPermissions: ['error_code:read']
    }
  });

  assert.deepEqual(request.context, {});
});

test('buildMessageInput throws when traceId is missing', () => {
  assert.throws(() => {
    buildMessageInput({
      user: { id: 'u1' },
      channel: { type: 'dingtalk' },
      text: 'x'
    });
  }, /traceId/i);
});

test('buildMessageInput throws when requestId is missing', () => {
  assert.throws(() => {
    buildMessageInput({
      traceId: 'trace-2',
      user: { id: 'u2' },
      channel: { type: 'api', conversationId: 'api-conv', conversationType: 'single' },
      message: {
        externalMessageId: 'msg-2',
        type: 'text',
        text: 'hi',
        sentAt: 1710000000001
      }
    });
  }, /requestId/i);
});

test('buildMessageInput throws when message.externalMessageId is missing', () => {
  assert.throws(() => {
    buildMessageInput({
      traceId: 'trace-2b',
      requestId: 'req-2b',
      user: { id: 'u2' },
      channel: { type: 'api', conversationId: 'api-conv', conversationType: 'single' },
      message: {
        type: 'text',
        text: 'hi',
        sentAt: 1710000000002
      }
    });
  }, /message.externalMessageId/i);
});

test('buildMessageInput throws when message is missing', () => {
  assert.throws(() => {
    buildMessageInput({
      traceId: 'trace-legacy',
      requestId: 'req-legacy',
      user: { id: 'u3' },
      channel: { type: 'api' }
    });
  }, /message/i);
});

test('buildMessageInput throws when conversationType is missing', () => {
  assert.throws(() => {
    buildMessageInput({
      traceId: 'trace-missing-conv-type',
      requestId: 'req-missing-conv-type',
      user: { id: 'u4' },
      channel: { type: 'api', conversationId: 'api-conv' },
      message: { externalMessageId: 'msg-missing-conv-type', type: 'text', text: 'hi', sentAt: 1710000000003 }
    });
  }, /conversationType/i);
});

test('buildMessageInput throws when conversationType is invalid', () => {
  assert.throws(() => {
    buildMessageInput({
      traceId: 'trace-invalid-conv-type',
      requestId: 'req-invalid-conv-type',
      user: { id: 'u5' },
      channel: { type: 'api', conversationId: 'api-conv', conversationType: 'chat' },
      message: { externalMessageId: 'msg-invalid-conv-type', type: 'text', text: 'hi', sentAt: 1710000000004 }
    });
  }, /conversationType/i);
});

test('buildMessageInput keeps attachment references including fileId/url/mimeType', () => {
  const request = buildMessageInput({
    traceId: 'trace-attach',
    requestId: 'req-attach',
    user: { id: 'u-attach' },
    channel: { type: 'api', conversationId: 'conv-attach', conversationType: 'single' },
    message: {
      externalMessageId: 'msg-attach',
      text: 'with files',
      attachments: [
        { id: 'f-1', type: 'file', url: 'https://a/b/c.txt', mimeType: 'text/plain' },
        { fileId: 'img-2', type: 'image', url: 'https://a/b/d.png', mimeType: 'image/png' }
      ]
    }
  });

  assert.equal(request.message.attachments.length, 2);
  assert.equal(request.message.attachments[0].fileId, 'f-1');
  assert.equal(request.message.attachments[0].url, 'https://a/b/c.txt');
  assert.equal(request.message.attachments[0].mimeType, 'text/plain');
  assert.equal(request.message.attachments[1].fileId, 'img-2');
  assert.equal(request.message.attachments[1].mimeType, 'image/png');
});

test('buildMessageInput allows attachment-only messages', () => {
  const request = buildMessageInput({
    traceId: 'trace-att-only',
    requestId: 'req-att-only',
    user: { id: 'u-1' },
    channel: { type: 'web', conversationType: 'single', conversationId: 'conv-att-only' },
    message: {
      externalMessageId: 'm-att-only',
      attachments: [{ type: 'file', fileId: 'f-1' }],
      sentAt: Date.now()
    }
  });

  assert.equal(request.message.type, 'text+attachment');
  assert.equal(request.message.text, undefined);
  assert.equal(request.message.attachments.length, 1);
});

test('buildMessageInput classifies text with attachments as text+attachment', () => {
  const request = buildMessageInput({
    traceId: 'trace-text-attach',
    requestId: 'req-text-attach',
    user: { id: 'u-ta' },
    channel: { type: 'web', conversationType: 'single', conversationId: 'conv-ta' },
    message: {
      externalMessageId: 'm-ta',
      type: 'text',
      text: 'hello',
      attachments: [{ type: 'file', fileId: 'file-1' }],
      sentAt: Date.now()
    }
  });

  assert.equal(request.message.type, 'text+attachment');
});

test('buildMessageInput requires threadId for group conversation', () => {
  assert.throws(() => buildMessageInput({
    traceId: 'trace-group',
    requestId: 'req-group',
    user: { id: 'u-2' },
    channel: { type: 'dingtalk', conversationType: 'group', conversationId: 'conv-group' },
    message: { externalMessageId: 'm-group', text: 'hello', sentAt: Date.now() }
  }), /threadId is required/);
});

test('buildMessageOutput builds text-only response', () => {
  const output = buildMessageOutput({
    text: 'hello',
    attachments: []
  });
  assert.equal(output.text, 'hello');
  assert.deepEqual(output.attachments, []);
  assert.equal(output.session, undefined);
});

test('buildMessageOutput builds attachment-only response', () => {
  const output = buildMessageOutput({
    attachments: [{ type: 'file', fileId: 'f-1', url: 'https://example.com/a.txt' }]
  });
  assert.equal(output.text, undefined);
  assert.equal(output.attachments.length, 1);
  assert.equal(output.attachments[0].fileId, 'f-1');
});

test('buildMessageOutput includes optional session', () => {
  const output = buildMessageOutput({
    text: 'ok',
    attachments: []
  }, {
    session: { conversationId: 'conv-new' }
  });
  assert.equal(output.session.conversationId, 'conv-new');
});

test('buildMessageOutput throws when text and attachments are both empty in strict mode', () => {
  assert.throws(() => buildMessageOutput({ attachments: [] }), /cannot both be empty/i);
});

test('buildMessageOutput allows empty payload when strict is false', () => {
  const output = buildMessageOutput({ attachments: [] }, { strict: false });
  assert.equal(output.text, undefined);
  assert.deepEqual(output.attachments, []);
});

const { projectQueueResultToMessageOutput } = require('../src/agentization/types/messageOutputProjection');

test('projectQueueResultToMessageOutput strips queue debug fields', () => {
  const output = projectQueueResultToMessageOutput({
    ok: true,
    text: 'reply',
    attachments: [{ type: 'file', url: 'https://example.com/a.txt' }],
    history: [{ role: 'user', text: 'old' }],
    intent: { intent: 'smart_search' }
  });
  assert.equal(output.text, 'reply');
  assert.equal(output.attachments.length, 1);
  assert.equal(output.history, undefined);
  assert.equal(output.intent, undefined);
});
