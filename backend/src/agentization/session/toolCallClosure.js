function normalizeToolCallId(value) {
  return String(value || '').trim();
}

function extractTurnResultToolCallIds(turnResult) {
  return Array.isArray(turnResult?.toolCalls)
    ? turnResult.toolCalls.map((item) => normalizeToolCallId(item?.id)).filter(Boolean)
    : [];
}

function extractRawToolCallIds(rawMessage) {
  return Array.isArray(rawMessage?.tool_calls)
    ? rawMessage.tool_calls.map((item) => normalizeToolCallId(item?.id)).filter(Boolean)
    : [];
}

function extractProjectedToolCallIds(row) {
  const projected = row?.payload_tool_calls;
  const list = Array.isArray(projected)
    ? projected
    : (typeof projected === 'string' ? safeParseArray(projected) : []);
  return list.map((item) => normalizeToolCallId(item?.id)).filter(Boolean);
}

function safeParseArray(value) {
  try {
    const parsed = JSON.parse(String(value || ''));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function hasCompleteToolResponses(expectedIds, actualIds) {
  const expected = Array.from(new Set((Array.isArray(expectedIds) ? expectedIds : []).filter(Boolean)));
  if (expected.length === 0) return true;
  const actual = new Set((Array.isArray(actualIds) ? actualIds : []).filter(Boolean));
  return expected.every((id) => actual.has(id));
}

function shouldPersistClosedOrchestratorEntry(traceEntry, loopTrace) {
  const expectedIds = extractTurnResultToolCallIds(traceEntry?.turnResult);
  if (expectedIds.length === 0) return true;
  const step = Number(traceEntry?.step || 0);
  const actualIds = (Array.isArray(loopTrace) ? loopTrace : [])
    .filter((entry) => entry?.kind === 'tool' && Number(entry?.step || 0) === step)
    .map((entry) => normalizeToolCallId(entry?.toolCallId));
  return hasCompleteToolResponses(expectedIds, actualIds);
}

function isClosedProjectedOrchestratorRow(row, followingRows) {
  const rawIds = extractRawToolCallIds(row?.payload_raw_message);
  const expectedIds = rawIds.length > 0 ? rawIds : extractProjectedToolCallIds(row);
  if (expectedIds.length === 0) return true;
  const actualIds = (Array.isArray(followingRows) ? followingRows : [])
    .filter((entry) => String(entry?.role || '').trim().toLowerCase() === 'tool')
    .map((entry) => normalizeToolCallId(entry?.payload_tool_call_id || entry?.tool_call_id));
  return hasCompleteToolResponses(expectedIds, actualIds);
}

module.exports = {
  hasCompleteToolResponses,
  shouldPersistClosedOrchestratorEntry,
  isClosedProjectedOrchestratorRow
};
