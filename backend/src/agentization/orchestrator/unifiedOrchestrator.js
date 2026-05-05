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

function createUnifiedOrchestrator(options = {}) {
  const waitMs = normalizeWaitMs(
    options.waitMs,
    Number(process.env.SESSION_SYNC_WAIT_MS || process.env.AGENT_SYNC_TIMEOUT_MS || 4500)
  );
  const taskStore = options.taskStore || createAgentTaskPersistenceStore();

  async function execute(request) {
    try {
      const response = await enqueueConversationRequest(request, { waitMs });
      const taskId = String(response?.taskId || '').trim();
      if (!taskId) return response;

      try {
        await taskStore.ensureAccepted({ taskId, request, mode: response.mode });
        if (response.mode === 'sync') {
          await taskStore.markCompleted({
            taskId,
            request,
            response: response?.result || {}
          });
        }
      } catch (_) {}
      return response;
    } catch (error) {
      const fallbackTaskId = String(request?.requestId || '').trim();
      if (fallbackTaskId) {
        try {
          await taskStore.ensureAccepted({ taskId: fallbackTaskId, request, mode: 'sync' });
          await taskStore.markFailed({ taskId: fallbackTaskId, request, error });
        } catch (_) {}
      }
      throw error;
    }
  }

  async function getTask(taskId) {
    const task = await getConversationTask(taskId);
    try {
      await taskStore.syncFromQueueTask(taskId, task);
    } catch (_) {}
    return task;
  }

  return {
    execute,
    getTask
  };
}

module.exports = {
  createUnifiedOrchestrator
};
