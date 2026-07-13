const DEFAULT_TOOL_NAME_PATTERN = '^[a-zA-Z0-9_-]{1,64}$';

const DEFAULT_PROVIDER_CAPABILITIES = Object.freeze({
  toolCalls: true,
  strictTools: Object.freeze({ default: false }),
  toolNamePattern: DEFAULT_TOOL_NAME_PATTERN,
  maxTokensField: 'max_tokens',
  sampling: 'send',
  thinking: null,
  preserveReasoningContent: false
});

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function invalidCapabilities(message, details) {
  const err = new Error(message);
  err.code = 'INVALID_PROVIDER_CAPABILITIES';
  if (details) err.details = details;
  return err;
}

/**
 * Normalize provider.capabilities. Missing fields get defaults compatible with
 * current DeepSeek/Qwen/GLM behavior. Invalid enums throw (no silent swallow).
 */
function normalizeProviderCapabilities(raw) {
  const input = asObject(raw);
  const strictIn = asObject(input.strictTools);

  const maxTokensField = Object.prototype.hasOwnProperty.call(input, 'maxTokensField')
    ? String(input.maxTokensField || '').trim()
    : DEFAULT_PROVIDER_CAPABILITIES.maxTokensField;
  if (maxTokensField !== 'max_tokens' && maxTokensField !== 'max_completion_tokens') {
    throw invalidCapabilities(`invalid capabilities.maxTokensField: ${maxTokensField}`, { maxTokensField });
  }

  const sampling = Object.prototype.hasOwnProperty.call(input, 'sampling')
    ? String(input.sampling || '').trim()
    : DEFAULT_PROVIDER_CAPABILITIES.sampling;
  if (sampling !== 'send' && sampling !== 'omit') {
    throw invalidCapabilities(`invalid capabilities.sampling: ${sampling}`, { sampling });
  }

  let thinking = DEFAULT_PROVIDER_CAPABILITIES.thinking;
  if (Object.prototype.hasOwnProperty.call(input, 'thinking')) {
    if (input.thinking == null) {
      thinking = null;
    } else {
      const t = asObject(input.thinking);
      const type = String(t.type || '').trim();
      if (type !== 'enabled' && type !== 'disabled') {
        throw invalidCapabilities(`invalid capabilities.thinking.type: ${type}`, { thinking: input.thinking });
      }
      const out = { type };
      if (Object.prototype.hasOwnProperty.call(t, 'keep')) {
        if (t.keep != null && t.keep !== 'all') {
          throw invalidCapabilities(`invalid capabilities.thinking.keep: ${t.keep}`, { thinking: input.thinking });
        }
        out.keep = t.keep == null ? null : 'all';
      }
      thinking = out;
    }
  }

  const toolNamePattern = Object.prototype.hasOwnProperty.call(input, 'toolNamePattern')
    ? String(input.toolNamePattern || '').trim()
    : DEFAULT_PROVIDER_CAPABILITIES.toolNamePattern;
  if (!toolNamePattern) {
    throw invalidCapabilities('capabilities.toolNamePattern must be non-empty');
  }
  try {
    // eslint-disable-next-line no-new
    new RegExp(toolNamePattern);
  } catch (e) {
    throw invalidCapabilities(`invalid capabilities.toolNamePattern: ${toolNamePattern}`, {
      cause: String((e && e.message) || e)
    });
  }

  const toolCalls = Object.prototype.hasOwnProperty.call(input, 'toolCalls')
    ? !!input.toolCalls
    : DEFAULT_PROVIDER_CAPABILITIES.toolCalls;

  const strictDefault = Object.prototype.hasOwnProperty.call(strictIn, 'default')
    ? !!strictIn.default
    : DEFAULT_PROVIDER_CAPABILITIES.strictTools.default;

  const preserveReasoningContent = Object.prototype.hasOwnProperty.call(input, 'preserveReasoningContent')
    ? !!input.preserveReasoningContent
    : DEFAULT_PROVIDER_CAPABILITIES.preserveReasoningContent;

  return {
    toolCalls,
    strictTools: { default: strictDefault },
    toolNamePattern,
    maxTokensField,
    sampling,
    thinking,
    preserveReasoningContent
  };
}

module.exports = {
  DEFAULT_PROVIDER_CAPABILITIES,
  DEFAULT_TOOL_NAME_PATTERN,
  normalizeProviderCapabilities
};
