const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  projectOrchestratorHistoryRow,
  projectToolHistoryRow,
  normalizeHistoryContextMessage
} = require('./historyProjection');

describe('historyProjection reasoning_content', () => {
  it('projects reasoning_content from orchestrator rawMessage', () => {
    const projected = projectOrchestratorHistoryRow({
      role: 'assistant',
      message_type: 'orchestrator',
      payload_raw_message: {
        role: 'assistant',
        content: null,
        reasoning_content: 'think',
        tool_calls: [{
          id: 'c1',
          type: 'function',
          function: { name: 'reply_direct', arguments: '{}' }
        }]
      },
      payload_tool_calls: [{ id: 'c1', toolName: 'reply_direct', rawArguments: '{}' }]
    });
    assert.equal(projected.reasoning_content, 'think');
    const normalized = normalizeHistoryContextMessage(projected);
    assert.equal(normalized.reasoning_content, 'think');
  });

  it('omits reasoning_content when absent', () => {
    const projected = projectOrchestratorHistoryRow({
      role: 'assistant',
      message_type: 'orchestrator',
      payload_raw_message: {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'c1',
          type: 'function',
          function: { name: 'reply_direct', arguments: '{}' }
        }]
      }
    });
    assert.equal(projected.reasoning_content, undefined);
  });

  it('projects orchestrator row from lightweight payload columns', () => {
    const projected = projectOrchestratorHistoryRow({
      role: 'assistant',
      message_type: 'orchestrator',
      payload_raw_message: {
        role: 'assistant',
        content: null,
        reasoning_content: 'think-lite',
        tool_calls: [{
          id: 'c2',
          type: 'function',
          function: { name: 'reply_direct', arguments: '{}' }
        }]
      },
      payload_tool_calls: [{ id: 'c2', toolName: 'reply_direct', rawArguments: '{}' }],
      payload_content: null
    });
    assert.equal(projected.reasoning_content, 'think-lite');
    assert.equal(projected.tool_calls[0].id, 'c2');
  });

  it('projects tool row from lightweight payload columns', () => {
    const projected = projectToolHistoryRow({
      role: 'tool',
      message_type: 'tool',
      content: '',
      payload_tool_call_id: 'call-1',
      payload_status: 'success'
    });
    assert.deepEqual(projected, {
      role: 'tool',
      tool_call_id: 'call-1',
      content: JSON.stringify({ status: 'success' })
    });
  });
});
