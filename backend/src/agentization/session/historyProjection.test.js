const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  projectOrchestratorHistoryRow,
  normalizeHistoryContextMessage
} = require('./historyProjection');

describe('historyProjection reasoning_content', () => {
  it('projects reasoning_content from orchestrator rawMessage', () => {
    const projected = projectOrchestratorHistoryRow({
      role: 'assistant',
      message_type: 'orchestrator',
      payload: {
        rawMessage: {
          role: 'assistant',
          content: null,
          reasoning_content: 'think',
          tool_calls: [{
            id: 'c1',
            type: 'function',
            function: { name: 'reply_direct', arguments: '{}' }
          }]
        },
        toolCalls: [{ id: 'c1', toolName: 'reply_direct', rawArguments: '{}' }]
      }
    });
    assert.equal(projected.reasoning_content, 'think');
    const normalized = normalizeHistoryContextMessage(projected);
    assert.equal(normalized.reasoning_content, 'think');
  });

  it('omits reasoning_content when absent', () => {
    const projected = projectOrchestratorHistoryRow({
      role: 'assistant',
      message_type: 'orchestrator',
      payload: {
        rawMessage: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'c1',
            type: 'function',
            function: { name: 'reply_direct', arguments: '{}' }
          }]
        }
      }
    });
    assert.equal(projected.reasoning_content, undefined);
  });
});
