const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');

const {
  getFaultCaseModules,
  createFaultCaseModule,
  updateFaultCaseModule,
  deleteFaultCaseModule,
  getFaultCaseModuleMappings,
  createFaultCaseModuleMapping,
  updateFaultCaseModuleMapping,
  deleteFaultCaseModuleMapping
} = require('../controllers/faultCaseModuleController');

// 读取：登录即可（前端路由会用权限控制入口）
router.get('/', auth, getFaultCaseModules);
router.get('/:id/mappings', auth, getFaultCaseModuleMappings);

// 写入：统一用 loglevel:manage（配置管理权限）
router.post('/', auth, checkPermission('loglevel:manage'), createFaultCaseModule);
router.put('/:id', auth, checkPermission('loglevel:manage'), updateFaultCaseModule);
router.delete('/:id', auth, checkPermission('loglevel:manage'), deleteFaultCaseModule);

router.post('/:id/mappings', auth, checkPermission('loglevel:manage'), createFaultCaseModuleMapping);
router.put('/mappings/:mappingId', auth, checkPermission('loglevel:manage'), updateFaultCaseModuleMapping);
router.delete('/mappings/:mappingId', auth, checkPermission('loglevel:manage'), deleteFaultCaseModuleMapping);

module.exports = router;


