const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const {
  upsertI18nText,
  getI18nTexts,
  deleteI18nText
} = require('../controllers/i18nController');

// 新增/更新
router.post('/', auth, upsertI18nText);
// 查询
router.get('/', auth, getI18nTexts);
// 删除
router.delete('/:id', auth, deleteI18nText);

module.exports = router; 