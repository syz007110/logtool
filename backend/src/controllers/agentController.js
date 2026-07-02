const { executeViaAdapter } = require('./adapterGatewayController');
const { taskGateway } = require('../agentization');
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
  const task = await taskGateway.getTask(taskId);
  if (!task) {
    return res.status(404).json({
      ok: false,
      message: 'task not found'
    });
  }
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
