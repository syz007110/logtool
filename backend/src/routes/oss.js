const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');
const { proxyTechSolutionObject, proxyFaultCaseObject, proxyKbObject, proxyMotionDataObject, proxyAgentAssetObject } = require('../controllers/ossController');

// Stream OSS objects via backend (ECS -> OSS internal). Browser never touches *-internal domains.
// tech-solution: allow any authenticated user (align with /error-codes/by-code and SmartSearch usage)
router.get('/tech-solution', auth, proxyTechSolutionObject);
router.get('/fault-cases', auth, checkPermission('fault_case:read'), proxyFaultCaseObject);
router.get('/kb', auth, checkPermission('kb:read'), proxyKbObject);
router.get('/motion-data', auth, checkPermission('data_replay:manage'), proxyMotionDataObject);
router.get('/agent-assets', auth, checkPermission('smart_search:use'), proxyAgentAssetObject);

module.exports = router;


