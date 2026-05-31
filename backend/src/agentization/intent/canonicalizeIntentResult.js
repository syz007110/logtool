const { normalizeConversationIntentResult } = require('../../services/qwenService');

/** 路由层附加字段（非 LLM JSON 一部分），持久化 debug 可保留在整条 intentResult 上 */
const ROUTER_METADATA_KEYS = new Set(['llmRaw', 'raw', 'model', 'provider', 'messages', 'toolCatalog']);

function stripRouterMetadata(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const out = { ...obj };
  for (const k of ROUTER_METADATA_KEYS) delete out[k];
  return out;
}

/**
 * 规划 / planInputContext / 会话链路共用的结构化意图：与 system + [tool] 约束的**同一顶层 JSON** 同形。
 *
 * @param {object} rawIntent intentResult（可含 llmRaw 等；或测试用残缺对象）
 * @param {{ fallbackLanguage?: string }} [options]
 */
function canonicalizeIntentResultForPipeline(rawIntent, options = {}) {
  const plain = stripRouterMetadata(rawIntent);
  return normalizeConversationIntentResult(plain, options);
}

module.exports = {
  ROUTER_METADATA_KEYS,
  stripRouterMetadata,
  canonicalizeIntentResultForPipeline
};
