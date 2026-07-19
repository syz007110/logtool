const { isOrchestratorMessageType, MESSAGE_TYPES } = require('./conversationMessageTypes');
const { isClosedProjectedOrchestratorRow } = require('./toolCallClosure');

function asPlainObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return {};
}

function parseProjectedJson(value) {
  if (value == null) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }
  return {};
}

function normalizeHistoryText(row) {
  return String(row?.content || '').trim();
}

function mapRecentTurnRole(row) {
  const role = String(row?.role || '').trim().toLowerCase();
  if (role === 'user') return 'user';
  if (role === 'assistant') return 'assistant';
  if (role === 'tool' || role === 'observation') return 'tool';
  if (role === 'system') return 'system';
  return '';
}

function getProjectedRawMessage(row) {
  return parseProjectedJson(row?.payload_raw_message);
}

function getProjectedToolCalls(row) {
  const projected = row?.payload_tool_calls;
  if (Array.isArray(projected)) return projected;
  if (typeof projected === 'string') {
    try {
      const parsed = JSON.parse(projected);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

function extractToolCallsFromOrchestratorRow(row) {
  const rawMessage = getProjectedRawMessage(row);
  if (Array.isArray(rawMessage.tool_calls) && rawMessage.tool_calls.length > 0) {
    return rawMessage.tool_calls.map((tc) => ({
      id: String(tc?.id || ''),
      type: String(tc?.type || 'function'),
      function: {
        name: String(tc?.function?.name || '').trim(),
        arguments: String(tc?.function?.arguments ?? '')
      }
    })).filter((tc) => tc.id && tc.function.name);
  }

  const toolCalls = getProjectedToolCalls(row);
  return toolCalls.map((tc) => ({
    id: String(tc?.id || ''),
    type: 'function',
    function: {
      name: String(tc?.toolName || tc?.tool_name || '').trim(),
      arguments: String(tc?.rawArguments ?? JSON.stringify(tc?.arguments || {}))
    }
  })).filter((tc) => tc.id && tc.function.name);
}

function projectOrchestratorHistoryRow(row) {
  const toolCalls = extractToolCallsFromOrchestratorRow(row);
  if (!toolCalls.length) return null;

  const rawMessage = getProjectedRawMessage(row);
  const projectedContent = row?.payload_content;
  let content = null;
  if (rawMessage.role === 'assistant' && Object.prototype.hasOwnProperty.call(rawMessage, 'content')) {
    content = rawMessage.content == null ? null : String(rawMessage.content);
  } else if (projectedContent != null && projectedContent !== '') {
    content = String(projectedContent);
  }

  const out = {
    role: 'assistant',
    content,
    tool_calls: toolCalls
  };
  if (Object.prototype.hasOwnProperty.call(rawMessage, 'reasoning_content')
    && rawMessage.reasoning_content != null) {
    out.reasoning_content = String(rawMessage.reasoning_content);
  }
  return out;
}

function projectToolHistoryRow(row) {
  const toolCallId = String(
    row?.payload_tool_call_id
    || ''
  ).trim();
  const status = String(row?.payload_status || '').trim();
  let content = String(row?.content || '').trim();
  if (!content && status) {
    content = JSON.stringify({ status });
  }
  if (!toolCallId || !content) return null;
  return {
    role: 'tool',
    tool_call_id: toolCallId,
    content
  };
}

function projectHistoryRow(row) {
  const role = mapRecentTurnRole(row);
  if (!role) return null;

  const messageType = String(row?.message_type || '').trim().toLowerCase();
  if (role === 'user') {
    const content = normalizeHistoryText(row);
    return content ? { role: 'user', content } : null;
  }

  if (isOrchestratorMessageType(messageType)) {
    return projectOrchestratorHistoryRow(row);
  }

  if (messageType === MESSAGE_TYPES.TOOL) {
    return projectToolHistoryRow(row);
  }

  if (role === 'assistant') {
    const content = normalizeHistoryText(row);
    return content ? { role: 'assistant', content } : null;
  }

  if (role === 'tool') {
    return projectToolHistoryRow(row);
  }

  return null;
}

function normalizeHistoryContextMessage(message) {
  if (!message || typeof message !== 'object') return null;
  const role = String(message.role || '').trim();
  if (!role) return null;

  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const hasToolCalls = role === 'assistant' && toolCalls.length > 0;
  const content = message.content == null ? null : String(message.content);

  if (role === 'tool') {
    const toolCallId = String(message.tool_call_id || '').trim();
    if (!toolCallId || !content) return null;
    return { role: 'tool', tool_call_id: toolCallId, content };
  }

  if (hasToolCalls) {
    const out = {
      role: 'assistant',
      content,
      tool_calls: toolCalls
    };
    if (message.reasoning_content != null) {
      out.reasoning_content = String(message.reasoning_content);
    }
    return out;
  }

  if (!content) return null;
  const out = { role, content };
  if (message.reasoning_content != null) {
    out.reasoning_content = String(message.reasoning_content);
  }
  return out;
}

function groupHistoryRounds(history) {
  const rounds = [];
  let current = null;
  for (const row of Array.isArray(history) ? history : []) {
    const role = String(row?.role || '').trim().toLowerCase();
    if (role === 'user') {
      if (current && current.length > 0) rounds.push(current);
      current = [row];
      continue;
    }
    if (!current) continue;
    current.push(row);
  }
  if (current && current.length > 0) rounds.push(current);
  return rounds;
}

function buildHistoryMessages(history, maxTurns = 2) {
  const rounds = groupHistoryRounds(history);
  if (!rounds.length) return [];
  const picked = rounds.slice(-Math.max(1, maxTurns));
  const out = [];
  for (const roundRows of picked) {
    const allowedToolCallIds = new Set();
    for (let i = 0; i < roundRows.length; i += 1) {
      const row = roundRows[i];
      const messageType = String(row?.message_type || '').trim().toLowerCase();
      if (isOrchestratorMessageType(messageType)) {
        const followingRows = roundRows.slice(i + 1);
        if (!isClosedProjectedOrchestratorRow(row, followingRows)) {
          continue;
        }
        const projectedOrchestrator = projectHistoryRow(row);
        const normalizedOrchestrator = projectedOrchestrator
          ? normalizeHistoryContextMessage(projectedOrchestrator)
          : null;
        if (!normalizedOrchestrator) continue;
        const toolCalls = Array.isArray(normalizedOrchestrator.tool_calls) ? normalizedOrchestrator.tool_calls : [];
        for (const toolCall of toolCalls) {
          const id = String(toolCall?.id || '').trim();
          if (id) allowedToolCallIds.add(id);
        }
        out.push(normalizedOrchestrator);
        continue;
      }
      if (messageType === MESSAGE_TYPES.TOOL || String(row?.role || '').trim().toLowerCase() === 'tool') {
        const toolCallId = String(row?.payload_tool_call_id || row?.tool_call_id || '').trim();
        if (!toolCallId || !allowedToolCallIds.has(toolCallId)) {
          continue;
        }
      }
      const projected = projectHistoryRow(row);
      if (!projected) continue;
      const normalized = normalizeHistoryContextMessage(projected);
      if (normalized) out.push(normalized);
    }
  }
  return out;
}

module.exports = {
  buildHistoryMessages,
  projectHistoryRow,
  projectOrchestratorHistoryRow,
  projectToolHistoryRow,
  normalizeHistoryContextMessage
};
