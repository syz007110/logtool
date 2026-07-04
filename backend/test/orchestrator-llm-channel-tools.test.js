const test = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('events');
const https = require('https');

const { runOrchestratorChatCompletion } = require('../src/agentization/orchestrator/orchestratorLlmService');

test('runOrchestratorChatCompletion forwards dingtalk channelType into final LLM request tools', async (t) => {
  const originalRequest = https.request;
  let capturedBody = null;

  https.request = (options, callback) => {
    const response = new EventEmitter();
    response.statusCode = 200;
    response.setEncoding = () => {};

    const request = new EventEmitter();
    const chunks = [];

    request.write = (chunk) => { chunks.push(Buffer.from(chunk)); };
    request.end = () => {
      capturedBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      callback(response);
      process.nextTick(() => {
        response.emit('data', JSON.stringify({
          id: 'chatcmpl-test',
          object: 'chat.completion',
          created: 1,
          model: 'test-model',
          choices: [{
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content: 'ok' }
          }],
          usage: { total_tokens: 12 }
        }));
        response.emit('end');
      });
    };
    request.setTimeout = () => {};
    request.destroy = (err) => { if (err) request.emit('error', err); };
    request.on = EventEmitter.prototype.on;
    return request;
  };

  t.after(() => {
    https.request = originalRequest;
  });

  const result = await runOrchestratorChatCompletion({
    contextEnvelope: {
      currentQuery: '查询 141010A',
      historyContext: { messages: [] }
    },
    messages: [{ role: 'user', content: '查询 141010A' }],
    provider: {
      id: 'test-provider',
      label: 'Test Provider',
      model: 'test-model',
      baseUrl: 'https://example.com',
      requiresApiKey: false
    },
    userPermissions: [],
    channelType: 'dingtalk',
    traceId: 'trace-test'
  });

  assert.equal(result.kind, 'message');
  assert.equal(capturedBody.tool_choice, 'auto');
  assert.ok(Array.isArray(capturedBody.tools));
  assert.ok(capturedBody.tools.some((tool) => tool?.function?.name === 'error_code_lookup'));
});
