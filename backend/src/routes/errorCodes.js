const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');
const {
  createErrorCode,
  getErrorCodes,
  updateErrorCode,
  deleteErrorCode
} = require('../controllers/errorCodeController');

// 查询（支持简单/高级搜索）- 需要 error_code:read 权限
router.get('/', auth, checkPermission('error_code:read'), getErrorCodes);
// 新增 - 需要 error_code:create 权限
router.post('/', auth, checkPermission('error_code:create'), createErrorCode);
// 更新 - 需要 error_code:update 权限
router.put('/:id', auth, checkPermission('error_code:update'), updateErrorCode);
// 删除 - 需要 error_code:delete 权限
router.delete('/:id', auth, checkPermission('error_code:delete'), deleteErrorCode);

module.exports = router; 