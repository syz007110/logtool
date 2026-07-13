const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_PROVIDER_CAPABILITIES,
  normalizeProviderCapabilities
} = require('./providerCapabilities');

describe('normalizeProviderCapabilities', () => {
  it('fills defaults when input empty', () => {
    const caps = normalizeProviderCapabilities(null);
    assert.equal(caps.maxTokensField, 'max_tokens');
    assert.equal(caps.sampling, 'send');
    assert.equal(caps.thinking, null);
    assert.equal(caps.preserveReasoningContent, false);
    assert.equal(caps.toolCalls, true);
    assert.equal(caps.strictTools.default, false);
    assert.equal(caps.toolNamePattern, DEFAULT_PROVIDER_CAPABILITIES.toolNamePattern);
  });

  it('keeps explicit overrides', () => {
    const caps = normalizeProviderCapabilities({
      maxTokensField: 'max_completion_tokens',
      sampling: 'omit',
      thinking: { type: 'enabled', keep: 'all' },
      preserveReasoningContent: true,
      strictTools: { default: true },
      toolNamePattern: '^[a-zA-Z_][a-zA-Z0-9-_]{2,63}$'
    });
    assert.equal(caps.maxTokensField, 'max_completion_tokens');
    assert.equal(caps.sampling, 'omit');
    assert.deepEqual(caps.thinking, { type: 'enabled', keep: 'all' });
    assert.equal(caps.preserveReasoningContent, true);
    assert.equal(caps.strictTools.default, true);
  });

  it('throws on invalid maxTokensField', () => {
    assert.throws(
      () => normalizeProviderCapabilities({ maxTokensField: 'max_output_tokens' }),
      (err) => err && err.code === 'INVALID_PROVIDER_CAPABILITIES'
    );
  });

  it('throws on invalid sampling', () => {
    assert.throws(
      () => normalizeProviderCapabilities({ sampling: 'fixed' }),
      (err) => err && err.code === 'INVALID_PROVIDER_CAPABILITIES'
    );
  });

  it('throws on invalid thinking.type', () => {
    assert.throws(
      () => normalizeProviderCapabilities({ thinking: { type: 'maybe' } }),
      (err) => err && err.code === 'INVALID_PROVIDER_CAPABILITIES'
    );
  });
});
