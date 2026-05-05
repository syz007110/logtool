const express = require('express');
const router = express.Router();

const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');
const {
  smartSearch,
  smartSearchLlmStream,
  smartSearchLlmProviders,
  getMKnowledgeAssetProxy
} = require('../controllers/smartSearchController');
const {
  getConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation
} = require('../controllers/smartSearchConversationController');

// Smart Search (LLM-only: Qwen keyword extraction)
// Guard all smart-search capabilities with dedicated permission.
router.post('/search', auth, checkPermission('smart_search:use'), smartSearch);
// Proxy MKnowledge chunk image/binary assets (Bearer → MKnowledge)
router.get('/mknowledge-assets/:fileId/:assetId', auth, checkPermission('smart_search:use'), getMKnowledgeAssetProxy);
// Debug: stream the raw LLM output (SSE)
router.get('/llm-stream', auth, checkPermission('smart_search:use'), smartSearchLlmStream);
// LLM providers list (for UI dropdown)
router.get('/llm/providers', auth, checkPermission('smart_search:use'), smartSearchLlmProviders);

// 对话管理
router.get('/conversations', auth, checkPermission('smart_search:use'), getConversations);
router.get('/conversations/:id', auth, checkPermission('smart_search:use'), getConversation);
router.post('/conversations', auth, checkPermission('smart_search:use'), createConversation);
router.put('/conversations/:id', auth, checkPermission('smart_search:use'), updateConversation);
router.delete('/conversations/:id', auth, checkPermission('smart_search:use'), deleteConversation);

module.exports = router;


