const { loadToolRegistry, getEnabledTools } = require('./registry/registryLoader');
const {
  getToolParameters,
  getToolRuntime,
  validateArgumentsAgainstParameters,
  buildParametersFromLegacyInputContract
} = require('./registry/toolRegistrySchema');

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function pickLangKey(lang) {
  const s = String(lang || 'zh').trim().toLowerCase();
  return s.startsWith('en') ? 'en' : 'zh';
}

function cloneParameters(parameters) {
  return JSON.parse(JSON.stringify(asObject(parameters)));
}

function composeToolDescription(tool) {
  return String(tool?.description || '').trim();
}

function normalizeChannelType(channelType) {
  return String(channelType || '').trim().toLowerCase();
}

function toolAllowsPermissionBypassForChannel(tool, channelType) {
  const normalized = normalizeChannelType(channelType);
  if (!normalized) return false;
  const channels = Array.isArray(tool?.security?.permissionBypassChannels)
    ? tool.security.permissionBypassChannels
    : [];
  return channels.some((item) => normalizeChannelType(item) === normalized);
}

function toolAllowedForPermissions(tool, userPermissions, channelType) {
  if (toolAllowsPermissionBypassForChannel(tool, channelType)) return true;
  const requiredPermission = String(tool?.security?.requiredPermissions?.[0] || '').trim();
  if (!requiredPermission) return true;
  const perms = Array.isArray(userPermissions)
    ? new Set(userPermissions.map((x) => String(x || '').trim()).filter(Boolean))
    : null;
  if (!perms) return true;
  return perms.has(requiredPermission);
}

function registryToolToFunctionTool(tool) {
  const name = String(tool?.toolName || '').trim();
  if (!name) return null;
  const parameters = cloneParameters(getToolParameters(tool));
  if (!parameters.type) parameters.type = 'object';
  return {
    type: 'function',
    function: {
      name,
      description: composeToolDescription(tool),
      parameters
    }
  };
}

/**
 * Build OpenAI-compatible function tools from registry/v1.
 * @param {{ userPermissions?: string[], lang?: string, registry?: object }} [options]
 */
function buildFunctionToolsFromRegistry(options = {}) {
  const registry = options.registry && typeof options.registry === 'object'
    ? options.registry
    : loadToolRegistry();
  const userPermissions = options.userPermissions;
  const channelType = options.channelType;

  const tools = getEnabledTools(registry)
    .filter((tool) => toolAllowedForPermissions(tool, userPermissions, channelType))
    .map((tool) => registryToolToFunctionTool(tool))
    .filter(Boolean);

  return {
    tools,
    toolNames: tools.map((t) => t.function.name),
    registryVersion: String(registry.registryVersion || 'v1')
  };
}

/** @deprecated use registry parameters directly */
function contractToJsonSchemaParameters(inputContract = {}) {
  return buildParametersFromLegacyInputContract(inputContract);
}

module.exports = {
  contractToJsonSchemaParameters,
  composeToolDescription,
  buildFunctionToolsFromRegistry,
  registryToolToFunctionTool,
  toolAllowedForPermissions,
  toolAllowsPermissionBypassForChannel
};
