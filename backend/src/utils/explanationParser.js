const fs = require('fs');
const path = require('path');

// 加载转义表
const faultMappingsPath = path.join(__dirname, '../config/FaultMappings.json');
let faultMappings = null;

function loadFaultMappings() {
  if (!faultMappings) {
    try {
      const mappingsContent = fs.readFileSync(faultMappingsPath, 'utf-8');
      faultMappings = JSON.parse(mappingsContent);
    } catch (error) {
      console.error('加载转义表失败:', error);
      faultMappings = {};
    }
  }
  return faultMappings;
}

/**
 * 解析释义语句中的占位符
 * @param {string} explanation - 原始释义语句
 * @param {number} param0 - 参数0的值
 * @param {number} param1 - 参数1的值
 * @param {number} param2 - 参数2的值
 * @param {number} param3 - 参数3的值
 * @returns {string} - 解析后的释义语句
 */
function parseExplanation(explanation, param0, param1, param2, param3) {
  if (!explanation) {
    return '';
  }

  const mappings = loadFaultMappings();
  const params = [param0, param1, param2, param3];

  // 匹配 {i:d} 格式的占位符
  // i 是参数索引（0-3），d 是转义表下标
  const placeholderRegex = /\{(\d+):(\d+)\}/g;
  
  let result = explanation;
  let match;

  while ((match = placeholderRegex.exec(explanation)) !== null) {
    const fullMatch = match[0]; // 完整的匹配，如 {2:2}
    const paramIndex = parseInt(match[1]); // 参数索引，如 2
    const mappingIndex = parseInt(match[2]); // 转义表下标，如 2

    // 获取参数值
    const paramValue = params[paramIndex];
    
    let replacement = '';

    if (mappingIndex === 0) {
      // d=0 时按照纯物理量转义，直接使用参数值
      replacement = paramValue !== undefined && paramValue !== null ? paramValue.toString() : '';
    } else {
      // 从转义表中查找对应的值
      const mappingTable = mappings[mappingIndex.toString()];
      if (mappingTable && paramValue !== undefined && paramValue !== null) {
        replacement = mappingTable[paramValue.toString()] || paramValue.toString();
      } else {
        replacement = paramValue !== undefined && paramValue !== null ? paramValue.toString() : '';
      }
    }

    // 替换占位符
    result = result.replace(fullMatch, replacement);
  }

  return result;
}

/**
 * 批量解析释义语句
 * @param {Array} entries - 日志条目数组，每个条目包含 explanation, param1, param2, param3, param4
 * @returns {Array} - 解析后的日志条目数组
 */
function parseExplanations(entries) {
  return entries.map(entry => {
    // 根据需求，{i:d} 中的 i 是参数索引，从0开始
    // {0:d} 对应 param1, {1:d} 对应 param2, {2:d} 对应 param3, {3:d} 对应 param4
    const parsedExplanation = parseExplanation(
      entry.explanation,
      entry.param1, // 参数0
      entry.param2, // 参数1
      entry.param3, // 参数2
      entry.param4  // 参数3
    );

    return {
      ...entry,
      explanation: parsedExplanation
    };
  });
}

module.exports = {
  parseExplanation,
  parseExplanations,
  loadFaultMappings
}; 