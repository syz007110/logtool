const { loadSystemPrompt, loadMemoryPrompt } = require('./promptLoader');
const { buildFunctionToolsFromRegistry } = require('../tools/toolSchemaBuilder');
const { loadToolRegistry } = require('../tools/registry/registryLoader');

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function strOrNull(v) {
  const t = String(v == null ? '' : v).trim();
  return t || null;
}

function resolveLang(contextEnvelope = {}) {
  return String(
    contextEnvelope.lang
    || contextEnvelope.sessionMeta?.lang
    || 'zh-CN'
  ).trim();
}

function buildCurrentUserMessage(contextEnvelope = {}) {
  const query = String(contextEnvelope.currentQuery || '').trim();
  const fileIds = Array.isArray(contextEnvelope?.currentInput?.fileIds)
    ? contextEnvelope.currentInput.fileIds.filter(Boolean)
    : [];
  const parts = [];
  if (query) parts.push(query);
  if (fileIds.length > 0) parts.push(`附件 fileIds: ${fileIds.join(', ')}`);
  const content = parts.join('\n\n').trim();
  return content ? { role: 'user', content } : null;
}

function buildHistoryMessages(contextEnvelope = {}) {
  const historyContext = asObject(contextEnvelope.historyContext);
  const rows = Array.isArray(historyContext.messages) ? historyContext.messages : [];
  const out = [];
  for (const row of rows) {
    const role = String(row?.role || '').trim();
    if (!role || !['user', 'assistant', 'tool'].includes(role)) continue;

    const toolCalls = Array.isArray(row.tool_calls) ? row.tool_calls : [];
    const content = row.content == null ? null : strOrNull(row.content);

    if (role === 'tool') {
      const toolCallId = String(row.tool_call_id || '').trim();
      if (!toolCallId || !content) continue;
      out.push({ role: 'tool', tool_call_id: toolCallId, content });
      continue;
    }

    if (role === 'assistant' && toolCalls.length > 0) {
      out.push({
        role: 'assistant',
        content: row.content == null ? null : content,
        tool_calls: toolCalls
      });
      continue;
    }

    if (!content) continue;
    out.push({ role, content });
  }
  return out;
}

/**
 * Build ChatCompletionRequest using explicit messages (Turn Loop subsequent rounds).
 */
function buildChatRequestFromMessages(options = {}) {
  const messages = Array.isArray(options.messages) ? options.messages : [];
  const contextEnvelope = asObject(options.contextEnvelope);
  const lang = resolveLang(contextEnvelope);
  const { langKey } = loadSystemPrompt(lang);
  const toolsPack = buildFunctionToolsFromRegistry({
    userPermissions: options.userPermissions,
    channelType: options.channelType,
    registry: loadToolRegistry()
  });
  const tools = toolsPack.tools.length > 0 ? toolsPack.tools : null;

  return {
    model: String(options.model || '').trim(),
    messages: messages.map((msg) => ({ ...msg })),
    tools,
    tool_choice: tools ? 'auto' : 'none',
    temperature: 0,
    top_p: 0.1,
    max_tokens: 4096,
    stream: false,
    response_format: null,
    stop: null,
    extensions: {
      traceId: String(options.traceId || '').trim() || null,
      registryVersion: String(toolsPack.registryVersion || 'v1'),
      lang,
      langKey
    }
  };
}

/**
 * Build Orchestrator canonical ChatCompletionRequest from contextEnvelope.
 * @param {{ contextEnvelope?: object, userPermissions?: string[], channelType?: string, model?: string, traceId?: string, extraMessages?: object[] }} options
 */
function assembleChatCompletionRequest(options = {}) {
  const contextEnvelope = asObject(options.contextEnvelope);
  const lang = resolveLang(contextEnvelope);
  const { langKey, systemPrompt } = loadSystemPrompt(lang);
  const memoryPrompt = strOrNull(loadMemoryPrompt(lang));

  const messages = [];
  messages.push({ role: 'system', content: systemPrompt });

  const summary = strOrNull(contextEnvelope?.historySummary?.summary);
  if (summary) {
    messages.push({ role: 'user', content: `[history_summary]\n${summary}` });
  }

  messages.push(...buildHistoryMessages(contextEnvelope));

  const currentUser = buildCurrentUserMessage(contextEnvelope);
  if (currentUser) messages.push(currentUser);

  if (memoryPrompt) {
    messages.push({ role: 'user', content: `[memory]\n${memoryPrompt}` });
  }

  const extraMessages = Array.isArray(options.extraMessages) ? options.extraMessages : [];
  for (const msg of extraMessages) {
    if (msg && typeof msg === 'object' && msg.role && msg.content != null) {
      messages.push(msg);
    }
  }

  const toolsPack = buildFunctionToolsFromRegistry({
    userPermissions: options.userPermissions,
    channelType: options.channelType,
    registry: loadToolRegistry()
  });
  const tools = toolsPack.tools.length > 0 ? toolsPack.tools : null;

  return {
    model: String(options.model || '').trim(),
    messages,
    tools,
    tool_choice: tools ? 'auto' : 'none',
    temperature: 0,
    top_p: 0.1,
    max_tokens: 4096,
    stream: false,
    response_format: null,
    stop: null,
    extensions: {
      traceId: String(options.traceId || '').trim() || null,
      registryVersion: String(toolsPack.registryVersion || 'v1'),
      lang,
      langKey
    }
  };
}

function buildInitialLoopMessages(options = {}) {
  return assembleChatCompletionRequest(options).messages;
}

module.exports = {
  assembleChatCompletionRequest,
  buildChatRequestFromMessages,
  buildInitialLoopMessages,
  buildCurrentUserMessage,
  buildHistoryMessages,
  resolveLang
};
