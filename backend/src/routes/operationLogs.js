const express = require('express');
const router = express.Router();
const { getOperationLogs } = require('../controllers/operationLogController');
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');

// 查询操作日志（需要管理员权限）
router.get('/', auth, checkPermission('user:read'), getOperationLogs);

module.exports = router; 