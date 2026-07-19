const fs = require('fs/promises');
const path = require('path');
const { sanitizeMultimodalPayload } = require('./multimodalPayloadSanitizer');

function isEnabled() {
  const v = String(process.env.AGENT_DEBUG_MD_ENABLED || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function resolveOutputPath() {
  const custom = String(process.env.AGENT_DEBUG_MD_PATH || '').trim();
  if (custom) return path.resolve(custom);
  return path.resolve(process.cwd(), 'docs', 'agent-debug-log.md');
}

function safeJson(v) {
  try {
    return JSON.stringify(sanitizeMultimodalPayload(v), null, 2);
  } catch (_) {
    return '"[unserializable]"';
  }
}

function formatNullish(v) {
  if (v == null) return 'null';
  const t = String(v).trim();
  return t || 'null';
}

async function appendLines(lines) {
  const outPath = resolveOutputPath();
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.appendFile(outPath, lines.join('\n'), 'utf8');
}

async function appendLlmApiDebugMarkdown({
  jobId,
  requestId,
  traceId,
  conversationId,
  step,
  callType,
  error,
  stage,
  requestPayload,
  responsePayload
}) {
  if (!isEnabled()) return;

  const lines = [];
  const now = new Date();
  lines.push(
    `## ${now.toISOString()} | job=${formatNullish(jobId)} | requestId=${formatNullish(requestId)} | traceId=${formatNullish(traceId)} | conversationId=${formatNullish(conversationId)} | stage=${formatNullish(stage)} | callType=${formatNullish(callType)} | step=${formatNullish(step)}`
  );
  lines.push('');

  lines.push('### LLM API 请求');
  lines.push('```json');
  lines.push(safeJson(requestPayload == null ? null : requestPayload));
  lines.push('```');
  lines.push('');

  lines.push('### LLM API 响应');
  lines.push('```json');
  lines.push(safeJson(responsePayload == null ? null : responsePayload));
  lines.push('```');
  lines.push('');

  if (error) {
    lines.push('### 异常');
    lines.push('```');
    lines.push(String(error.stack || '').trim() || '(no stack)');
    lines.push('```');
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  await appendLines(lines);
}

async function appendAgentDebugMarkdown({ error, jobId, request, stage }) {
  if (!isEnabled() || !error) return;

  const lines = [];
  const now = new Date();
  lines.push(`## ${now.toISOString()} | job=${formatNullish(jobId)} | requestId=${formatNullish(request?.requestId)} | traceId=${formatNullish(request?.traceId)} | conversationId=${formatNullish(request?.channel?.conversationId)} | stage=${formatNullish(stage)}`);
  lines.push('');
  lines.push('### 异常');
  lines.push('```');
  lines.push(String(error.stack || '').trim() || '(no stack)');
  lines.push('```');
  lines.push('');
  lines.push('---');
  lines.push('');

  await appendLines(lines);
}

module.exports = {
  appendLlmApiDebugMarkdown,
  appendAgentDebugMarkdown
};
