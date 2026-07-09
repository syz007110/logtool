const ErrorCode = require('../models/error_code');
const I18nErrorCode = require('../models/i18n_error_code');
const { parseExplanation, buildPrefixFromContext } = require('./explanationParser');
const prefixKeyMap = require('../../../shared/i18n/prefixKeyMap.json');

// 将中文前缀翻译为目标语言（依据 i18n 语言）
function translatePrefixText(prefix, t) {
  if (!prefix) return '';

  const getKey = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return raw;
    const compact = raw.replace(/\s+/g, '');
    return prefixKeyMap[raw] || prefixKeyMap[compact] || raw;
  };

  const translateKey = (key) => {
    const translated = t(`shared.prefixLabels.${key}`);
    if (translated && translated !== `shared.prefixLabels.${key}`) return translated;
    return null;
  };

  const translatePart = (part) => {
    // 数字 + 关节，例如 1关节
    const jointMatch = String(part).match(/^(\d+)(\u5173\u8282)$/);
    if (jointMatch) {
      const num = jointMatch[1];
      const jointTranslated = translateKey('joint') || jointMatch[2];
      return `${jointTranslated} ${num}`.trim();
    }

    const key = getKey(part);
    const translated = translateKey(key);
    return translated || part; // 回退原文
  };

  // 先尝试整体翻译
  const wholeKey = getKey(prefix);
  const wholeTranslated = translateKey(wholeKey);
  if (wholeTranslated) return wholeTranslated;

  // 拆分：优先按空格，其次按中文+数字分词
  const parts = String(prefix).trim().split(/\s+/);
  const segments =
    parts.length === 1
      ? String(prefix).match(/\d+\u53f7[\u4e00-\u9fa5A-Za-z]+|\d+[\u4e00-\u9fa5A-Za-z]+|[\u4e00-\u9fa5A-Za-z]+|\d+/g) || parts
      : parts;

  return segments.map(translatePart).join(' ');
}

function normalizeCode(input) {
  if (!input) return '';
  let code = String(input).trim().toUpperCase();
  // 若形如 010A，则补齐 0X 前缀
  if (!code.startsWith('0X')) {
    if (/^[0-9A-F]{3}[A-E]$/.test(code)) {
      code = '0X' + code;
    }
  }
  return code;
}

function deriveFromFullLogCode(input) {
  if (!input) return { subsystem: null, arm: null, joint: null, normalizedCode: '' };
  const raw = String(input).trim().toUpperCase();
  // 完整日志故障码：首位为子系统(1-9或A)，后四位为 3位十六进制 + A-E
  // 例如："1010A" => subsystem: '1', code: '0X010A'
  if (raw.length >= 5) {
    const tail4 = raw.slice(-4);
    if (/^[0-9A-F]{3}[A-E]$/.test(tail4)) {
      const subsystem = raw.charAt(0);
      if (/^[1-9A]$/.test(subsystem)) {
        const arm = raw.length >= 2 ? raw.charAt(1) : null;
        const joint = raw.length >= 3 ? raw.charAt(2) : null;
        return { subsystem, arm, joint, normalizedCode: '0X' + tail4 };
      }
    }
  }
  return { subsystem: null, arm: null, joint: null, normalizedCode: normalizeCode(raw) };
}

function normalizeSeriesId(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
}

async function buildExplanationPreview({ rawCode, subsystem: bodySubsystem, series_id, template: payloadTemplate, params = {}, lang, t }) {
  const { param1, param2, param3, param4 } = params || {};
  const { subsystem: parsedSubsystem, arm: parsedArm, joint: parsedJoint, normalizedCode } = deriveFromFullLogCode(rawCode);
  const code = normalizedCode;
  const normalizedSeriesId = normalizeSeriesId(series_id);

  if (!code || typeof code !== 'string') {
    const err = new Error('缺少或不合法的故障码 code');
    err.status = 400;
    throw err;
  }

  let record = null;
  const subsystem = bodySubsystem || parsedSubsystem || null;
  if (subsystem) {
    record = await ErrorCode.findOne({
      where: {
        ...(normalizedSeriesId ? { series_id: normalizedSeriesId } : {}),
        subsystem,
        code
      }
    });
  } else {
    record = await ErrorCode.findOne({
      where: {
        ...(normalizedSeriesId ? { series_id: normalizedSeriesId } : {}),
        code
      }
    });
  }

  let template = payloadTemplate && String(payloadTemplate);
  if (!template && record) {
    const targetLang = (lang && String(lang).trim())
      ? String(lang).split('-')[0].toLowerCase()
      : null;

    // 主表已不再保存多语言文本，释义模板优先从 i18n_error_codes 读取
    const i18nRows = await I18nErrorCode.findAll({
      where: { error_code_id: record.id },
      attributes: ['lang', 'explanation']
    });

    const pickTemplate = (wantedLang) => {
      if (!wantedLang) return null;
      return i18nRows.find((row) => {
        const contentLang = String(row.lang || '').split('-')[0].toLowerCase();
        return contentLang === wantedLang && row.explanation;
      }) || null;
    };

    const exactLangMatch = pickTemplate(targetLang);
    const zhFallback = pickTemplate('zh');
    template = exactLangMatch?.explanation || zhFallback?.explanation || '';

  } else if (!template) {
    template = '';
  }
  if (!record && !payloadTemplate) {
    const err = new Error('not_found');
    err.status = 404;
    throw err;
  }
  if (!template) {
    const err = new Error('该故障码未配置释义模板（explanation）');
    err.status = 400;
    throw err;
  }

  const context = {
    error_code: String(rawCode || ''),
    subsystem: subsystem || null,
    arm: parsedArm || null,
    joint: parsedJoint || null,
    normalized_code: code
  };

  const explanation = parseExplanation(
    template,
    param1,
    param2,
    param3,
    param4,
    context
  );

  const prefixRaw = buildPrefixFromContext(context) || '';
  const prefix = translatePrefixText(prefixRaw, t);

  return {
    code,
    subsystem: record ? record.subsystem : (subsystem || null),
    arm: parsedArm || null,
    joint: parsedJoint || null,
    template,
    params: { param1, param2, param3, param4 },
    explanation,
    prefix,
    prefix_raw: prefixRaw
  };
}

/**
 * 与 buildExplanationPreview 相同的 parseExplanation + 前缀规则；不访问数据库。
 * 供 error_code_lookup 等在已加载 i18n 行后复用。
 */
function composeExplanationPreviewFromI18n({
  rawCode,
  /** 完整故障码时使用用户原始串解析子系统/臂/关节前缀（多命中时 displayCode 可能为 subsystem:code，无法解析臂号） */
  prefixSourceRaw,
  subsystemFromDb,
  typeCodeFromDb,
  template: templateStr,
  param1,
  param2,
  param3,
  param4,
  t
}) {
  const translate = typeof t === 'function' ? t : (k) => k;
  const raw = String(rawCode || '').trim();
  const prefixRawInput = String(prefixSourceRaw || '').trim();
  let {
    subsystem: parsedSubsystem,
    arm: parsedArm,
    joint: parsedJoint,
    normalizedCode
  } = deriveFromFullLogCode(raw);
  const prefixDerived = prefixRawInput ? deriveFromFullLogCode(prefixRawInput) : null;
  const usePrefixDerived = Boolean(prefixDerived && prefixDerived.normalizedCode);

  if (!normalizedCode && typeCodeFromDb) {
    normalizedCode = normalizeCode(typeCodeFromDb);
  }
  const template = String(templateStr || '').trim();
  if (!normalizedCode) {
    return { explanation: null, prefix: null, prefixRaw: null };
  }
  const subsystem = subsystemFromDb || parsedSubsystem || null;
  const errorCodeDisplay = raw
    || (subsystem && normalizedCode
      ? `${subsystem}${String(normalizedCode).replace(/^0X/i, '')}`
      : String(normalizedCode || ''));

  const armForContext = usePrefixDerived ? prefixDerived.arm : parsedArm;
  const jointForContext = usePrefixDerived ? prefixDerived.joint : parsedJoint;
  const subsystemForContext = usePrefixDerived
    ? (subsystemFromDb || prefixDerived.subsystem || parsedSubsystem)
    : subsystem;

  const context = {
    error_code: String(errorCodeDisplay || ''),
    subsystem: subsystemForContext || null,
    arm: armForContext || null,
    joint: jointForContext || null,
    normalized_code: normalizedCode
  };

  const prefixRaw = buildPrefixFromContext(context) || '';
  const prefix = translatePrefixText(prefixRaw, translate);

  let explanation = null;
  if (template) {
    const expl = parseExplanation(
      template,
      param1,
      param2,
      param3,
      param4,
      context
    );
    explanation = String(expl || '').trim() || null;
  }

  return {
    explanation,
    prefix: String(prefix || '').trim() || null,
    prefixRaw: String(prefixRaw || '').trim() || null
  };
}

module.exports = {
  buildExplanationPreview,
  composeExplanationPreviewFromI18n,
  deriveFromFullLogCode,
  normalizeCode
};

