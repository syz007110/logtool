const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');

const { searchJiraIssues, searchJiraIssuesMixed, getJiraIssue } = require('../controllers/jiraController');

// Jira keyword search (proxy)
// Note: Use an existing permission for the first step to avoid RBAC migration.
router.get('/search', auth, checkPermission('fault_case:read'), searchJiraIssues);
// Mixed: Jira + Mongo fault cases (same list contract as /search, plus `source` field)
router.get('/search-mixed', auth, checkPermission('fault_case:read'), searchJiraIssuesMixed);
router.get('/issue/:key', auth, checkPermission('fault_case:read'), getJiraIssue);

module.exports = router;


