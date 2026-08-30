const errorCodeLookupHandler = require('./errorCodeLookupHandler');
const deviceContextLookupHandler = require('./deviceContextLookupHandler');
const logUploadFromAttachmentHandler = require('./logUploadFromAttachmentHandler');

const handlers = new Map([
  ['error_code_lookup', errorCodeLookupHandler],
  ['device_context_lookup', deviceContextLookupHandler],
  ['start_log_upload', logUploadFromAttachmentHandler]
]);
const executionHandlers = new Map([
  ['errorCodeLookupHandler.execute', errorCodeLookupHandler],
  ['deviceContextLookupHandler.execute', deviceContextLookupHandler],
  ['logUploadFromAttachmentHandler.execute', logUploadFromAttachmentHandler]
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
