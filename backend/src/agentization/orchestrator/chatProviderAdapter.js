const { mapFunctionToolsForProvider } = require('../tools/toolProviderAdapter');
const { normalizeProviderCapabilities } = require('./providerCapabilities');

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function clampInt(n, min, max, fallback) {
  const v = Number.parseInt(String(n ?? ''), 10);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(Math.max(v, min), max);
}

function resolveMaxTokens(provider) {
  const raw = provider?.orchestratorMaxTokens
    ?? provider?.maxTokens
    ?? process.env.AGENT_ORCHESTRATOR_LLM_MAX_TOKENS
    ?? '4096';
  return clampInt(raw, 256, 16384, 4096);
}

/**
 * Canonical ChatCompletionRequest → provider HTTP body (capabilities-driven).
 */
function adaptChatCompletionRequest(chatRequest, provider) {
  const req = asObject(chatRequest);
  const caps = normalizeProviderCapabilities(provider?.capabilities);
  const mappedTools = mapFunctionToolsForProvider(req.tools, {
    ...provider,
    capabilities: caps
  });

  const body = {
    model: String(provider?.model || req.model || '').trim(),
    messages: Array.isArray(req.messages) ? req.messages : [],
    stream: false
  };

  if (caps.sampling === 'send') {
    body.temperature = provider?.temperature ?? req.temperature ?? 0;
    body.top_p = provider?.top_p ?? provider?.topP ?? req.top_p ?? 0.1;
  }

  const maxTokens = resolveMaxTokens(provider);
  body[caps.maxTokensField] = maxTokens;

  if (caps.thinking != null) {
    body.thinking = { ...caps.thinking };
  }

  if (mappedTools.tools) {
    body.tools = mappedTools.tools;
    body.tool_choice = mappedTools.tool_choice || req.tool_choice || 'auto';
  }

  if (req.stop != null) body.stop = req.stop;

  return { body, mappedTools, capabilities: caps };
}

module.exports = {
  adaptChatCompletionRequest,
  resolveMaxTokens
};
