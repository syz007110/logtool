const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { previewParse, previewBatchParse } = require('../controllers/explanationController');

// 所有已登录用户都可使用预览解析（单条 / 批量）
router.post('/preview', auth, previewParse);
router.post('/preview-batch', auth, previewBatchParse);

module.exports = router;


