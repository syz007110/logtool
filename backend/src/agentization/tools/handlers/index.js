const errorCodeLookupHandler = require('./errorCodeLookupHandler');

const handlers = new Map([
  ['error_code_lookup', errorCodeLookupHandler]
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

module.exports = {
  getToolHandler,
  handlers
};
