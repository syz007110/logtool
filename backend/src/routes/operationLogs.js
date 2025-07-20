const express = require('express');
const router = express.Router();
const { getOperationLogs } = require('../controllers/operationLogController');
const auth = require('../middlewares/auth');

// 查询操作日志（需登录）
router.get('/', auth, getOperationLogs);

module.exports = router; 