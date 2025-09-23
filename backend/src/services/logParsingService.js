const errorCodeCache = require('./errorCodeCache');
const { optimizedExplanationParser } = require('../utils/optimizedExplanationParser');

/**
 * 确保故障码缓存已就绪
 */
let parserInitialized = false;
async function ensureCacheReady() {
  const t0 = Date.now();
  await errorCodeCache.loadAllErrorCodes();
  console.log(`⏱️ 故障码缓存预热耗时: ${Date.now() - t0}ms`);
  if (!parserInitialized && typeof optimizedExplanationParser?.initialize === 'function') {
    const t1 = Date.now();
    await optimizedExplanationParser.initialize();
    console.log(`⏱️ 解析器初始化耗时: ${Date.now() - t1}ms`);
    parserInitialized = true;
  }
}

/**
 * 从错误码字符串中解析子系统与标准故障码
 * @param {string} errorCodeStr
 * @returns {{ subsystem: string|null, code: string|null, arm: string|null, joint: string|null }}
 */
function parseSubsystemAndCode(errorCodeStr) {
  if (!errorCodeStr || typeof errorCodeStr !== 'string') {
    return { subsystem: null, code: null, arm: null, joint: null };
  }
  const s = String(errorCodeStr).trim().toUpperCase();
  const subsystem = s.length >= 1 ? s.charAt(0) : null;
  const arm = s.length >= 2 ? s.charAt(1) : null;
  const joint = s.length >= 3 ? s.charAt(2) : null;
  let code = null;
  if (s.length >= 5) {
    code = '0X' + s.slice(-4).toUpperCase();
  }
  return { subsystem, code, arm, joint };
}

/**
 * 获取释义模板（优先缓存）
 * @param {string|null} subsystem
 * @param {string|null} code
 * @param {string} fallbackTemplate
 * @returns {string}
 */
function getExplanationTemplate(subsystem, code, fallbackTemplate = '') {
  if (subsystem && code) {
    const rec = errorCodeCache.findErrorCode(subsystem, code);
    if (rec && typeof rec.explanation === 'string' && rec.explanation.length > 0) {
      return rec.explanation;
    }
  }
  return fallbackTemplate || '';
}

/**
 * 基于已解密条目生成最终释义
 * @param {Object} decodedEntry - 包含 error_code, param1..param4, timestamp 等
 * @returns {{ explanation: string, context: object, template: string }}
 */
function renderEntryExplanation(decodedEntry) {
  const { error_code, param1, param2, param3, param4 } = decodedEntry || {};
  const { subsystem, code, arm, joint } = parseSubsystemAndCode(error_code || '');

  const template = getExplanationTemplate(subsystem, code, decodedEntry?.explanation || '');

  const context = {
    error_code,
    subsystem,
    arm: arm || null,
    joint: joint || null
  };

  const rendered = optimizedExplanationParser.parseExplanation(
    template,
    [param1, param2, param3, param4],
    context
  );

  return { explanation: rendered, context, template };
}

/**
 * 解析一批条目的释义
 * @param {Array<Object>} entries
 * @returns {Array<Object>} 新条目（仅替换 explanation 字段，不改变其他字段）
 */
function renderEntriesExplanations(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  return entries.map(e => {
    const { explanation } = renderEntryExplanation(e);
    return { ...e, explanation };
  });
}

module.exports = {
  ensureCacheReady,
  parseSubsystemAndCode,
  getExplanationTemplate,
  renderEntryExplanation,
  renderEntriesExplanations
};


