const { mapFunctionToolsForProvider } = require('../tools/toolProviderAdapter');

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

function isKimiProvider(provider) {
  const id = String(provider?.id || '').toLowerCase();
  const baseUrl = String(provider?.baseUrl || '').toLowerCase();
  return id.includes('kimi') || id.includes('moonshot') || baseUrl.includes('moonshot');
}

/**
 * Canonical ChatCompletionRequest → provider HTTP body (strip extensions).
 */
function adaptChatCompletionRequest(chatRequest, provider) {
  const req = asObject(chatRequest);
  const mappedTools = mapFunctionToolsForProvider(req.tools, provider);
  const body = {
    model: String(provider?.model || req.model || '').trim(),
    messages: Array.isArray(req.messages) ? req.messages : [],
    temperature: provider?.temperature ?? req.temperature ?? 0,
    top_p: provider?.top_p ?? provider?.topP ?? req.top_p ?? 0.1,
    stream: false
  };

  const maxTokens = resolveMaxTokens(provider);
  if (isKimiProvider(provider)) {
    body.max_completion_tokens = maxTokens;
  } else {
    body.max_tokens = maxTokens;
  }

  if (mappedTools.tools) {
    body.tools = mappedTools.tools;
    body.tool_choice = mappedTools.tool_choice || req.tool_choice || 'auto';
  }

  if (req.stop != null) body.stop = req.stop;

  return { body, mappedTools };
}

module.exports = {
  adaptChatCompletionRequest,
  resolveMaxTokens,
  isKimiProvider
};
