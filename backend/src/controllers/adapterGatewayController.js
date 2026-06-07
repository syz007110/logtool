const { getAdapter } = require('../agentization/adapters/adapterRegistry');
const { executeAdapterPipeline } = require('../agentization/adapters/adapterPipeline');
const { orchestrator } = require('../agentization');

async function executeViaAdapter(adapterKey, source, req, res) {
  const adapter = getAdapter(adapterKey);
  return executeAdapterPipeline({
    adapter,
    source,
    req,
    res,
    execute: (request) => orchestrator.execute(request)
  });
}

module.exports = {
  executeViaAdapter,
  executeAdapterPipeline
};
