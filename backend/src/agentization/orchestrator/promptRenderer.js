const { assembleChatCompletionRequest } = require('./chatRequestAssembler');

/** @deprecated use assembleChatCompletionRequest */
function buildOrchestratorPromptInjectionSnapshot(contextEnvelope, options = {}) {
  const chatRequest = assembleChatCompletionRequest({
    contextEnvelope,
    userPermissions: options.userPermissions,
    traceId: options.traceId
  });
  return {
    langKey: chatRequest.extensions?.langKey || 'zh',
    systemPrompt: chatRequest.messages.find((m) => m.role === 'system')?.content || '',
    messages: chatRequest.messages,
    functionTools: chatRequest.tools,
    toolNames: Array.isArray(chatRequest.tools)
      ? chatRequest.tools.map((t) => t.function?.name).filter(Boolean)
      : [],
    registryVersion: chatRequest.extensions?.registryVersion || 'v1'
  };
}

function buildOrchestratorMessages(contextEnvelope, options = {}) {
  return assembleChatCompletionRequest({
    contextEnvelope,
    userPermissions: options.userPermissions,
    traceId: options.traceId
  }).messages;
}

module.exports = {
  buildOrchestratorPromptInjectionSnapshot,
  buildOrchestratorMessages,
  assembleChatCompletionRequest
};
