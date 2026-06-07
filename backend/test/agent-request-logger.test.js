const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createAgentRequestLogger
} = require('../src/agentization/utils/agentRequestLogger');

test('agent request logger does nothing when disabled', () => {
  const logs = [];
  const logger = createAgentRequestLogger({
    env: { AGENT_REQUEST_LOG: 'false' },
    logger: { info: (...args) => logs.push(args) },
    random: () => 0
  });

  logger.log('api', {
    traceId: 't1',
    requestId: 'r1',
    user: { id: 'user-1' },
    channel: { type: 'api', conversationType: 'single', conversationId: 'conv-1' },
    message: { externalMessageId: 'm1', type: 'text', text: 'hello', attachments: [], sentAt: 1 }
  });

  assert.equal(logs.length, 0);
});

test('agent request logger logs sanitized payload when enabled', () => {
  const logs = [];
  const logger = createAgentRequestLogger({
    env: { AGENT_REQUEST_LOG: 'true', AGENT_REQUEST_LOG_SAMPLE_RATE: '1' },
    logger: { info: (...args) => logs.push(args) },
    random: () => 0
  });

  logger.log('dingtalk-stream', {
    traceId: 't2',
    requestId: 'r2',
    user: { id: 'staff-123456', name: 'Alice', platformUserId: 'uid-123456' },
    channel: {
      type: 'dingtalk',
      conversationType: 'group',
      conversationId: 'conversation-123456',
      replyWebhook: 'https://example.com/hook?token=abc'
    },
    message: { externalMessageId: 'm2', type: 'text', text: 'hello world', attachments: [{ type: 'file' }], sentAt: 2 }
  });

  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], '[agent-request] normalized');
  assert.equal(logs[0][1].source, 'dingtalk-stream');
  assert.equal(logs[0][1].request.message.attachments.length, 1);
  assert.equal(logs[0][1].request.message.attachmentsCount, undefined);
  assert.equal(logs[0][1].request.user.name, 'Alice');
  assert.match(logs[0][1].request.user.id, /\*\*\*/);
  assert.equal(logs[0][1].request.channel.replyWebhook, 'https://example.com/hook');
});
