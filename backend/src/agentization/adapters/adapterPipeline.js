const { createAgentRequestLogger } = require('../utils/agentRequestLogger');

const defaultAgentRequestLogger = createAgentRequestLogger();

async function executeAdapterPipeline({
  adapter,
  source,
  req,
  res,
  outbound,
  execute,
  agentRequestLogger = defaultAgentRequestLogger,
  onParsed
}) {
  if (!adapter || typeof adapter.parseInbound !== 'function') {
    throw new Error('adapter.parseInbound is required');
  }
  if (typeof execute !== 'function') {
    throw new Error('execute function is required');
  }

  try {
    const request = adapter.parseInbound(req);
    if (typeof onParsed === 'function') {
      onParsed(request);
    }
    agentRequestLogger.log(source, request);
    const response = await execute(request);
    return adapter.renderOutbound({ req, res, request, response, outbound });
  } catch (error) {
    return adapter.renderError({ req, res, error, outbound });
  }
}

module.exports = {
  executeAdapterPipeline
};
