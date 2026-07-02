const {
  enqueueConversationRequest,
  getConversationTask
} = require('../session/conversationQueueService');
const { createAgentTaskPersistenceStore } = require('./stores/agentTaskPersistenceStore');

function normalizeWaitMs(value, fallback) {
  const num = Number(value);
  if (Number.isFinite(num) && num >= 0) return num;
  return fallback;
}

/** Turn 交付层：MessageInput → 会话治理 → 建任务入队 */
function createConversationTaskGateway(options = {}) {
  const waitMs = normalizeWaitMs(
    options.waitMs,
    Number(process.env.SESSION_SYNC_WAIT_MS || process.env.AGENT_SYNC_TIMEOUT_MS || 4500)
  );
  const taskStore = options.taskStore || createAgentTaskPersistenceStore();

  async function execute(request) {
    return enqueueConversationRequest(request, { waitMs });
  }

  async function getTask(taskId) {
    return getConversationTask(taskId);
  }

  return {
    execute,
    getTask,
    taskStore
  };
}

module.exports = {
  createConversationTaskGateway
};
