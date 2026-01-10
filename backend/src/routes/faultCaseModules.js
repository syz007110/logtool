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

// 所有操作都需要 fault_case_config:manage 权限（增删改查）
router.get('/', auth, checkPermission('fault_case_config:manage'), getFaultCaseModules);
router.get('/:id/mappings', auth, checkPermission('fault_case_config:manage'), getFaultCaseModuleMappings);

router.post('/', auth, checkPermission('fault_case_config:manage'), createFaultCaseModule);
router.put('/:id', auth, checkPermission('fault_case_config:manage'), updateFaultCaseModule);
router.delete('/:id', auth, checkPermission('fault_case_config:manage'), deleteFaultCaseModule);

router.post('/:id/mappings', auth, checkPermission('fault_case_config:manage'), createFaultCaseModuleMapping);
router.put('/mappings/:mappingId', auth, checkPermission('fault_case_config:manage'), updateFaultCaseModuleMapping);
router.delete('/mappings/:mappingId', auth, checkPermission('fault_case_config:manage'), deleteFaultCaseModuleMapping);

module.exports = router;


