const smartSearchPrompts = require('../../../config/smartSearchPrompts.json');
const { loadToolRegistry, getEnabledTools } = require('./registryLoader');

function slotTypeBrief(prop = {}) {
  const type = Array.isArray(prop?.type) ? prop.type.join('|') : String(prop?.type || '').trim();
  if (type) return type;
  if (Array.isArray(prop?.enum) && prop.enum.length > 0) return 'enum';
  return 'unknown';
}

/** 把注册表中的枚举/正则缩进进 LLM 可见的 tool 段，减少瞎填 */
function formatPropertyConstraints(prop) {
  if (!prop || typeof prop !== 'object') return '';
  const bits = [];
  if (Array.isArray(prop.enum) && prop.enum.length > 0) {
    bits.push(`enum=${prop.enum.join('|')}`);
  }
  const pat = String(prop.pattern || '').trim();
  if (pat) bits.push(`pattern=${pat}`);
  return bits.length ? ` [${bits.join('; ')}]` : '';
}

function resolveIntentCatalogLang(lang) {
  const s = String(lang ?? 'zh').trim().toLowerCase();
  return s.startsWith('en') ? 'en' : 'zh';
}

/** 每条工具与目录收尾文案在代码中；JSON 仅 beforeCatalog */
const TOOL_ENTRY_RENDER = {
  zh: {
    emptyDescription: '未提供',
    emptyList: '(none)',
    slotSep: ', ',
    anyIn: '，',
    anyGrp: '; ',
    allowedSep: ' | ',
    lineEntry(n, toolName) {
      return `${n} . ${toolName}`;
    },
    linePurpose(description) {
      return `用途：${description}`;
    },
    lineRequired(value) {
      return `- requiredSlots：${value}`;
    },
    lineAnyOf(value) {
      return `- anyOfRequired：${value}`;
    },
    lineOptional(value) {
      return `- optionalSlots：${value}`;
    },
    headerParams: '- 参数（properties）：',
    lineParamWithDesc(key, type, desc) {
      return `  - ${key}: ${type} (${desc})`;
    },
    lineParam(key, type) {
      return `  - ${key}: ${type}`;
    },
    afterHasTools(allowedToolNamesJoined) {
      return `当 shouldCallTool=true 时，toolName 必须填写上述工具名称之一：${allowedToolNamesJoined}。`;
    },
    afterNoTools: '当前没有可用工具；shouldCallTool 必须为 false，toolName 必须为 null。'
  },
  en: {
    emptyDescription: 'not provided',
    emptyList: '(none)',
    slotSep: ', ',
    anyIn: ' | ',
    anyGrp: '; ',
    allowedSep: ' | ',
    lineEntry(n, toolName) {
      return `${n} . ${toolName}`;
    },
    linePurpose(description) {
      return `Purpose: ${description}`;
    },
    lineRequired(value) {
      return `- requiredSlots: ${value}`;
    },
    lineAnyOf(value) {
      return `- anyOfRequired: ${value}`;
    },
    lineOptional(value) {
      return `- optionalSlots: ${value}`;
    },
    headerParams: '- Parameters (properties):',
    lineParamWithDesc(key, type, desc) {
      return `  - ${key}: ${type} (${desc})`;
    },
    lineParam(key, type) {
      return `  - ${key}: ${type}`;
    },
    afterHasTools(allowedToolNamesJoined) {
      return `When shouldCallTool=true, toolName MUST be one of: ${allowedToolNamesJoined}.`;
    },
    afterNoTools: 'No tools are available; shouldCallTool MUST be false and toolName MUST be null.'
  }
};

function getIntentToolCatalog(lang) {
  const byLang = smartSearchPrompts?.conversationIntentExtractionByLang || {};
  const key = resolveIntentCatalogLang(lang);
  const catalog = byLang[key]?.intentToolCatalog || byLang.zh?.intentToolCatalog;
  if (!catalog || typeof catalog !== 'object') {
    throw new Error('smartSearchPrompts.conversationIntentExtractionByLang.*.intentToolCatalog is required');
  }
  const render = TOOL_ENTRY_RENDER[key] || TOOL_ENTRY_RENDER.zh;
  return { catalog, render };
}

function buildToolPromptLines(tool, index, render) {
  const summary = tool?.llmSummary && typeof tool.llmSummary === 'object' ? tool.llmSummary : {};
  const contract = tool?.inputContract && typeof tool.inputContract === 'object' ? tool.inputContract : {};
  const summaryProps = summary?.properties && typeof summary.properties === 'object' ? summary.properties : {};
  const contractProps = contract?.properties && typeof contract.properties === 'object' ? contract.properties : {};
  const properties = Object.keys(summaryProps).length > 0 ? summaryProps : contractProps;
  const requiredSlots = Array.isArray(summary.requiredSlots) ? summary.requiredSlots : [];
  const anyOfRequired = Array.isArray(summary.anyOfRequired) ? summary.anyOfRequired : [];
  const optionalSlots = Array.isArray(summary.optionalSlots) ? summary.optionalSlots : [];

  const { slotSep, anyIn, anyGrp, emptyList, emptyDescription } = render;

  const n = String(index + 1);
  const emptyM = emptyList;
  const desc = String(tool?.description || '').trim();
  const description = desc || emptyDescription;

  const lines = [];
  lines.push(render.lineEntry(n, tool.toolName));
  lines.push(render.linePurpose(description));

  lines.push(render.lineRequired(requiredSlots.length > 0 ? requiredSlots.join(slotSep) : emptyM));

  if (anyOfRequired.length > 0) {
    const groups = anyOfRequired
      .filter((x) => Array.isArray(x) && x.length > 0)
      .map((x) => `[${x.join(anyIn)}]`)
      .join(anyGrp);
    lines.push(render.lineAnyOf(groups || emptyM));
  }

  lines.push(render.lineOptional(optionalSlots.length > 0 ? optionalSlots.join(slotSep) : emptyM));

  const propNames = Object.keys(properties);
  if (propNames.length > 0) {
    lines.push(render.headerParams);
    for (const key of propNames) {
      const prop = properties[key] || {};
      const type = slotTypeBrief(prop);
      const constraint = formatPropertyConstraints(prop);
      const pDesc = String(prop.description || '').trim();
      if (pDesc) {
        lines.push(render.lineParamWithDesc(key, type, pDesc) + constraint);
      } else {
        lines.push(render.lineParam(key, type) + constraint);
      }
    }
  }
  return lines;
}

/**
 * @param {{ lang?: string }} [options]
 */
function buildIntentToolPrompt(options = {}) {
  const { catalog, render } = getIntentToolCatalog(options.lang);
  const registry = loadToolRegistry();
  const tools = getEnabledTools(registry);
  const chunks = [];
  const before = catalog.beforeCatalog;
  if (Array.isArray(before)) {
    for (const line of before) chunks.push(String(line));
  }
  tools.forEach((tool, index) => {
    chunks.push(...buildToolPromptLines(tool, index, render));
  });
  if (tools.length > 0) {
    chunks.push(render.afterHasTools(tools.map((x) => x.toolName).join(render.allowedSep)));
  } else {
    chunks.push(render.afterNoTools);
  }
  return {
    toolPrompt: chunks.join('\n'),
    toolNames: tools.map((tool) => tool.toolName),
    registryVersion: registry.registryVersion
  };
}

module.exports = {
  buildIntentToolPrompt
};
