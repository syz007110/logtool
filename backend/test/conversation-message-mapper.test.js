const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildConversationMessageInput,
  detectContentMessageType,
  normalizeInboundMessageType,
  normalizeStoredMessageType
} = require('../src/agentization/session/conversationMessageMapper');
const { MESSAGE_TYPES } = require('../src/agentization/session/conversationMessageTypes');
const {
  buildMessageId,
  buildEventIdempotencyKey,
  extractTokenUsageFromTurn
} = require('../src/agentization/session/conversationTurnKeys');

test('normalizeInboundMessageType maps text and attachments', () => {
  assert.equal(normalizeInboundMessageType('text', []), MESSAGE_TYPES.TEXT);
  assert.equal(normalizeInboundMessageType('text', [{ type: 'file' }]), MESSAGE_TYPES.ATTACHMENT);
  assert.equal(normalizeInboundMessageType('text+attachment', []), MESSAGE_TYPES.ATTACHMENT);
});

test('detectContentMessageType maps pipeline and dialogue types', () => {
  assert.equal(detectContentMessageType({
    role: 'assistant',
    explicitType: 'orchestrator',
    content: null,
    attachments: [],
    payload: { intent: 'find_case' }
  }), MESSAGE_TYPES.ORCHESTRATOR);

  assert.equal(detectContentMessageType({
    role: 'assistant',
    explicitType: 'text',
    content: 'hello',
    attachments: [{ type: 'file' }],
    payload: {}
  }), MESSAGE_TYPES.ATTACHMENT);

  assert.equal(detectContentMessageType({
    role: 'system',
    explicitType: 'plan',
    content: null,
    attachments: [],
    payload: { phase: 'input' }
  }), MESSAGE_TYPES.PLAN);
});

test('normalizeStoredMessageType supports legacy aliases', () => {
  assert.equal(normalizeStoredMessageType('intent_result'), MESSAGE_TYPES.ORCHESTRATOR);
  assert.equal(normalizeStoredMessageType('intent'), MESSAGE_TYPES.ORCHESTRATOR);
  assert.equal(normalizeStoredMessageType('tool_result'), MESSAGE_TYPES.TOOL);
  assert.equal(normalizeStoredMessageType('clarification'), MESSAGE_TYPES.CLARIFY);
});

test('buildConversationMessageInput falls back unknown role to system', () => {
  const out = buildConversationMessageInput({
    instanceId: 1,
    messageId: 'msg-1',
    requestId: 'req-1',
    traceId: 'trace-1',
    taskId: 'task_abc123',
    role: 'intent',
    explicitMessageType: 'plan',
    content: null,
    payload: { intent: 'find_case', phase: 'output' },
    attachments: [],
    idempotencyKey: 'idem-1'
  });
  assert.equal(out.role, 'system');
  assert.equal(out.message_type, MESSAGE_TYPES.PLAN);
  assert.equal(out.instance_id, 1);
  assert.equal(out.task_id, 'task_abc123');
});

test('internal event ids and idempotency keys use suffixes', () => {
  const request = {
    channel: { type: 'web', conversationId: 'conv-1' },
    user: { id: 'user-1' },
    message: { externalMessageId: '01JMSG001' }
  };
  assert.equal(buildMessageId(request, 'orchestrator'), '01JMSG001:orchestrator');
  assert.equal(
    buildEventIdempotencyKey(request, 'orchestrator'),
    'web:user-1:conv-1:01JMSG001:orchestrator'
  );
});

test('extractTokenUsageFromTurn sums llm usage fields', () => {
  const total = extractTokenUsageFromTurn(
    { llmRaw: { response: { usage: { total_tokens: 120 } } } },
    { debugMeta: { smartSearch: { llmRaw: { response: { usage: { total_tokens: 30 } } } } } }
  );
  assert.equal(total, 150);
});
