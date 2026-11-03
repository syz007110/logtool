const express = require('express');
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');
const {
  ensureRequestId,
  exportAuditLogs,
  listAuditEventDefinitions,
  listAuditLogs
} = require('../controllers/auditController');

const router = express.Router();

// 标记后由共用认证/权限中间件返回 OpenAPI 约定的错误格式。
router.use(ensureRequestId);
router.use((req, res, next) => {
  req.apiContractErrors = true;
  next();
});

router.get('/audit-logs', auth, checkPermission('audit:read'), listAuditLogs);
router.post('/audit-logs/export', auth, checkPermission('audit:export'), exportAuditLogs);
router.get('/audit-event-definitions', auth, checkPermission('audit:read'), listAuditEventDefinitions);

module.exports = router;
