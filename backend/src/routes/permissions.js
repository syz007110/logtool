const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');
const { listPermissions } = require('../controllers/permissionController');

// 获取全部权限清单 - 需要 role:read（或后续可改为 permission:read）
router.get('/', auth, checkPermission('role:read'), listPermissions);

module.exports = router;
