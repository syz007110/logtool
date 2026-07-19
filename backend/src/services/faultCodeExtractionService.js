const zhBundle = require('../locales/zh/translation.json');
const enBundle = require('../locales/en/translation.json');
const { deriveFromFullLogCode } = require('../utils/explanationPreview');

function normalizeTypeCode(input) {
  const raw = String(input ?? '').trim().toUpperCase();
  if (!raw) return '';
  if (/^(?:0X)?[0-9A-F]{3}[A-E]$/.test(raw)) {
    return raw.startsWith('0X') ? raw : `0X${raw}`;
  }
  return '';
}

function normalizeErrorCodeInput(input) {
  const raw = String(input ?? '').trim().toUpperCase();
  if (!raw) return '';
  const asType = normalizeTypeCode(raw);
  if (asType) return asType;
  const extracted = extractFaultCodesFromText(raw);
  if (Array.isArray(extracted.typeCodes) && extracted.typeCodes.length > 0) {
    return String(extracted.typeCodes[0] || '').trim().toUpperCase();
  }
  return '';
}

/** 与故障码查询规则一致：句中若有完整码优先取完整码，否则取类型码；供 planner/tool 参数兜底，避免把完整码压成仅有类型码。 */
function resolveAgentFaultCodeToken(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  const s = raw.toUpperCase();
  const { fullCodes, typeCodes } = extractFaultCodesFromText(s);
  if (fullCodes.length > 0) return fullCodes[0];
  if (typeCodes.length > 0) return typeCodes[0];
  return normalizeTypeCode(s) || '';
}

function extractFaultCodesFromText(query) {
  const s = String(query || '').trim().toUpperCase();
  const fullRe = /[1-9A][0-9A-F]{5}[A-E]/g;
  const typeRe = /(?:0X)?[0-9A-F]{3}[A-E]/g;

  const fullCodes = [];
  const fullSeen = new Set();
  for (const m of s.matchAll(fullRe)) {
    const v = String(m[0] || '').trim().toUpperCase();
    if (!v) continue;
    if (fullSeen.has(v)) continue;
    fullSeen.add(v);
    fullCodes.push(v);
    if (fullCodes.length >= 3) break;
  }

  const typeCodes = [];
  const typeSeen = new Set();

  for (const fc of fullCodes) {
    const tail4 = fc.slice(-4);
    const norm = normalizeTypeCode(tail4);
    if (norm && !typeSeen.has(norm)) {
      typeSeen.add(norm);
      typeCodes.push(norm);
    }
  }

  for (const m of s.matchAll(typeRe)) {
    const norm = normalizeTypeCode(m[0]);
    if (!norm) continue;
    if (typeSeen.has(norm)) continue;
    typeSeen.add(norm);
    typeCodes.push(norm);
    if (typeCodes.length >= 6) break;
  }

  return { fullCodes, typeCodes };
}

/** 子系统标签：仅根据子系统号映射名称，不包含 arm/joint，不替代完整前缀渲染。 */
function resolveSubsystemLabel(subsystemChar, language) {
  const key = String(subsystemChar || '').trim().toUpperCase();
  if (!/^[1-9A]$/.test(key)) return '';
  const lng = String(language || 'zh-CN').toLowerCase().startsWith('en') ? 'en' : 'zh';
  const bundle = lng === 'en' ? enBundle : zhBundle;
  const map = bundle.shared?.subsystemOptions || {};
  return String(map[key] || '').trim();
}

/** 用户句中若含完整故障码，取首条完整码的子系统标签；否则返回空串。 */
function extractSubsystemLabelFromUserText(text, language) {
  const { fullCodes } = extractFaultCodesFromText(text);
  if (!Array.isArray(fullCodes) || fullCodes.length === 0) return '';
  const parsed = deriveFromFullLogCode(fullCodes[0]);
  return resolveSubsystemLabel(parsed.subsystem, language);
}

// 兼容旧命名：这里返回的是“子系统标签”，不是完整前缀。
const resolveSubsystemPrefixLabel = resolveSubsystemLabel;
const extractSubsystemPrefixFromUserText = extractSubsystemLabelFromUserText;

module.exports = {
  normalizeTypeCode,
  normalizeErrorCodeInput,
  resolveAgentFaultCodeToken,
  extractFaultCodesFromText,
  resolveSubsystemLabel,
  extractSubsystemLabelFromUserText,
  resolveSubsystemPrefixLabel,
  extractSubsystemPrefixFromUserText
};
