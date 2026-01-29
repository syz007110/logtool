const { buildExplanationPreview } = require('../utils/explanationPreview');

/**
 * 预览/测试释义解析
 * 输入：code, param1..param4
 * 返回：解析后的释义字符串
 */
const previewParse = async (req, res) => {
  try {
    const { code: rawCode, subsystem: bodySubsystem, template: payloadTemplate, param1, param2, param3, param4 } = req.body || {};

    const out = await buildExplanationPreview({
      rawCode,
      subsystem: bodySubsystem,
      template: payloadTemplate,
      params: { param1, param2, param3, param4 },
      t: req.t
    });

    return res.json(out);
  } catch (error) {
    console.error('预览释义解析失败:', error);
    const status = error?.status || 500;
    if (status === 404) {
      return res.status(404).json({ message: req.t('errorCode.notFound') });
    }
    return res.status(status).json({ message: '预览释义解析失败', error: error.message });
  }
};

module.exports = {
  previewParse
};


