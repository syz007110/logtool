const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');

const {
  getFaultCaseStatuses,
  createFaultCaseStatus,
  updateFaultCaseStatus,
  deleteFaultCaseStatus,
  getFaultCaseStatusMappings,
  createFaultCaseStatusMapping,
  updateFaultCaseStatusMapping,
  deleteFaultCaseStatusMapping
} = require('../controllers/faultCaseStatusController');

// 读取：登录即可（前端路由会用权限控制入口）
router.get('/', auth, getFaultCaseStatuses);
router.get('/:id/mappings', auth, getFaultCaseStatusMappings);

// 写入：统一用 loglevel:manage（配置管理权限）
router.post('/', auth, checkPermission('loglevel:manage'), createFaultCaseStatus);
router.put('/:id', auth, checkPermission('loglevel:manage'), updateFaultCaseStatus);
router.delete('/:id', auth, checkPermission('loglevel:manage'), deleteFaultCaseStatus);

router.post('/:id/mappings', auth, checkPermission('loglevel:manage'), createFaultCaseStatusMapping);
router.put('/mappings/:mappingId', auth, checkPermission('loglevel:manage'), updateFaultCaseStatusMapping);
router.delete('/mappings/:mappingId', auth, checkPermission('loglevel:manage'), deleteFaultCaseStatusMapping);

module.exports = router;


