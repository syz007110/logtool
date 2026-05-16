const test = require('node:test');
const assert = require('node:assert/strict');

const qwenService = require('../src/services/qwenService');
const { createPlatformTaskRouter } = require('../src/agentization/router/platformTaskRouter');

function buildRequest(text) {
  return {
    message: { text: text == null ? '' : String(text) },
    context: {},
    channel: { type: 'api' }
  };
}

test('router returns normalized ContextIntent', async (t) => {
  const original = qwenService.extractConversationIntentWithProvider;
  qwenService.extractConversationIntentWithProvider = async () => ({
    intent: 'error_code_lookup',
    entities: { errorCode: '0X010A', fileIds: [] },
    toolDecision: { shouldCallTool: true, toolName: 'error_code_lookup', reason: 'has_code' },
    needClarification: false,
    clarificationQuestion: null,
    nextAction: { type: 'call_tool', message: '' },
    confidence: 0.9,
    language: 'zh-CN'
  });
  t.after(() => { qwenService.extractConversationIntentWithProvider = original; });

  const router = createPlatformTaskRouter();
  const out = await router.route(buildRequest('查 0X010A'));
  assert.equal(out.intentVersion, 'v1');
  assert.equal(out.intent, 'error_code_lookup');
  assert.equal(out.toolDecision.toolName, 'error_code_lookup');
  assert.equal(out.nextAction.type, 'call_tool');
});

