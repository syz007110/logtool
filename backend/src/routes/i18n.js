const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');
const {
  upsertI18nText,
  getI18nTexts,
  deleteI18nText
} = require('../controllers/i18nController');

// 新增/更新 - 需要 i18n:create 或 i18n:update 权限
router.post('/', auth, checkPermission('i18n:create'), upsertI18nText);
// 查询 - 需要 i18n:read 权限
router.get('/', auth, checkPermission('i18n:read'), getI18nTexts);
// 删除 - 需要 i18n:delete 权限
router.delete('/:id', auth, checkPermission('i18n:delete'), deleteI18nText);

module.exports = router; 