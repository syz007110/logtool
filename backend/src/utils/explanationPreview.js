const ErrorCode = require('../models/error_code');
const I18nErrorCode = require('../models/i18n_error_code');
const { parseExplanation, buildPrefixFromContext } = require('./explanationParser');
const prefixKeyMap = require('../config/prefixKeyMap.json');

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

async function buildExplanationPreview({ rawCode, subsystem: bodySubsystem, template: payloadTemplate, params = {}, lang, t }) {
  const { param1, param2, param3, param4 } = params || {};
  const { subsystem: parsedSubsystem, arm: parsedArm, joint: parsedJoint, normalizedCode } = deriveFromFullLogCode(rawCode);
  const code = normalizedCode;

  if (!code || typeof code !== 'string') {
    const err = new Error('缺少或不合法的故障码 code');
    err.status = 400;
    throw err;
  }

  let record = null;
  const subsystem = bodySubsystem || parsedSubsystem || null;
  if (subsystem) {
    record = await ErrorCode.findOne({ where: { subsystem, code } });
  } else {
    record = await ErrorCode.findOne({ where: { code } });
  }

  let template = payloadTemplate && String(payloadTemplate);
  if (!template && record) {
    const targetLang = (lang && String(lang).trim()) ? String(lang).split('-')[0].toLowerCase() : null;
    if (targetLang && targetLang !== 'zh') {
      const i18nRows = await I18nErrorCode.findAll({
        where: { error_code_id: record.id },
        attributes: ['lang', 'explanation']
      });
      const i18nMatch = i18nRows.find((row) => {
        const contentLang = String(row.lang || '').split('-')[0].toLowerCase();
        return contentLang === targetLang && row.explanation;
      });
      if (i18nMatch) {
        template = i18nMatch.explanation;
      }
    }
    if (!template) {
      template = record.explanation || '';
    }
  } else if (!template) {
    template = record?.explanation || '';
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

module.exports = {
  buildExplanationPreview,
  deriveFromFullLogCode,
  normalizeCode
};

