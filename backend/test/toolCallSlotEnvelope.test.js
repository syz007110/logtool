const test = require('node:test');
const assert = require('node:assert/strict');

const { buildToolArgumentsFromSlotEnvelope } = require('../src/agentization/planner/toolCallSlotEnvelope');

test('buildToolArguments prefers toolSlots.values over entities', () => {
  const args = buildToolArgumentsFromSlotEnvelope({
    toolName: 'error_code_lookup',
    toolSlots: {
      values: { errorCode: '0X020B', subsystem: '3' }
    },
    entities: { errorCode: '0X010A', subsystem: '1' },
    confirmedSlots: {},
    userMessageText: '',
    language: 'zh-CN'
  });
  assert.equal(args.errorCode, '0X020B');
  assert.equal(args.subsystem, '3');
});

test('buildToolArguments uses confirmedSlots over entities when values omit', () => {
  const args = buildToolArgumentsFromSlotEnvelope({
    toolName: 'error_code_lookup',
    toolSlots: { values: {} },
    entities: { errorCode: '0X010A' },
    confirmedSlots: { errorCode: '141010A' },
    userMessageText: '',
    language: 'zh-CN'
  });
  assert.equal(args.errorCode, '141010A');
});

test('buildToolArguments uses entities when values omit key', () => {
  const args = buildToolArgumentsFromSlotEnvelope({
    toolName: 'error_code_lookup',
    toolSlots: { values: { errorCode: null } },
    entities: { errorCode: '142020A', subsystem: '2' },
    confirmedSlots: {},
    userMessageText: 'noise',
    language: 'zh-CN'
  });
  assert.equal(args.errorCode, '142020A');
  assert.equal(args.subsystem, '2');
});

test('buildToolArguments drops or trims subsystem to match registry pattern', () => {
  const a = buildToolArgumentsFromSlotEnvelope({
    toolName: 'error_code_lookup',
    toolSlots: { values: { errorCode: '0X010A', subsystem: '12' } },
    entities: {},
    confirmedSlots: {},
    userMessageText: '',
    language: 'zh-CN'
  });
  assert.equal(a.subsystem, '1');

  const b = buildToolArgumentsFromSlotEnvelope({
    toolName: 'error_code_lookup',
    toolSlots: { values: { errorCode: '0X010A', subsystem: '01' } },
    entities: {},
    confirmedSlots: {},
    userMessageText: '',
    language: 'zh-CN'
  });
  assert.equal(b.subsystem, null);

  const c = buildToolArgumentsFromSlotEnvelope({
    toolName: 'error_code_lookup',
    toolSlots: { values: { errorCode: '0X010A', subsystem: '运动控制' } },
    entities: {},
    confirmedSlots: {},
    userMessageText: '',
    language: 'zh-CN'
  });
  assert.equal(c.subsystem, null);
});
