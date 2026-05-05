const { buildAgentResponse } = require('../../types/contracts');

function createCoreTaskAgent({ taskRouter, toolGateway }) {
  if (!taskRouter || typeof taskRouter.route !== 'function') {
    throw new Error('taskRouter.route is required');
  }
  if (!toolGateway || typeof toolGateway.invoke !== 'function') {
    throw new Error('toolGateway.invoke is required');
  }

  return {
    async execute(request) {
      const intentResult = await taskRouter.route(request);
      const toolResult = await toolGateway.invoke(intentResult.intent, request, intentResult);

      return buildAgentResponse({
        mode: 'sync',
        text: toolResult.text,
        cards: toolResult.cards || [],
        links: toolResult.links || [],
        actions: toolResult.actions || [],
        debugMeta: {
          intentResult,
          ...(toolResult.debugMeta || {})
        }
      });
    }
  };
}

module.exports = {
  createCoreTaskAgent
};
