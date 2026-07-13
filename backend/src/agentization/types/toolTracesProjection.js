function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

/**
 * @param {unknown} loopTrace
 * @returns {{ toolName: string, data: object|null, status?: string }[]}
 */
function projectToolTracesFromLoopTrace(loopTrace) {
  const list = Array.isArray(loopTrace) ? loopTrace : [];
  const out = [];
  for (const entry of list) {
    if (!entry || entry.kind !== 'tool') continue;
    const toolName = String(entry.toolName || '').trim();
    if (!toolName) continue;
    const toolResult = asObject(entry.toolResult);
    const status = String(toolResult.status || '').trim().toLowerCase();
    if (status && status !== 'success' && status !== 'empty') continue;
    const data = toolResult.data && typeof toolResult.data === 'object' ? toolResult.data : null;
    if (!data) continue;
    out.push({ toolName, data, status: status || 'success' });
  }
  return out;
}

module.exports = { projectToolTracesFromLoopTrace };
