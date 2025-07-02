const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const {
  createErrorCode,
  getErrorCodes,
  updateErrorCode,
  deleteErrorCode
} = require('../controllers/errorCodeController');

// 查询（支持简单/高级搜索）
router.get('/', auth, getErrorCodes);
// 新增
router.post('/', auth, createErrorCode);
// 更新
router.put('/:id', auth, updateErrorCode);
// 删除
router.delete('/:id', auth, deleteErrorCode);

module.exports = router; 