const express = require('express');
const router = express.Router();

const auth = require('../middlewares/auth');
const { smartSearch, smartSearchLlmStream, smartSearchLlmProviders } = require('../controllers/smartSearchController');
const {
  getConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation
} = require('../controllers/smartSearchConversationController');

// Smart Search (LLM-only: Qwen keyword extraction)
// NOTE: Smart Search should behave like /error-codes/by-code (auth only),
// to avoid querying RBAC tables (user_roles/roles) on each request.
router.post('/search', auth, smartSearch);
// Debug: stream the raw LLM output (SSE)
router.get('/llm-stream', auth, smartSearchLlmStream);
// LLM providers list (for UI dropdown)
router.get('/llm/providers', auth, smartSearchLlmProviders);

// 对话管理
router.get('/conversations', auth, getConversations);
router.get('/conversations/:id', auth, getConversation);
router.post('/conversations', auth, createConversation);
router.put('/conversations/:id', auth, updateConversation);
router.delete('/conversations/:id', auth, deleteConversation);

module.exports = router;


