const fs = require('fs/promises');
const path = require('path');
const { buildOrchestratorPromptInjectionSnapshot } = require('../orchestrator/promptRenderer');

function isEnabled() {
  const v = String(process.env.AGENT_DEBUG_MD_ENABLED || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function resolveOutputPath() {
  const custom = String(process.env.AGENT_DEBUG_MD_PATH || '').trim();
  if (custom) return path.resolve(custom);
  return path.resolve(process.cwd(), 'docs', 'agent-debug-log.md');
}

function asObject(input) {
  return input && typeof input === 'object' && !Array.isArray(input) ? input : {};
}

function toText(v) {
  return String(v == null ? '' : v).trim();
}

function safeJson(v) {
  try {
    return JSON.stringify(v, null, 2);
  } catch (_) {
    return '"[unserializable]"';
  }
}

function formatNullish(v) {
  if (v == null) return 'null';
  const t = String(v).trim();
  return t || 'null';
}

function ynFromAttachments(attachments) {
  return Array.isArray(attachments) && attachments.length > 0 ? '是' : '否';
}

async function appendAgentDebugMarkdown({
  jobId,
  request,
  contextEnvelope,
  orchestratorResult,
  assistantResponse,
  includePromptInjection,
  error,
  stage
}) {
  if (!isEnabled()) return;
  const req = asObject(request);
  const env = contextEnvelope && typeof contextEnvelope === 'object' ? contextEnvelope : {};
  const currentInput = asObject(env.currentInput);
  const currentQuery = toText(env.currentQuery);
  const historySummary = asObject(env.historySummary);
  const historyContext = asObject(env.historyContext);
  const historyMessages = Array.isArray(historyContext.messages) ? historyContext.messages : [];
  const orchestrator = asObject(orchestratorResult);
  const toolCalls = Array.isArray(orchestrator.toolCalls) ? orchestrator.toolCalls : [];
  const assistMeta = asObject(assistantResponse?.debugMeta);
  const toolMeta = asObject(assistMeta.toolResult);

  const lines = [];
  const now = new Date();
  lines.push(`## ${now.toISOString()} | job=${formatNullish(jobId)} | requestId=${formatNullish(req.requestId)} | traceId=${formatNullish(req.traceId)} | stage=${formatNullish(stage)}`);
  lines.push('');

  const shouldLogPrompts = Boolean(includePromptInjection);
  if (shouldLogPrompts) {
    let injection = {
      systemPrompt: null,
      userPrompt: null,
      functionTools: null,
      memoryPrompt: null,
      systemFallbackUsed: false,
      systemEffective: null
    };
    try {
      injection = buildOrchestratorPromptInjectionSnapshot(env);
    } catch (_) {
      injection = {
        systemPrompt: null,
        userPrompt: null,
        functionTools: null,
        memoryPrompt: null,
        systemFallbackUsed: false,
        systemEffective: null
      };
    }

    lines.push('### Orchestrator 提示词（注入，空则为 null）');
    lines.push('> 仅在**新建会话实例**的本轮首次记录；同一会话内后续消息不重复打印。');
    lines.push(`- 系统提示词（配置）: ${formatNullish(injection.systemPrompt)}`);
    if (injection.systemFallbackUsed) {
      lines.push('- 说明: 系统提示词配置为空，实际请求已使用内置回退模板。');
      lines.push(`- 系统提示词（实际下发）: ${formatNullish(injection.systemEffective)}`);
    }
    lines.push(`- 用户提示词: ${formatNullish(injection.userPrompt)}`);
    lines.push('- API tools[]:');
    lines.push('```json');
    lines.push(safeJson(injection.functionTools));
    lines.push('```');
    lines.push(`- 记忆提示词: ${formatNullish(injection.memoryPrompt)}`);
    lines.push('');
  } else {
    lines.push('### Orchestrator 提示词（注入）');
    lines.push('- （同一会话实例已记录过，略 — 与新建实例时一致）');
    lines.push('');
  }

  lines.push('### 用户侧上下文（本回合）');
  lines.push(`- 当前的问题（currentQuery）: ${formatNullish(currentQuery)}`);
  lines.push(`- 是否包含附件: ${ynFromAttachments(currentInput.attachments)}`);
  lines.push('- 历史压缩摘要（historySummary，仅压缩发生时有值）:');
  lines.push('```json');
  lines.push(safeJson(historySummary));
  lines.push('```');
  lines.push('- 历史消息（historyContext.messages，时间正序：较早 → 较新）:');
  lines.push('```json');
  lines.push(safeJson(historyMessages));
  lines.push('```');
  lines.push('');

  lines.push('### Orchestrator LLM 结构化输出');
  lines.push(`- 回合类型（kind）: ${formatNullish(orchestrator.kind)}`);
  lines.push(`- 结束原因（finishReason）: ${formatNullish(orchestrator.finishReason)}`);
  lines.push(`- 文本内容（content）: ${formatNullish(orchestrator.content)}`);
  lines.push(`- 工具调用（toolCalls）: ${toolCalls.length > 0 ? toolCalls.map((tc) => tc.toolName).join(', ') : 'null'}`);
  lines.push('');

  lines.push('### LLM 原生返回（Orchestrator）');
  const orchestratorLlmRaw = orchestrator.llmRaw && typeof orchestrator.llmRaw === 'object' ? orchestrator.llmRaw : null;
  if (orchestratorLlmRaw && Object.keys(orchestratorLlmRaw).length > 0) {
    lines.push('```json');
    lines.push(safeJson(orchestratorLlmRaw));
    lines.push('```');
  } else {
    lines.push('- （无：本轮 orchestratorResult 未附带 llmRaw，或上游未启用 Orchestrator LLM）');
  }
  lines.push('');

  lines.push('### 本回合助手输出');
  lines.push(`- 助手回复文本（assistantResponse.text）: ${formatNullish(asObject(assistantResponse).text)}`);
  lines.push('');

  lines.push('### LLM 原生返回（执行 / 对话生成）');
  const execPayload = {};
  if (assistMeta.toolExecution && typeof assistMeta.toolExecution === 'object' && assistMeta.toolExecution.llmRaw) {
    execPayload.toolExecution = assistMeta.toolExecution.llmRaw;
  }
  if (assistMeta.smartSearch && typeof assistMeta.smartSearch === 'object' && assistMeta.smartSearch.llmRaw) {
    execPayload.smartSearch = assistMeta.smartSearch.llmRaw;
  }
  if (assistMeta.llmRaw != null) {
    execPayload.debugMetaTopLevel = assistMeta.llmRaw;
  }
  if (Object.keys(execPayload).length > 0) {
    lines.push('```json');
    lines.push(safeJson(execPayload));
    lines.push('```');
  } else {
    lines.push('- （无：本回合 debugMeta 未记录执行侧 llmRaw，或非 LLM 生成回复）');
  }
  lines.push('');

  if (toolMeta && Object.keys(toolMeta).length > 0 && 'status' in toolMeta) {
    lines.push('### 工具执行');
    lines.push(`- 结果状态（status）: ${formatNullish(toolMeta.status)}`);
    lines.push('- 内容（data）:');
    lines.push('```json');
    lines.push(safeJson(toolMeta.data));
    lines.push('```');
    if (toolMeta.error && typeof toolMeta.error === 'object') {
      lines.push('- 工具错误:');
      lines.push('```json');
      lines.push(safeJson(toolMeta.error));
      lines.push('```');
    }
    lines.push('');
  } else {
    lines.push('### 工具执行');
    lines.push('- （本回合未产生 toolResult 记录或未调用工具）');
    lines.push('');
  }

  lines.push('### 系统错误与异常');
  if (error) {
    lines.push(`- message: ${formatNullish(error.message || error)}`);
    if (error.code) lines.push(`- code: ${formatNullish(error.code)}`);
    lines.push('- stack:');
    lines.push('```');
    lines.push(String(error.stack || '').trim() || '(no stack)');
    lines.push('```');
  } else {
    lines.push('- （无）');
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  const outPath = resolveOutputPath();
  const block = lines.join('\n');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.appendFile(outPath, block, 'utf8');
}

module.exports = {
  appendAgentDebugMarkdown
};
