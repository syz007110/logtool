const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseBatchDslFromLlm,
  buildBatchIntentExtractionRequest
} = require('../src/services/smartSearchLlmService');

test('parseBatchDslFromLlm keeps only filters actions and meta from typed DSL output', () => {
  const out = parseBatchDslFromLlm({
    filters: {
      type: 'group',
      logic: 'AND',
      children: [
        {
          type: 'condition',
          field: 'error_code',
          op: 'contains',
          value: '0x431D'
        }
      ]
    },
    actions: [
      {
        type: 'stats',
        field: 'error_code',
        value: '0x431D'
      }
    ],
    meta: {
      status: 'ok',
      explain: '统计 0x431D',
      missing_slots: [],
      questions: []
    },
    search: 'should-be-dropped',
    start_time: '2026-07-06 10:00:00',
    end_time: '2026-07-06 11:00:00'
  });

  assert.deepEqual(out, {
    filters: {
      type: 'group',
      logic: 'AND',
      children: [
        {
          type: 'condition',
          field: 'error_code',
          op: 'contains',
          value: '0x431D'
        }
      ]
    },
    actions: [
      {
        type: 'stats',
        field: 'error_code',
        value: '0x431D'
      }
    ],
    meta: {
      status: 'ok',
      explain: '统计 0x431D',
      missing_slots: [],
      questions: []
    }
  });
});

test('buildBatchIntentExtractionRequest uses json_object response_format', () => {
  const request = buildBatchIntentExtractionRequest({
    provider: {
      model: 'deepseek-v4-flash',
      temperature: 0,
      topP: 0.1
    },
    messages: [
      { role: 'system', content: 'Output JSON only.' },
      { role: 'user', content: '统计 0x431D' }
    ]
  });

  assert.equal(request.model, 'deepseek-v4-flash');
  assert.deepEqual(request.response_format, { type: 'json_object' });
});
