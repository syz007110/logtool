const { getAdapter } = require('../agentization/adapters/adapterRegistry');
const { executeAdapterPipeline } = require('../agentization/adapters/adapterPipeline');
const { taskGateway } = require('../agentization');

async function executeViaAdapter(adapterKey, source, req, res) {
  const adapter = getAdapter(adapterKey);
  return executeAdapterPipeline({
    adapter,
    source,
    req,
    res,
    execute: (request) => taskGateway.execute(request)
  });
}

module.exports = {
  executeViaAdapter,
  executeAdapterPipeline
};
