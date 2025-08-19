const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');
const { previewParse } = require('../controllers/explanationController');

// 仅管理员（或拥有 error_code:read 权限的管理员）可用；这里使用 user:update 代表管理员权限
router.post('/preview', auth, checkPermission('user:update'), previewParse);

module.exports = router;


