const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { adaptChatCompletionRequest } = require('./chatProviderAdapter');

function baseReq() {
  return {
    model: 'ignored',
    messages: [{ role: 'user', content: 'hi' }],
    temperature: 0,
    top_p: 0.1,
    tools: [{
      type: 'function',
      function: { name: 'reply_direct', description: 'd', parameters: { type: 'object', properties: {} } }
    }]
  };
}

describe('adaptChatCompletionRequest', () => {
  it('uses max_tokens when maxTokensField is max_tokens', () => {
    const { body } = adaptChatCompletionRequest(baseReq(), {
      model: 'deepseek-v4-flash',
      temperature: 0,
      top_p: 0.1,
      orchestratorMaxTokens: 4096,
      capabilities: {
        maxTokensField: 'max_tokens',
        sampling: 'send',
        thinking: null,
        toolCalls: true,
        strictTools: { default: false },
        toolNamePattern: '^[a-zA-Z0-9_-]{1,64}$'
      },
      orchestrator: { toolChoice: 'auto' }
    });
    assert.equal(body.max_tokens, 4096);
    assert.equal(body.max_completion_tokens, undefined);
    assert.equal(body.temperature, 0);
    assert.equal(body.top_p, 0.1);
    assert.equal(body.thinking, undefined);
  });

  it('uses max_completion_tokens and omits sampling when configured', () => {
    const { body } = adaptChatCompletionRequest(baseReq(), {
      model: 'kimi-k2.6',
      temperature: 0,
      top_p: 0.1,
      orchestratorMaxTokens: 16000,
      capabilities: {
        maxTokensField: 'max_completion_tokens',
        sampling: 'omit',
        thinking: { type: 'enabled' },
        toolCalls: true,
        strictTools: { default: true },
        toolNamePattern: '^[a-zA-Z_][a-zA-Z0-9-_]{2,63}$',
        preserveReasoningContent: true
      },
      orchestrator: { toolChoice: 'auto' }
    });
    assert.equal(body.max_completion_tokens, 16000);
    assert.equal(body.max_tokens, undefined);
    assert.equal(body.temperature, undefined);
    assert.equal(body.top_p, undefined);
    assert.deepEqual(body.thinking, { type: 'enabled' });
  });

  it('does not branch on provider id for kimi-like ids without caps', () => {
    const { body } = adaptChatCompletionRequest(baseReq(), {
      id: 'kimi-something',
      baseUrl: 'https://api.moonshot.cn/v1',
      model: 'kimi-k2.6',
      temperature: 0,
      topP: 0.1,
      orchestratorMaxTokens: 4096,
      capabilities: {},
      orchestrator: { toolChoice: 'auto' }
    });
    assert.equal(body.max_tokens, 4096);
    assert.equal(body.max_completion_tokens, undefined);
  });
});
