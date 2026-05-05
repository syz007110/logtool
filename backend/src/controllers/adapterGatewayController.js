const { createAgentRequestLogger } = require('../agentization/utils/agentRequestLogger');
const { getAdapter } = require('../agentization/adapters/adapterRegistry');
const { orchestrator } = require('../agentization');

const agentRequestLogger = createAgentRequestLogger();

async function executeViaAdapter(adapterKey, source, req, res) {
  const adapter = getAdapter(adapterKey);
  try {
    const request = adapter.parseInbound(req);
    agentRequestLogger.log(source, request);
    const response = await orchestrator.execute(request);
    return adapter.renderOutbound({ req, res, request, response });
  } catch (error) {
    return adapter.renderError({ req, res, error });
  }
}

module.exports = {
  executeViaAdapter
};
