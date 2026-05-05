const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAgentRequest,
  buildIntentResult,
  buildToolCall,
  buildAgentResponse
} = require('../src/agentization/types/contracts');

test('buildAgentRequest builds request with required fields', () => {
  const request = buildAgentRequest({
    traceId: 'trace-1',
    requestId: 'req-1',
    user: { id: 'u1' },
    channel: { type: 'dingtalk', conversationId: 'conv-1', conversationType: 'single' },
    message: {
      id: 'msg-1',
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
  assert.equal(request.message.id, 'msg-1');
  assert.equal(request.message.type, 'text');
  assert.equal(request.message.sentAt, 1710000000000);
  assert.equal(request.message.text, 'search alarm');
  assert.equal(request.text, undefined);
  assert.equal(request.attachments, undefined);
  assert.equal(request.context.source, 'bot');
});

test('buildAgentRequest throws when traceId is missing', () => {
  assert.throws(() => {
    buildAgentRequest({
      user: { id: 'u1' },
      channel: { type: 'dingtalk' },
      text: 'x'
    });
  }, /traceId/i);
});

test('buildAgentRequest throws when requestId is missing', () => {
  assert.throws(() => {
    buildAgentRequest({
      traceId: 'trace-2',
      user: { id: 'u2' },
      channel: { type: 'api', conversationId: 'api-conv', conversationType: 'single' },
      message: {
        id: 'msg-2',
        type: 'text',
        text: 'hi',
        sentAt: 1710000000001
      }
    });
  }, /requestId/i);
});

test('buildAgentRequest throws when message.id is missing', () => {
  assert.throws(() => {
    buildAgentRequest({
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
  }, /message.id/i);
});

test('buildAgentRequest throws when message is missing', () => {
  assert.throws(() => {
    buildAgentRequest({
      traceId: 'trace-legacy',
      requestId: 'req-legacy',
      user: { id: 'u3' },
      channel: { type: 'api' }
    });
  }, /message/i);
});

test('buildAgentRequest throws when conversationType is missing', () => {
  assert.throws(() => {
    buildAgentRequest({
      traceId: 'trace-missing-conv-type',
      requestId: 'req-missing-conv-type',
      user: { id: 'u4' },
      channel: { type: 'api', conversationId: 'api-conv' },
      message: { id: 'msg-missing-conv-type', type: 'text', text: 'hi', sentAt: 1710000000003 }
    });
  }, /conversationType/i);
});

test('buildAgentRequest throws when conversationType is invalid', () => {
  assert.throws(() => {
    buildAgentRequest({
      traceId: 'trace-invalid-conv-type',
      requestId: 'req-invalid-conv-type',
      user: { id: 'u5' },
      channel: { type: 'api', conversationId: 'api-conv', conversationType: 'chat' },
      message: { id: 'msg-invalid-conv-type', type: 'text', text: 'hi', sentAt: 1710000000004 }
    });
  }, /conversationType/i);
});

test('buildIntentResult normalizes fallback and confidence', () => {
  const intent = buildIntentResult({
    intent: 'smart_search',
    confidence: 2,
    slots: { q: 'abc' }
  });

  assert.equal(intent.intent, 'smart_search');
  assert.equal(intent.confidence, 1);
  assert.equal(intent.fallback, false);
  assert.equal(intent.slots.q, 'abc');
});

test('buildToolCall applies defaults for timeout and retry', () => {
  const call = buildToolCall({
    toolName: 'smart_search',
    input: { query: 'abc' }
  });

  assert.equal(call.toolName, 'smart_search');
  assert.equal(call.timeoutMs, 8000);
  assert.equal(call.retryPolicy.maxAttempts, 1);
  assert.equal(call.retryPolicy.backoffMs, 0);
});

test('buildAgentResponse keeps taskId optional', () => {
  const response = buildAgentResponse({
    mode: 'async',
    text: 'queued',
    actions: [{ type: 'poll' }],
    taskId: 'task-1'
  });

  assert.equal(response.mode, 'async');
  assert.equal(response.taskId, 'task-1');
  assert.equal(response.actions.length, 1);
});

test('buildAgentRequest keeps attachment references including fileId/url/mimeType', () => {
  const request = buildAgentRequest({
    traceId: 'trace-attach',
    requestId: 'req-attach',
    user: { id: 'u-attach' },
    channel: { type: 'api', conversationId: 'conv-attach', conversationType: 'single' },
    message: {
      id: 'msg-attach',
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

test('buildAgentRequest allows attachment-only messages', () => {
  const request = buildAgentRequest({
    traceId: 'trace-att-only',
    requestId: 'req-att-only',
    user: { id: 'u-1' },
    channel: { type: 'web', conversationType: 'single', conversationId: 'conv-att-only' },
    message: {
      id: 'm-att-only',
      attachments: [{ type: 'file', fileId: 'f-1' }],
      sentAt: Date.now()
    }
  });

  assert.equal(request.message.text, undefined);
  assert.equal(request.message.attachments.length, 1);
});

test('buildAgentRequest requires threadId for group conversation', () => {
  assert.throws(() => buildAgentRequest({
    traceId: 'trace-group',
    requestId: 'req-group',
    user: { id: 'u-2' },
    channel: { type: 'dingtalk', conversationType: 'group', conversationId: 'conv-group' },
    message: { id: 'm-group', text: 'hello', sentAt: Date.now() }
  }), /threadId is required/);
});
