const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');
const { proxyTechSolutionObject, proxyFaultCaseObject } = require('../controllers/ossController');

// Stream OSS objects via backend (ECS -> OSS internal). Browser never touches *-internal domains.
router.get('/tech-solution', auth, checkPermission('error_code:read'), proxyTechSolutionObject);
router.get('/fault-cases', auth, checkPermission('fault_case:read'), proxyFaultCaseObject);

module.exports = router;


