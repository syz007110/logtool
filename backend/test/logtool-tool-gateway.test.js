const test = require('node:test');
const assert = require('node:assert/strict');

const { createLogtoolToolGateway } = require('../src/agentization/tools/logtoolToolGateway');

function req(text = 'hello') {
  return {
    traceId: 'trace-1',
    message: { text }
  };
}

test('gateway emits handlerName for log_query', async () => {
  const gateway = createLogtoolToolGateway();
  const out = await gateway.invoke('log_query', req('analyze this log'), { intent: 'log_query' });
  assert.equal(out.debugMeta.executionRoute, 'log_query');
  assert.equal(out.debugMeta.handlerName, 'LogAnalysisHandler');
});

test('gateway emits handlerName for surgery_summary', async () => {
  const gateway = createLogtoolToolGateway();
  const out = await gateway.invoke('surgery_summary', req('last week data'), { intent: 'surgery_summary' });
  assert.equal(out.debugMeta.executionRoute, 'surgery_summary');
  assert.equal(out.debugMeta.handlerName, 'SurgeryDataHandler');
});

test('gateway emits handlerName for case_record fallback', async () => {
  const gateway = createLogtoolToolGateway();
  const out = await gateway.invoke('unknown_intent', req('collect case'), { intent: 'unknown_intent' });
  assert.equal(out.debugMeta.executionRoute, 'case_record');
  assert.equal(out.debugMeta.handlerName, 'FaultCaseCollectHandler');
});

