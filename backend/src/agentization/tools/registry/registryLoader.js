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
  /** 槽位以 inputContract 为准；仅当契约未写 anyOf 时回退 llmSummary（兼容旧条目） */
  const anyOfRequired = asArray(contract.anyOfRequired).length
    ? asArray(contract.anyOfRequired)
    : asArray(summary.anyOfRequired);
  return { requiredSlots, optionalSlots, anyOfRequired };
}

/** inputContract.properties 为执行/校验真源；llmSummary.properties 仅可覆盖同名键的局部字段（如 description） */
function mergeLlmSummaryProperties(contractProps, summaryPropsRaw) {
  const overlay = summaryPropsRaw && typeof summaryPropsRaw === 'object' ? summaryPropsRaw : {};
  const hasOverlay = Object.keys(overlay).length > 0;
  const out = {};
  for (const k of Object.keys(contractProps)) {
    const base = contractProps[k] && typeof contractProps[k] === 'object' ? { ...contractProps[k] } : {};
    if (!hasOverlay) {
      out[k] = base;
      continue;
    }
    const over = overlay[k] && typeof overlay[k] === 'object' ? overlay[k] : {};
    out[k] = Object.keys(over).length > 0 ? { ...base, ...over } : { ...base };
  }
  return out;
}

function normalizeTool(tool) {
  const llmSummaryRaw = tool?.llmSummary && typeof tool.llmSummary === 'object' ? tool.llmSummary : {};
  const inputContract = tool?.inputContract && typeof tool.inputContract === 'object' ? tool.inputContract : {};
  const slotShape = normalizeContractSlots(inputContract, llmSummaryRaw);

  const contractProps = inputContract.properties && typeof inputContract.properties === 'object' ? inputContract.properties : {};
  const summaryPropsRaw = llmSummaryRaw.properties && typeof llmSummaryRaw.properties === 'object' ? llmSummaryRaw.properties : {};
  const llmSummaryProperties = mergeLlmSummaryProperties(contractProps, summaryPropsRaw);

  return {
    ...tool,
    toolName: String(tool?.toolName || '').trim(),
    enabled: tool.enabled !== false,
    intentBindings: asArray(tool?.intentBindings).map((x) => String(x || '').trim()).filter(Boolean),
    llmSummary: {
      whenToUse: asArray(llmSummaryRaw.whenToUse).map((x) => String(x || '').trim()).filter(Boolean),
      requiredSlots: slotShape.requiredSlots,
      optionalSlots: slotShape.optionalSlots,
      anyOfRequired: slotShape.anyOfRequired,
      properties: llmSummaryProperties,
      missingSlotQuestions: llmSummaryRaw?.missingSlotQuestions && typeof llmSummaryRaw.missingSlotQuestions === 'object'
        ? llmSummaryRaw.missingSlotQuestions
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
