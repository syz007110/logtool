const {
  listConversationsForUser,
  listMessagesForConversation
} = require('../agentization/session/agentConversationQueryService');

async function listAgentConversations(req, res) {
  try {
    const list = await listConversationsForUser(req.user?.id, {
      limit: req.query?.limit
    });
    return res.json({ ok: true, conversations: list });
  } catch (err) {
    console.error('[agent-conversations] list failed', err);
    return res.status(500).json({ ok: false, message: err.message || 'list failed' });
  }
}

async function listAgentConversationMessages(req, res) {
  try {
    const messages = await listMessagesForConversation(
      req.user?.id,
      req.params.conversationId
    );
    return res.json({ ok: true, conversationId: req.params.conversationId, messages });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ ok: false, message: 'conversation not found' });
    }
    if (err.code === 'INVALID_ARGUMENT') {
      return res.status(400).json({ ok: false, message: err.message || 'invalid argument' });
    }
    console.error('[agent-conversations] messages failed', err);
    return res.status(500).json({ ok: false, message: err.message || 'messages failed' });
  }
}

module.exports = { listAgentConversations, listAgentConversationMessages };
