const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');
const { exportErrorCodesToXML } = require('../controllers/xmlExportController');

// 导出故障码到XML - 需要 error_code:export 权限
router.get('/', auth, checkPermission('error_code:export'), exportErrorCodesToXML);

module.exports = router; 