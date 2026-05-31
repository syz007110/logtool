const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeConversationIntentResult } = require('../src/services/qwenService');

test('normalizeConversationIntentResult keeps metadata fields and clamps confidence', () => {
  const out = normalizeConversationIntentResult({
    intentVersion: 'V2',
    intent: 'fault_diagnosis',
    confidence: 2,
    language: 'en-US',
    entities: { fileIds: ['f1'] },
    toolDecision: { shouldCallTool: false, toolName: null, reason: '' },
    needClarification: false,
    clarificationQuestion: null,
    nextAction: { type: 'reply_direct', message: 'ok' }
  }, { fallbackLanguage: 'zh' });

  assert.equal(out.intentVersion, 'v2');
  assert.equal(out.confidence, 1);
  assert.equal(out.language, 'en-US');
  assert.equal(out.nextAction.type, 'reply_direct');
  assert.deepEqual(out.toolSlots.values, {});
});

test('normalizeConversationIntentResult filters toolSlots.values to registry property keys', () => {
  const out = normalizeConversationIntentResult({
    intent: 'error_code_lookup',
    entities: { fileIds: [] },
    toolDecision: { shouldCallTool: true, toolName: 'error_code_lookup', reason: '' },
    toolSlots: {
      values: { errorCode: '0X010A', bogusKey: 'nope', subsystem: '2' }
    },
    needClarification: false,
    clarificationQuestion: null,
    nextAction: { type: 'call_tool', message: '' }
  }, { fallbackLanguage: 'zh-CN' });
  assert.equal(out.toolSlots.values.errorCode, '0X010A');
  assert.equal(out.toolSlots.values.subsystem, '2');
  assert.ok(!Object.prototype.hasOwnProperty.call(out.toolSlots.values, 'bogusKey'));
});

test('normalizeConversationIntentResult enforces call_tool consistency', () => {
  const out = normalizeConversationIntentResult({
    intent: 'error_code_lookup',
    entities: { fileIds: [] },
    toolDecision: { shouldCallTool: false, toolName: 'error_code_lookup', reason: 'need tool' },
    needClarification: false,
    clarificationQuestion: null,
    nextAction: { type: 'call_tool', message: '' }
  }, { fallbackLanguage: 'zh-CN' });

  assert.equal(out.toolDecision.shouldCallTool, true);
  assert.equal(out.toolDecision.toolName, 'error_code_lookup');
  assert.equal(out.nextAction.type, 'call_tool');
});

test('normalizeConversationIntentResult enforces clarification consistency and language fallback', () => {
  const out = normalizeConversationIntentResult({
    intent: 'unknown',
    entities: { fileIds: [] },
    toolDecision: { shouldCallTool: true, toolName: 'badTool', reason: '' },
    needClarification: true,
    clarificationQuestion: '',
    nextAction: { type: 'reply_direct', message: '' },
    language: 'bad tag',
    confidence: -1
  }, { fallbackLanguage: 'en' });

  assert.equal(out.toolDecision.shouldCallTool, false);
  assert.equal(out.toolDecision.toolName, null);
  assert.equal(out.needClarification, true);
  assert.equal(out.nextAction.type, 'ask_user');
  assert.equal(out.clarificationQuestion, '请补充更多信息');
  assert.equal(out.language, 'en-US');
  assert.equal(out.confidence, 0);
  assert.equal(out.intentVersion, 'v1');
});

test('normalizeConversationIntentResult accepts registry tool names', () => {
  const out = normalizeConversationIntentResult({
    intent: 'error_code_lookup',
    entities: { fileIds: [] },
    toolDecision: { shouldCallTool: true, toolName: 'error_code_lookup', reason: 'need tool' },
    needClarification: false,
    clarificationQuestion: null,
    nextAction: { type: 'call_tool', message: '' }
  }, { fallbackLanguage: 'zh-CN' });

  assert.equal(out.toolDecision.shouldCallTool, true);
  assert.equal(out.toolDecision.toolName, 'error_code_lookup');
  assert.equal(out.nextAction.type, 'call_tool');
});

test('normalizeConversationIntentResult maps toolSlots and drops LLM tool arguments', () => {
  const out = normalizeConversationIntentResult({
    intent: 'error_code_lookup',
    entities: { fileIds: [] },
    toolDecision: {
      shouldCallTool: true,
      toolName: 'error_code_lookup',
      reason: '',
      arguments: { errorCode: '550E', subsystem: null, keywords: 'x' }
    },
    toolSlots: {
      requiredSlots: ['errorCode'],
      optionalSlots: ['subsystem'],
      anyOfRequired: [],
      missingSlot: 'subsystem'
    },
    needClarification: false,
    clarificationQuestion: null,
    nextAction: { type: 'call_tool', message: '' }
  }, { fallbackLanguage: 'zh-CN' });

  assert.deepEqual(out.toolSlots.missingSlots, ['subsystem']);
  assert.ok(!Object.prototype.hasOwnProperty.call(out.toolDecision, 'arguments'));
});
