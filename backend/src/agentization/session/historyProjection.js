const { isOrchestratorMessageType, MESSAGE_TYPES } = require('./conversationMessageTypes');

function asPlainObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return {};
}

function normalizeHistoryText(row) {
  const direct = String(row?.content || '').trim();
  if (direct) return direct;
  const payload = asPlainObject(row?.payload);
  return String(payload?.text || '').trim();
}

function mapRecentTurnRole(row) {
  const role = String(row?.role || '').trim().toLowerCase();
  if (role === 'user') return 'user';
  if (role === 'assistant') return 'assistant';
  if (role === 'tool' || role === 'observation') return 'tool';
  if (role === 'system') return 'system';
  return '';
}

function extractToolCallsFromOrchestratorPayload(payload) {
  const p = asPlainObject(payload);
  const rawMessage = asPlainObject(p.rawMessage);
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

  const toolCalls = Array.isArray(p.toolCalls) ? p.toolCalls : [];
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
  const payload = asPlainObject(row?.payload);
  const toolCalls = extractToolCallsFromOrchestratorPayload(payload);
  if (!toolCalls.length) return null;

  const rawMessage = asPlainObject(payload.rawMessage);
  let content = null;
  if (rawMessage.role === 'assistant' && Object.prototype.hasOwnProperty.call(rawMessage, 'content')) {
    content = rawMessage.content == null ? null : String(rawMessage.content);
  } else if (payload.content != null) {
    content = String(payload.content);
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
  const payload = asPlainObject(row?.payload);
  const toolCallId = String(payload.toolCallId || payload.tool_call_id || '').trim();
  let content = String(row?.content || '').trim();
  if (!content && payload.status) {
    try {
      content = JSON.stringify(payload);
    } catch (_) {
      content = '';
    }
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
    for (const row of roundRows) {
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
