const ErrorCode = require('../models/error_code');
const { parseExplanation, buildPrefixFromContext } = require('../utils/explanationParser');

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

/**
 * 预览/测试释义解析
 * 输入：code, param1..param4
 * 返回：解析后的释义字符串
 */
const previewParse = async (req, res) => {
  try {
    const { code: rawCode, subsystem: bodySubsystem, template: payloadTemplate, param1, param2, param3, param4 } = req.body || {};

    const { subsystem: parsedSubsystem, arm: parsedArm, joint: parsedJoint, normalizedCode } = deriveFromFullLogCode(rawCode);
    const code = normalizedCode;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ message: '缺少或不合法的故障码 code' });
    }

    let record = null;
    const subsystem = bodySubsystem || parsedSubsystem || null;
    if (subsystem) {
      record = await ErrorCode.findOne({ where: { subsystem, code } });
    } else {
      record = await ErrorCode.findOne({ where: { code } });
    }

    const template = (payloadTemplate && String(payloadTemplate)) || (record?.explanation || '');
    if (!record && !payloadTemplate) {
      return res.status(404).json({ message: req.t('errorCode.notFound') });
    }
    if (!template) {
      return res.status(400).json({ message: '该故障码未配置释义模板（explanation）' });
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

    const prefix = buildPrefixFromContext(context) || '';

    return res.json({
      code,
      subsystem: record ? record.subsystem : (subsystem || null),
      arm: parsedArm || null,
      joint: parsedJoint || null,
      template,
      params: { param1, param2, param3, param4 },
      explanation,
      prefix
    });
  } catch (error) {
    console.error('预览释义解析失败:', error);
    return res.status(500).json({ message: '预览释义解析失败', error: error.message });
  }
};

module.exports = {
  previewParse
};


