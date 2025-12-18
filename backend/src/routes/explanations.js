const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');
const { previewParse } = require('../controllers/explanationController');

// 所有已登录用户都可使用预览解析
router.post('/preview', auth, previewParse);

module.exports = router;


