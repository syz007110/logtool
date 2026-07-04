const test = require('node:test');
const assert = require('node:assert/strict');

const { renderOutbound } = require('../src/agentization/adapters/web/webAdapter');

test('web adapter completed response preserves instance notice and policy', () => {
  let jsonPayload = null;
  const res = {
    json(payload) {
      jsonPayload = payload;
      return payload;
    }
  };

  renderOutbound({
    req: {},
    res,
    request: {
      traceId: 'trace-1',
      requestId: 'req-1',
      channel: { conversationId: 'conv-1' },
      __conversationIdProvided: false
    },
    response: {
      mode: 'completed',
      taskId: 'task-1',
      result: {
        text: '分析结果',
        attachments: [],
        instance: {
          created_new: true,
          rollover_reason: 'max_tokens',
          notice: '达到此对话的token上限（30000），已新建对话'
        },
        policy: {
          maxTokens: 30000
        }
      }
    }
  });

  assert.equal(jsonPayload.mode, 'completed');
  assert.equal(jsonPayload.response.text, '分析结果');
  assert.equal(jsonPayload.response.instance.notice, '达到此对话的token上限（30000），已新建对话');
  assert.equal(jsonPayload.response.policy.maxTokens, 30000);
  assert.deepEqual(jsonPayload.response.session, { conversationId: 'conv-1' });
});
