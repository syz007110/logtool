const { normalizeProviderCapabilities } = require('../orchestrator/providerCapabilities');

const DEFAULT_TOOL_NAME_PATTERN = '^[a-zA-Z0-9_-]{1,64}$';
/** Reference pattern for Kimi/Moonshot-style tool names (configure via capabilities.toolNamePattern). */
const KIMI_STYLE_TOOL_NAME_PATTERN = '^[a-zA-Z_][a-zA-Z0-9-_]{2,63}$';

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function resolveCaps(provider) {
  return normalizeProviderCapabilities(provider && provider.capabilities);
}

function resolveStrictToolsDefault(provider) {
  const caps = resolveCaps(provider);
  return !!caps.strictTools.default;
}

function resolveToolChoice(provider, toolCount) {
  if (!toolCount || toolCount <= 0) return undefined;
  const configured = String(provider?.orchestrator?.toolChoice || '').trim();
  if (configured) return configured;
  return 'auto';
}

function assertToolNameForProvider(name, provider) {
  const toolName = String(name || '').trim();
  if (!toolName) {
    const err = new Error('tool function name is empty');
    err.code = 'INVALID_TOOL_NAME';
    throw err;
  }

  const caps = resolveCaps(provider);
  const patternRaw = String(caps.toolNamePattern || '').trim();
  const reg = new RegExp(patternRaw);
  if (!reg.test(toolName)) {
    const err = new Error(`tool name does not match provider pattern: ${toolName}`);
    err.code = 'INVALID_TOOL_NAME';
    err.toolName = toolName;
    throw err;
  }
  return toolName;
}

function mapSingleFunctionToolForProvider(tool, provider) {
  const entry = tool && typeof tool === 'object' ? tool : {};
  const fn = asObject(entry.function);
  const name = assertToolNameForProvider(fn.name, provider);
  const strict = resolveStrictToolsDefault(provider);
  const mapped = {
    type: 'function',
    function: {
      name,
      description: String(fn.description || '').trim(),
      parameters: fn.parameters && typeof fn.parameters === 'object' ? fn.parameters : { type: 'object', properties: {} }
    }
  };
  if (strict) {
    mapped.function.strict = true;
  }
  return mapped;
}

/**
 * Map registry-built function tools to provider request body fields.
 * @param {object[]} functionTools
 * @param {object} provider
 */
function mapFunctionToolsForProvider(functionTools, provider) {
  const list = Array.isArray(functionTools) ? functionTools : [];
  const caps = resolveCaps(provider);
  if (caps.toolCalls === false) {
    return { tools: null, tool_choice: undefined, strictDefault: resolveStrictToolsDefault(provider) };
  }

  const tools = list.map((tool) => mapSingleFunctionToolForProvider(tool, provider));
  return {
    tools: tools.length > 0 ? tools : null,
    tool_choice: resolveToolChoice(provider, tools.length),
    strictDefault: resolveStrictToolsDefault(provider)
  };
}

module.exports = {
  mapFunctionToolsForProvider,
  mapSingleFunctionToolForProvider,
  resolveStrictToolsDefault,
  resolveToolChoice,
  assertToolNameForProvider,
  DEFAULT_TOOL_NAME_PATTERN,
  KIMI_STYLE_TOOL_NAME_PATTERN,
  /** @deprecated use DEFAULT_TOOL_NAME_PATTERN */
  DEEPSEEK_TOOL_NAME_PATTERN: new RegExp(DEFAULT_TOOL_NAME_PATTERN),
  /** @deprecated use KIMI_STYLE_TOOL_NAME_PATTERN */
  KIMI_TOOL_NAME_PATTERN: new RegExp(KIMI_STYLE_TOOL_NAME_PATTERN)
};
