const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');
const {
  createErrorCode,
  getErrorCodes,
  updateErrorCode,
  deleteErrorCode,
  exportErrorCodesToXML,
  exportMultiLanguageXML,
  getErrorCodeByCodeAndSubsystem,
  exportErrorCodesToCSV
} = require('../controllers/errorCodeController');
const {
  getErrorCodeI18nByLang,
  saveErrorCodeI18nByLang,
  autoTranslateErrorCodeI18n
} = require('../controllers/i18nErrorCodeController');

// 查询（支持简单/高级搜索）- 需要 error_code:read 权限
router.get('/', auth, checkPermission('error_code:read'), getErrorCodes);
// 根据故障码和子系统查找故障码 - 所有已登录用户可用
router.get('/by-code', auth, getErrorCodeByCodeAndSubsystem);
// XML导出 - 需要 error_code:read 权限
router.get('/export/xml', auth, checkPermission('error_code:read'), exportErrorCodesToXML);
// 多语言XML导出 - 需要 error_code:read 权限
router.get('/export/multi-xml', auth, checkPermission('error_code:read'), exportMultiLanguageXML);
// CSV导出 - 需要 error_code:read 权限
router.get('/export/csv', auth, checkPermission('error_code:read'), exportErrorCodesToCSV);
// 新增 - 需要 error_code:create 权限
router.post('/', auth, checkPermission('error_code:create'), createErrorCode);
// 更新 - 需要 error_code:update 权限
router.put('/:id', auth, checkPermission('error_code:update'), updateErrorCode);
// 删除 - 需要 error_code:delete 权限
router.delete('/:id', auth, checkPermission('error_code:delete'), deleteErrorCode);

// 获取故障码的指定语言的多语言内容（技术说明字段）- 需要 error_code:read 权限
router.get('/:id/i18n', auth, checkPermission('error_code:read'), getErrorCodeI18nByLang);

// 保存故障码的指定语言的多语言内容（技术说明字段）- 需要 error_code:update 权限
router.put('/:id/i18n', auth, checkPermission('error_code:update'), saveErrorCodeI18nByLang);

// 自动翻译故障码的技术说明字段 - 需要 error_code:update 权限
router.post('/:id/i18n/auto-translate', auth, checkPermission('error_code:update'), autoTranslateErrorCodeI18n);

module.exports = router; 