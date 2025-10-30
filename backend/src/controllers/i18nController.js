const I18nText = require('../models/i18n_text');

// 新增或更新多语言文本
const upsertI18nText = async (req, res) => {
  try {
    const { key_name, lang, text } = req.body;
    if (!key_name || !lang) return res.status(400).json({ message: 'key_name和lang不能为空' });
    const [i18n, created] = await I18nText.upsert({ key_name, lang, text });
    res.json({ message: req.t(created ? 'shared.messages.createSuccess' : 'shared.messages.updateSuccess'), i18n });
  } catch (err) {
    res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

// 查询多语言文本
const getI18nTexts = async (req, res) => {
  try {
    const { key_name, lang } = req.query;
    const where = {};
    if (key_name) where.key_name = key_name;
    if (lang) where.lang = lang;
    const texts = await I18nText.findAll({ where });
    res.json({ texts });
  } catch (err) {
    res.status(500).json({ message: '查询失败', error: err.message });
  }
};

// 删除多语言文本
const deleteI18nText = async (req, res) => {
  try {
    const { id } = req.params;
    const i18n = await I18nText.findByPk(id);
    if (!i18n) return res.status(404).json({ message: req.t('shared.notFound') });
    await i18n.destroy();
    res.json({ message: req.t('shared.deleted') });
  } catch (err) {
    res.status(500).json({ message: req.t('shared.deleteFailed'), error: err.message });
  }
};

module.exports = {
  upsertI18nText,
  getI18nTexts,
  deleteI18nText
}; 