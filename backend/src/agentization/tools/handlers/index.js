const errorCodeLookupHandler = require('./errorCodeLookupHandler');

const handlers = new Map([
  ['error_code_lookup', errorCodeLookupHandler]
]);
const executionHandlers = new Map([
  ['errorCodeLookupHandler.execute', errorCodeLookupHandler]
]);

function getToolHandler(toolName) {
  const key = String(toolName || '').trim();
  const handler = handlers.get(key);
  if (!handler) {
    const err = new Error(`tool handler not implemented: ${key}`);
    err.code = 'TOOL_HANDLER_NOT_IMPLEMENTED';
    throw err;
  }
  return handler;
}

function getToolHandlerByExecution(handlerName) {
  const key = String(handlerName || '').trim();
  const handler = executionHandlers.get(key);
  if (!handler) {
    const err = new Error(`tool execution handler not implemented: ${key}`);
    err.code = 'TOOL_HANDLER_NOT_IMPLEMENTED';
    throw err;
  }
  return handler;
}

module.exports = {
  getToolHandler,
  getToolHandlerByExecution,
  executionHandlers,
  handlers
};
