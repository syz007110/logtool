const { buildExplanationPreview } = require('../utils/explanationPreview');

const PREVIEW_BATCH_MAX_ITEMS = 100;

/**
 * 预览/测试释义解析
 * 输入：code, param1..param4
 * 返回：解析后的释义字符串
 */
const previewParse = async (req, res) => {
  try {
    const {
      code: rawCode,
      subsystem: bodySubsystem,
      template: payloadTemplate,
      param1,
      param2,
      param3,
      param4,
      lang,
      series_id
    } = req.body || {};

    const out = await buildExplanationPreview({
      rawCode,
      subsystem: bodySubsystem,
      series_id,
      template: payloadTemplate,
      params: { param1, param2, param3, param4 },
      lang: lang || req.headers?.['accept-language'] || null,
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

/**
 * 批量预览释义解析（手术可视化等场景）
 * 输入：{ items: [{ id, code, subsystem, param1..param4, lang?, series_id? }], lang?, series_id? }
 * 返回：{ results: [{ id, ok, ... } | { id, ok:false, status, message }] }
 */
const previewBatchParse = async (req, res) => {
  const body = req.body || {};
  const items = Array.isArray(body.items) ? body.items : null;
  if (!items) {
    return res.status(400).json({ message: 'items 必须为数组' });
  }
  if (items.length === 0) {
    return res.json({ results: [] });
  }
  if (items.length > PREVIEW_BATCH_MAX_ITEMS) {
    return res.status(400).json({
      message: `单次最多 ${PREVIEW_BATCH_MAX_ITEMS} 条`,
      max: PREVIEW_BATCH_MAX_ITEMS
    });
  }

  const defaultLang = body.lang || req.headers?.['accept-language'] || null;
  const defaultSeriesId = body.series_id;
  const results = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i] || {};
    const id = item.id != null ? item.id : String(i);
    try {
      const out = await buildExplanationPreview({
        rawCode: item.code,
        subsystem: item.subsystem,
        series_id: item.series_id != null ? item.series_id : defaultSeriesId,
        template: item.template,
        params: {
          param1: item.param1,
          param2: item.param2,
          param3: item.param3,
          param4: item.param4
        },
        lang: item.lang || defaultLang,
        t: req.t
      });
      results.push({ id, ok: true, ...out });
    } catch (error) {
      const status = error?.status || 500;
      results.push({
        id,
        ok: false,
        status,
        message: status === 404 ? (req.t('errorCode.notFound') || 'not_found') : (error.message || 'preview_failed')
      });
    }
  }

  return res.json({ results });
};

module.exports = {
  previewParse,
  previewBatchParse,
  PREVIEW_BATCH_MAX_ITEMS
};


