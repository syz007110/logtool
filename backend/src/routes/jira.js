const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');

const { searchJiraIssues } = require('../controllers/jiraController');

// Jira keyword search (proxy)
// Note: Use an existing permission for the first step to avoid RBAC migration.
router.get('/search', auth, checkPermission('fault_case:read'), searchJiraIssues);

module.exports = router;


