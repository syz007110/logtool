const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');

const {
  searchJiraIssues,
  searchJiraIssuesMixed,
  getJiraIssue,
  importJiraIssueAttachments,
  previewJiraIssueAttachments,
  proxyJiraAttachment
} = require('../controllers/jiraController');

// Jira keyword search (proxy)
// Note: Use an existing permission for the first step to avoid RBAC migration.
router.get('/search', auth, checkPermission('fault_case:read'), searchJiraIssues);
// Mixed: Jira + Mongo fault cases (same list contract as /search, plus `source` field)
router.get('/search-mixed', auth, checkPermission('fault_case:read'), searchJiraIssuesMixed);
router.get('/issue/:key', auth, checkPermission('fault_case:read'), getJiraIssue);
// Stream proxy for Jira attachment images (browser preview)
router.get('/attachment/proxy', auth, checkPermission('fault_case:read'), proxyJiraAttachment);
// Preview attachments via backend (download into temp storage) so browser can render without Jira auth/CORS.
router.get('/issue/:key/attachments/preview', auth, checkPermission('fault_case:read'), previewJiraIssueAttachments);
// Import Jira attachments into fault-case temp storage (requires create permission)
router.post('/issue/:key/attachments/import', auth, checkPermission('fault_case:create'), importJiraIssueAttachments);

module.exports = router;


