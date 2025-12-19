const express = require('express');
const router = express.Router();

const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');
const { proxyFaultCases, proxyTechSolution } = require('../controllers/ossController');

// Browser download/preview via backend (ECS) -> OSS (内网/STS)
router.get('/fault-cases', auth, checkPermission('fault_case:read'), proxyFaultCases);
router.get('/tech-solution', auth, checkPermission('error_code:read'), proxyTechSolution);

module.exports = router;


