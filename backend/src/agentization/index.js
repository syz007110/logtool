const { createConversationTaskGateway } = require('./taskGateway/conversationTaskGateway');

const taskGateway = createConversationTaskGateway({
  waitMs: Number(process.env.SESSION_SYNC_WAIT_MS || process.env.AGENT_SYNC_TIMEOUT_MS || 4500)
});

module.exports = {
  taskGateway
};
