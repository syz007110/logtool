const fs = require('fs');
const path = require('path');

const REGISTRY_DIR = path.resolve(__dirname, 'v1');
const REGISTRY_INDEX = path.resolve(REGISTRY_DIR, 'index.json');

let cache = null;

function readJson(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(text);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeContractSlots(contract = {}, summary = {}) {
  const requiredSlots = asArray(contract.requiredSlots).length
    ? asArray(contract.requiredSlots)
    : asArray(contract.required);
  const optionalSlots = asArray(contract.optionalSlots).length
    ? asArray(contract.optionalSlots)
    : asArray(contract.optional);
  const anyOfRequired = asArray(contract.anyOfRequired).length
    ? asArray(contract.anyOfRequired)
    : asArray(summary.anyOfRequired);
  return { requiredSlots, optionalSlots, anyOfRequired };
}

function normalizeTool(tool) {
  const llmSummary = tool?.llmSummary && typeof tool.llmSummary === 'object' ? tool.llmSummary : {};
  const inputContract = tool?.inputContract && typeof tool.inputContract === 'object' ? tool.inputContract : {};
  const slotShape = normalizeContractSlots(inputContract, llmSummary);
  return {
    ...tool,
    toolName: String(tool?.toolName || '').trim(),
    enabled: tool?.enabled !== false,
    intentBindings: asArray(tool?.intentBindings).map((x) => String(x || '').trim()).filter(Boolean),
    llmSummary: {
      ...llmSummary,
      whenToUse: asArray(llmSummary.whenToUse).map((x) => String(x || '').trim()).filter(Boolean),
      requiredSlots: slotShape.requiredSlots,
      optionalSlots: slotShape.optionalSlots,
      anyOfRequired: slotShape.anyOfRequired,
      missingSlotQuestions: llmSummary?.missingSlotQuestions && typeof llmSummary.missingSlotQuestions === 'object'
        ? llmSummary.missingSlotQuestions
        : {}
    },
    inputContract: {
      ...inputContract,
      requiredSlots: slotShape.requiredSlots,
      optionalSlots: slotShape.optionalSlots,
      anyOfRequired: slotShape.anyOfRequired
    }
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
      const tool = normalizeTool(row);
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
    const intentBindings = Array.isArray(tool?.intentBindings) ? tool.intentBindings : [];
    for (const intent of intentBindings) {
      const key = String(intent || '').trim();
      if (!key) continue;
      map.set(key, canonical);
    }
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
