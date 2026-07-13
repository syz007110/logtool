const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { mapFunctionToolsForProvider } = require('./toolProviderAdapter');

const baseTool = {
  type: 'function',
  function: {
    name: 'reply_direct',
    description: 'reply',
    parameters: { type: 'object', properties: {} }
  }
};

describe('mapFunctionToolsForProvider', () => {
  it('uses toolNamePattern from capabilities, not provider id', () => {
    const provider = {
      id: 'kimi-k2',
      capabilities: {
        toolCalls: true,
        strictTools: { default: true },
        toolNamePattern: '^[a-zA-Z_][a-zA-Z0-9-_]{2,63}$'
      }
    };
    const mapped = mapFunctionToolsForProvider([baseTool], provider);
    assert.equal(mapped.tools[0].function.name, 'reply_direct');
    assert.equal(mapped.tools[0].function.strict, true);
  });

  it('rejects names that fail configured pattern', () => {
    const provider = {
      id: 'any',
      capabilities: {
        toolCalls: true,
        strictTools: { default: false },
        toolNamePattern: '^[a-zA-Z_][a-zA-Z0-9-_]{2,63}$'
      }
    };
    assert.throws(
      () => mapFunctionToolsForProvider([{
        type: 'function',
        function: { name: '12bad', description: 'x', parameters: {} }
      }], provider),
      (err) => err && err.code === 'INVALID_TOOL_NAME'
    );
  });

  it('defaults strict false when capabilities omit strictTools but pattern present', () => {
    const provider = {
      id: 'deepseek-chat',
      capabilities: {
        toolCalls: true,
        toolNamePattern: '^[a-zA-Z0-9_-]{1,64}$'
      }
    };
    const mapped = mapFunctionToolsForProvider([baseTool], provider);
    assert.equal(mapped.tools[0].function.strict, undefined);
  });
});
