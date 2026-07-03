const { executeViaAdapter } = require('./adapterGatewayController');
const { taskGateway } = require('../agentization');
const { resolveUserIsAdmin } = require('../agentization/security/userPermissionResolver');
const { canReadAgentTask } = require('../agentization/security/agentTaskAccess');
const { generateUlid, generateUuidV4 } = require('../utils/idGenerators');

function buildTraceId(req) {
  const fromHeader = String(req?.headers?.['x-trace-id'] || '').trim();
  if (fromHeader) return fromHeader;
  return generateUuidV4();
}

function buildWebMessageId(timestampMs = Date.now()) {
  return generateUlid(timestampMs);
}

function buildRequestId() {
  return generateUuidV4();
}

async function executeAgentTask(req, res) {
  return executeViaAdapter('web', 'api-agent', req, res);
}

async function getAgentTask(req, res) {
  const taskId = String(req.params.taskId || '').trim();
  if (!taskId) {
    return res.status(400).json({
      ok: false,
      message: 'taskId is required'
    });
  }

  const taskRow = await taskGateway.taskStore.getTask(taskId);
  if (!taskRow) {
    return res.status(404).json({
      ok: false,
      message: 'task not found'
    });
  }

  const isAdmin = await resolveUserIsAdmin(req.user || {});
  if (!canReadAgentTask(taskRow, req.user, isAdmin)) {
    return res.status(403).json({
      ok: false,
      message: '无权访问此任务'
    });
  }

  const task = await taskGateway.getTask(taskId);
  return res.json({
    ok: true,
    task
  });
}

module.exports = {
  executeAgentTask,
  getAgentTask,
  buildWebMessageId,
  buildRequestId,
  buildTraceId
};
