const test = require('node:test');
const assert = require('node:assert/strict');

const { projectQueueResultToMessageOutput } = require('../src/agentization/types/messageOutputProjection');

test('projectQueueResultToMessageOutput preserves session conversationId and existing text payload', () => {
  const projected = projectQueueResultToMessageOutput({
    text: '分析完成',
    attachments: [{ type: 'file', fileId: 'file-1', name: 'report.txt' }],
    container: {
      conversation_id: 'conv-123'
    },
    instance: {
      created_new: true,
      instance_no: 3,
      rollover_reason: 'no_active_instance'
    },
    policy: {
      maxTurns: 30,
      idleTimeoutMinutes: 30,
      maxTokens: 6000
    }
  });

  assert.equal(projected.text, '分析完成');
  assert.equal(Array.isArray(projected.attachments), true);
  assert.equal(projected.attachments.length, 1);
  assert.deepEqual(projected.session, { conversationId: 'conv-123' });
  assert.equal(projected.instance?.created_new, true);
  assert.equal(projected.policy?.maxTurns, 30);
});

test('projectQueueResultToMessageOutput prefers explicit session conversationId', () => {
  const projected = projectQueueResultToMessageOutput({
    text: 'ok',
    session: { conversationId: 'conv-session' },
    container: { conversation_id: 'conv-container' }
  });

  assert.deepEqual(projected.session, { conversationId: 'conv-session' });
});
