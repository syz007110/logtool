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
  exportMultiLanguageXML
} = require('../controllers/errorCodeController');

// 查询（支持简单/高级搜索）- 需要 error_code:read 权限
router.get('/', auth, checkPermission('error_code:read'), getErrorCodes);
// XML导出 - 需要 error_code:read 权限
router.get('/export/xml', auth, checkPermission('error_code:read'), exportErrorCodesToXML);
// 多语言XML导出 - 需要 error_code:read 权限
router.get('/export/multi-xml', auth, checkPermission('error_code:read'), exportMultiLanguageXML);
// 新增 - 需要 error_code:create 权限
router.post('/', auth, checkPermission('error_code:create'), createErrorCode);
// 更新 - 需要 error_code:update 权限
router.put('/:id', auth, checkPermission('error_code:update'), updateErrorCode);
// 删除 - 需要 error_code:delete 权限
router.delete('/:id', auth, checkPermission('error_code:delete'), deleteErrorCode);

module.exports = router; 