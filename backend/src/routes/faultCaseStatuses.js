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

// 所有操作都需要 fault_case_config:manage 权限（增删改查）
router.get('/', auth, checkPermission('fault_case_config:manage'), getFaultCaseStatuses);
router.get('/:id/mappings', auth, checkPermission('fault_case_config:manage'), getFaultCaseStatusMappings);

router.post('/', auth, checkPermission('fault_case_config:manage'), createFaultCaseStatus);
router.put('/:id', auth, checkPermission('fault_case_config:manage'), updateFaultCaseStatus);
router.delete('/:id', auth, checkPermission('fault_case_config:manage'), deleteFaultCaseStatus);

router.post('/:id/mappings', auth, checkPermission('fault_case_config:manage'), createFaultCaseStatusMapping);
router.put('/mappings/:mappingId', auth, checkPermission('fault_case_config:manage'), updateFaultCaseStatusMapping);
router.delete('/mappings/:mappingId', auth, checkPermission('fault_case_config:manage'), deleteFaultCaseStatusMapping);

module.exports = router;


