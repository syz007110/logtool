const { loadToolRegistry, getEnabledTools } = require('./registryLoader');

function slotTypeBrief(prop = {}) {
  const type = Array.isArray(prop?.type) ? prop.type.join('|') : String(prop?.type || '').trim();
  if (type) return type;
  if (Array.isArray(prop?.enum) && prop.enum.length > 0) return 'enum';
  return 'unknown';
}

function buildToolPromptLines(tool, index) {
  const summary = tool?.llmSummary && typeof tool.llmSummary === 'object' ? tool.llmSummary : {};
  const contract = tool?.inputContract && typeof tool.inputContract === 'object' ? tool.inputContract : {};
  const properties = contract?.properties && typeof contract.properties === 'object' ? contract.properties : {};
  const lines = [];
  lines.push(`${index + 1}. ${tool.toolName}`);
  lines.push(`- 用途：${String(tool?.description || '').trim() || '未提供'}`);

  // llmSummary.whenToUse 存放用户侧快捷命令（如 /foo），不注入意图模型，避免与 description 重复

  const requiredSlots = Array.isArray(summary.requiredSlots) ? summary.requiredSlots : [];
  const anyOfRequired = Array.isArray(summary.anyOfRequired) ? summary.anyOfRequired : [];
  const optionalSlots = Array.isArray(summary.optionalSlots) ? summary.optionalSlots : [];
  lines.push(`- requiredSlots：${requiredSlots.length > 0 ? requiredSlots.join(', ') : '(none)'}`);
  if (anyOfRequired.length > 0) {
    const groups = anyOfRequired
      .filter((x) => Array.isArray(x) && x.length > 0)
      .map((x) => `[${x.join(' | ')}]`)
      .join('; ');
    lines.push(`- anyOfRequired：${groups || '(none)'}`);
  }
  lines.push(`- optionalSlots：${optionalSlots.length > 0 ? optionalSlots.join(', ') : '(none)'}`);

  const propNames = Object.keys(properties);
  if (propNames.length > 0) {
    lines.push('- 参数类型：');
    for (const key of propNames) {
      const prop = properties[key] || {};
      const type = slotTypeBrief(prop);
      const desc = String(prop.description || '').trim();
      lines.push(`  - ${key}: ${type}${desc ? ` (${desc})` : ''}`);
    }
  }
  return lines;
}

function buildIntentToolPrompt() {
  const registry = loadToolRegistry();
  const tools = getEnabledTools(registry);
  const lines = [];
  lines.push('你不能直接调用工具，只能判断是否需要调用工具，并给出建议。');
  lines.push('可用工具如下：');
  tools.forEach((tool, index) => {
    lines.push(...buildToolPromptLines(tool, index));
  });
  if (tools.length > 0) {
    lines.push(`当 shouldCallTool=true 时，toolName 必须填写上述工具名称之一：${tools.map((x) => x.toolName).join(' | ')}。`);
  } else {
    lines.push('当前没有可用工具；shouldCallTool 必须为 false，toolName 必须为 null。');
  }
  return {
    toolPrompt: lines.join('\n'),
    toolNames: tools.map((tool) => tool.toolName),
    registryVersion: registry.registryVersion
  };
}

module.exports = {
  buildIntentToolPrompt
};
