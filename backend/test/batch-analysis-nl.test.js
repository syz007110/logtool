const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseBatchDslFromLlm,
  buildBatchIntentExtractionMessages,
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
      questions: [
        {
          slot: 'scope',
          question: '你想查哪一类异常？'
        }
      ]
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
      questions: [
        {
          slot: 'scope',
          question: '你想查哪一类异常？'
        }
      ]
    }
  });
});

test('parseBatchDslFromLlm keeps only supported clarification question fields', () => {
  const out = parseBatchDslFromLlm({
    filters: {
      type: 'group',
      logic: 'AND',
      children: []
    },
    actions: [],
    meta: {
      status: 'need_clarification',
      explain: '当前仍缺少更明确的检索范围',
      questions: [
        {
          slot: 'scope',
          question: '你想查哪一类异常，例如故障码、关键词，还是某个具体现象？'
        },
        {
          slot: 'unsupported_slot',
          question: '这个问题不应该保留'
        }
      ]
    }
  });

  assert.deepEqual(out.meta, {
    status: 'need_clarification',
    explain: '当前仍缺少更明确的检索范围',
    questions: [
      {
        slot: 'scope',
        question: '你想查哪一类异常，例如故障码、关键词，还是某个具体现象？'
      }
    ]
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

test('buildBatchIntentExtractionMessages renders log time range and current time placeholders', () => {
  const messages = buildBatchIntentExtractionMessages('统计 050B', {
    context: {
      logTimeRange: '2026-07-01 00:00:00 ~ 2026-07-07 23:59:59',
      timedate: '2026-07-07T00:09:10.000Z',
      timezone: 'Asia/Shanghai'
    }
  });

  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /当前批次日志时间范围：2026-07-01 00:00:00 ~ 2026-07-07 23:59:59/);
  assert.match(messages[0].content, /今天的时间是2026-07-07 08:09:10/);
});

test('buildBatchIntentExtractionMessages falls back to server time when user time or timezone is missing', () => {
  const messages = buildBatchIntentExtractionMessages('统计 050B', {
    context: {
      timedate: '2026-07-07T00:09:10.000Z'
    }
  });

  assert.equal(messages[0].role, 'system');
  assert.doesNotMatch(messages[0].content, /今天的时间是2026-07-07 08:09:10/);
});
