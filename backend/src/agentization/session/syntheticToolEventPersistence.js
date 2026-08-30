function buildSyntheticToolCall(toolName, args = {}, prefix = 'pre') {
  const toolCallId = `${String(prefix || 'pre')}_${String(toolName || 'tool')}_${Date.now()}`;
  return {
    id: toolCallId,
    type: 'function',
    function: {
      name: String(toolName || '').trim(),
      arguments: JSON.stringify(args || {})
    }
  };
}

function createToolResult({ status, text = '', data = null, error = null }) {
  const normalized = {
    status: String(status || '').trim(),
    text: String(text || '').trim(),
    data: data == null ? null : data,
    error: error == null ? null : {
      code: String(error.code || '').trim(),
      message: String(error.message || '').trim()
    }
  };
  if (!['success', 'empty', 'failed'].includes(normalized.status)) {
    throw new Error(`invalid ToolResult.status: ${normalized.status}`);
  }
  if (normalized.status === 'success') {
    if (!normalized.text) throw new Error('ToolResult success requires text');
    if (normalized.data == null) throw new Error('ToolResult success requires data');
    if (normalized.error !== null) throw new Error('ToolResult success requires error=null');
  }
  if (normalized.status === 'empty') {
    if (!normalized.text) throw new Error('ToolResult empty requires text');
    if (normalized.data !== null) throw new Error('ToolResult empty requires data=null');
    if (normalized.error !== null) throw new Error('ToolResult empty requires error=null');
  }
  if (normalized.status === 'failed') {
    if (normalized.data !== null) throw new Error('ToolResult failed requires data=null');
    if (!normalized.error?.code || !normalized.error?.message) {
      throw new Error('ToolResult failed requires error.code and error.message');
    }
  }
  return normalized;
}

module.exports = {
  buildSyntheticToolCall,
  createToolResult
};
