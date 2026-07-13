const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { projectToolTracesFromLoopTrace } = require('./toolTracesProjection');

describe('projectToolTracesFromLoopTrace', () => {
  it('extracts error_code_lookup success data', () => {
    const traces = projectToolTracesFromLoopTrace([
      {
        kind: 'tool',
        toolName: 'error_code_lookup',
        toolResult: {
          status: 'success',
          data: { items: [{ code: 'E1', subsystem: 'SYS' }], ambiguous: false }
        }
      }
    ]);
    assert.equal(traces.length, 1);
    assert.equal(traces[0].toolName, 'error_code_lookup');
    assert.equal(traces[0].data.items[0].code, 'E1');
  });

  it('skips failed tools and non-tool entries', () => {
    const traces = projectToolTracesFromLoopTrace([
      { kind: 'orchestrator' },
      {
        kind: 'tool',
        toolName: 'error_code_lookup',
        toolResult: { status: 'failed', error: { message: 'x' } }
      }
    ]);
    assert.deepEqual(traces, []);
  });
});
