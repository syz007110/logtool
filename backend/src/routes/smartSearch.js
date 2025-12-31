const express = require('express');
const router = express.Router();

const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');
const { smartSearch, smartSearchLlmStream } = require('../controllers/smartSearchController');

// Smart Search (LLM-only: Qwen keyword extraction)
// Permission: align with Jira search for now to avoid RBAC migration.
router.post('/search', auth, checkPermission('fault_case:read'), smartSearch);
// Debug: stream the raw LLM output (SSE)
router.get('/llm-stream', auth, checkPermission('fault_case:read'), smartSearchLlmStream);

module.exports = router;


