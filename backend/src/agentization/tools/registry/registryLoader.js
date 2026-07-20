const fs = require('fs');
const path = require('path');
const {
  asObject,
  buildLegacyInputContractView,
  getToolRuntime,
  getToolParameters
} = require('./toolRegistrySchema');

const REGISTRY_DIR = path.resolve(__dirname, 'v1');
const REGISTRY_INDEX = path.resolve(REGISTRY_DIR, 'index.json');

let cache = null;

function readJson(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(text);
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function resolveToolDescription(raw, sourceFilePath) {
  const inline = String(raw?.description || '').trim();
  const descriptionFile = String(raw?.descriptionFile || '').trim();
  if (!descriptionFile) return inline;
  const mdPath = path.resolve(path.dirname(sourceFilePath), descriptionFile);
  const external = readText(mdPath).trim();
  if (!inline) return external;
  if (!external) return inline;
  return `${inline}\n\n${external}`.trim();
}

function normalizeTool(raw, sourceFilePath) {
  const runtime = getToolRuntime(raw);
  const parameters = getToolParameters(raw);
  const security = asObject(raw.security);
  const inputContract = buildLegacyInputContractView({
    parameters,
    runtime
  });

  return {
    ...raw,
    toolName: String(raw?.toolName || '').trim(),
    displayName: String(raw?.displayName || raw?.toolName || '').trim(),
    enabled: raw.enabled !== false,
    description: resolveToolDescription(raw, sourceFilePath),
    parameters,
    runtime,
    security,
    execution: runtime.execution,
    inputContract
  };
}

function loadToolRegistry({ forceReload = false } = {}) {
  if (cache && !forceReload) return cache;
  const index = readJson(REGISTRY_INDEX);
  const refs = asArray(index?.tools);
  const tools = [];

  for (const ref of refs) {
    const rel = String(ref || '').trim();
    if (!rel) continue;
    const filePath = path.resolve(REGISTRY_DIR, rel);
    const doc = readJson(filePath);
    const rows = asArray(doc?.tools);
    for (const row of rows) {
      const tool = normalizeTool(row, filePath);
      if (!tool.toolName) continue;
      tools.push(tool);
    }
  }

  const byName = new Map(tools.map((tool) => [tool.toolName, tool]));
  cache = {
    registryVersion: String(index?.registryVersion || 'v1'),
    tools,
    byName,
    loadedAt: Date.now()
  };
  return cache;
}

function getEnabledTools(registry) {
  const resolved = registry && typeof registry === 'object' ? registry : loadToolRegistry();
  return asArray(resolved.tools).filter((tool) => tool && tool.enabled !== false);
}

function getAllowedToolNames(registry) {
  return new Set(getEnabledTools(registry).map((tool) => tool.toolName));
}

function buildToolNameMap(registry) {
  const resolved = registry && typeof registry === 'object' ? registry : loadToolRegistry();
  const map = new Map();
  for (const tool of getEnabledTools(resolved)) {
    const canonical = String(tool?.toolName || '').trim();
    if (!canonical) continue;
    map.set(canonical, canonical);
  }
  return map;
}

function resolveToolName(rawName, registry) {
  const key = String(rawName || '').trim();
  if (!key) return null;
  const map = buildToolNameMap(registry);
  return map.get(key) || null;
}

module.exports = {
  loadToolRegistry,
  getEnabledTools,
  getAllowedToolNames,
  resolveToolName
};
