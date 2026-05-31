const { loadToolRegistry } = require('../tools/registry/registryLoader');
const { resolveAgentFaultCodeToken } = require('../../services/faultCodeExtractionService');

function toText(v) {
  return String(v == null ? '' : v).trim();
}

function inputContractPropertyKeys(tool) {
  const props = tool?.inputContract?.properties;
  if (!props || typeof props !== 'object') return [];
  return Object.keys(props).map((k) => String(k || '').trim()).filter(Boolean);
}

/** 与 error_code_lookup 注册表 subsystem.pattern 一致 */
const SUBSYSTEM_CHAR_PATTERN = /^[1-9A]$/;

function normalizeSubsystemToken(raw) {
  const u = String(raw == null ? '' : raw).trim().toUpperCase();
  if (!u) return null;
  if (SUBSYSTEM_CHAR_PATTERN.test(u)) return u;
  if (u.length > 1) {
    const c = u.charAt(0);
    if (SUBSYSTEM_CHAR_PATTERN.test(c)) return c;
  }
  return null;
}

function normalizeOutValueForKey(key, val) {
  if (val == null) return null;
  if (typeof val === 'object' && !Array.isArray(val)) return val;
  if (Array.isArray(val)) return val;
  const s = String(val).trim();
  if (!s) return null;
  if (key === 'subsystem') return normalizeSubsystemToken(s);
  if (key === 'errorCode') {
    const tok = resolveAgentFaultCodeToken(s);
    return tok || s || null;
  }
  return s;
}

/**
 * 从规划器 toolCall 信封装配工具入参（键集来自注册表 inputContract.properties）：
 * 取值优先级：toolSlots.values → confirmedSlots → entities；
 * 再填 envelope.language（先于 defaultable，以便覆盖默认 zh-CN）；
 * 再应用 defaultable；最后用用户句补 errorCode/keywords 并互斥处理。
 */
function buildToolArgumentsFromSlotEnvelope(envelope) {
  const registry = loadToolRegistry();
  const toolName = String(envelope?.toolName || '').trim();
  const tool = registry.byName.get(toolName);
  const propertyKeys = inputContractPropertyKeys(tool);
  if (propertyKeys.length === 0) return {};

  const props = tool?.inputContract?.properties || {};
  const slotVals = envelope?.toolSlots?.values && typeof envelope.toolSlots.values === 'object'
    ? envelope.toolSlots.values
    : {};
  const entities = envelope?.entities && typeof envelope.entities === 'object' ? envelope.entities : {};
  const confirmed = envelope?.confirmedSlots && typeof envelope.confirmedSlots === 'object'
    ? envelope.confirmedSlots
    : {};
  const query = toText(envelope?.userMessageText);

  const out = {};
  for (const key of propertyKeys) {
    let v = slotVals[key];
    if (v === undefined || v === null || (typeof v !== 'object' && toText(v) === '')) {
      v = confirmed[key];
    }
    if (v === undefined || v === null || (typeof v !== 'object' && toText(v) === '')) {
      v = entities[key];
    }
    out[key] = normalizeOutValueForKey(key, v);
  }

  if (propertyKeys.includes('language')) {
    const fromEnv = toText(envelope.language);
    if (fromEnv && (out.language == null || toText(out.language) === '')) {
      out.language = fromEnv;
    }
  }

  const defaultable = tool?.inputContract?.defaultable && typeof tool.inputContract.defaultable === 'object'
    ? tool.inputContract.defaultable
    : {};
  for (const [k, defVal] of Object.entries(defaultable)) {
    if (!propertyKeys.includes(k)) continue;
    if (out[k] == null || (typeof out[k] !== 'object' && toText(out[k]) === '')) {
      out[k] = defVal;
    }
  }

  if (propertyKeys.includes('errorCode')) {
    const extracted = resolveAgentFaultCodeToken(query);
    if ((out.errorCode == null || toText(out.errorCode) === '') && extracted) {
      out.errorCode = extracted;
    }
  }
  if (propertyKeys.includes('keywords')) {
    const hasCode = out.errorCode != null && toText(out.errorCode) !== '';
    if (!hasCode && (out.keywords == null || toText(out.keywords) === '') && query) {
      out.keywords = query;
    }
  }
  if (propertyKeys.includes('errorCode') && propertyKeys.includes('keywords')) {
    if (out.errorCode != null && toText(out.errorCode) !== '') out.keywords = null;
  }

  const final = {};
  for (const key of propertyKeys) {
    if (out[key] !== undefined) final[key] = out[key];
  }
  return final;
}

module.exports = { buildToolArgumentsFromSlotEnvelope, inputContractPropertyKeys };
