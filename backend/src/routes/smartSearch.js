const express = require('express');
const router = express.Router();

const auth = require('../middlewares/auth');
const { smartSearch, smartSearchLlmStream } = require('../controllers/smartSearchController');

// Smart Search (LLM-only: Qwen keyword extraction)
// NOTE: Smart Search should behave like /error-codes/by-code (auth only),
// to avoid querying RBAC tables (user_roles/roles) on each request.
router.post('/search', auth, smartSearch);
// Debug: stream the raw LLM output (SSE)
router.get('/llm-stream', auth, smartSearchLlmStream);

module.exports = router;


