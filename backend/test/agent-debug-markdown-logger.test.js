const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const {
  appendLlmApiDebugMarkdown,
  appendAgentDebugMarkdown
} = require('../src/agentization/utils/agentDebugMarkdownLogger');

test('agent debug markdown logger appends one llm api request and response per call', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-debug-md-'));
  const outPath = path.join(tempDir, 'agent-debug-log.md');
  const previousEnabled = process.env.AGENT_DEBUG_MD_ENABLED;
  const previousPath = process.env.AGENT_DEBUG_MD_PATH;

  process.env.AGENT_DEBUG_MD_ENABLED = 'true';
  process.env.AGENT_DEBUG_MD_PATH = outPath;

  try {
    await appendLlmApiDebugMarkdown({
      jobId: 'job-1',
      requestId: 'req-1',
      traceId: 'trace-1',
      conversationId: 'conv-1',
      stage: 'turn_loop',
      callType: 'orchestrator',
      step: 2,
      requestPayload: {
        model: 'deepseek-v4-flash',
        messages: [
          { role: 'assistant', tool_calls: [{ id: 'tc-1', function: { name: 'error_code_lookup' } }] },
          { role: 'tool', tool_call_id: 'tc-1', content: '{"code":"141010A"}' }
        ]
      },
      responsePayload: {
        id: 'resp-2',
        choices: [{ message: { role: 'assistant', content: '141010A 表示期望位置偏差故障。' } }]
      }
    });

    const content = await fs.readFile(outPath, 'utf8');
    assert.match(content, /callType=orchestrator/);
    assert.match(content, /step=2/);
    assert.match(content, /conversationId=conv-1/);
    assert.match(content, /### LLM API 请求/);
    assert.match(content, /### LLM API 响应/);
    assert.match(content, /"tool_call_id": "tc-1"/);
    assert.match(content, /141010A 表示期望位置偏差故障/);
    assert.doesNotMatch(content, /### Agent 标准请求/);
    assert.doesNotMatch(content, /### Agent 标准响应/);
  } finally {
    if (previousEnabled == null) delete process.env.AGENT_DEBUG_MD_ENABLED;
    else process.env.AGENT_DEBUG_MD_ENABLED = previousEnabled;
    if (previousPath == null) delete process.env.AGENT_DEBUG_MD_PATH;
    else process.env.AGENT_DEBUG_MD_PATH = previousPath;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('agent debug markdown logger omits multimodal base64 bodies', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-debug-md-'));
  const outPath = path.join(tempDir, 'agent-debug-log.md');
  const previousEnabled = process.env.AGENT_DEBUG_MD_ENABLED;
  const previousPath = process.env.AGENT_DEBUG_MD_PATH;

  process.env.AGENT_DEBUG_MD_ENABLED = 'true';
  process.env.AGENT_DEBUG_MD_PATH = outPath;

  try {
    await appendLlmApiDebugMarkdown({
      jobId: 'job-3',
      requestId: 'req-3',
      traceId: 'trace-3',
      conversationId: 'conv-3',
      stage: 'turn_loop',
      callType: 'orchestrator',
      step: 1,
      requestPayload: {
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: '看图' },
            { type: 'image_url', image_url: 'data:image/png;base64,AAAAFFFF' }
          ]
        }]
      },
      responsePayload: { ok: true }
    });

    const content = await fs.readFile(outPath, 'utf8');
    assert.match(content, /\[omitted image\/png base64 length=8\]/);
    assert.doesNotMatch(content, /data:image\/png;base64,AAAAFFFF/);
  } finally {
    if (previousEnabled == null) delete process.env.AGENT_DEBUG_MD_ENABLED;
    else process.env.AGENT_DEBUG_MD_ENABLED = previousEnabled;
    if (previousPath == null) delete process.env.AGENT_DEBUG_MD_PATH;
    else process.env.AGENT_DEBUG_MD_PATH = previousPath;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('agent debug markdown logger writes runtime error section only when error exists', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-debug-md-'));
  const outPath = path.join(tempDir, 'agent-debug-log.md');
  const previousEnabled = process.env.AGENT_DEBUG_MD_ENABLED;
  const previousPath = process.env.AGENT_DEBUG_MD_PATH;

  process.env.AGENT_DEBUG_MD_ENABLED = 'true';
  process.env.AGENT_DEBUG_MD_PATH = outPath;

  try {
    await appendAgentDebugMarkdown({
      jobId: 'job-2',
      request: { requestId: 'req-2', traceId: 'trace-2', channel: { conversationId: 'conv-2' } },
      stage: 'persist_done'
    });

    let missing = false;
    try {
      await fs.readFile(outPath, 'utf8');
    } catch (error) {
      missing = error && error.code === 'ENOENT';
    }
    assert.equal(missing, true);

    await appendAgentDebugMarkdown({
      jobId: 'job-2',
      request: { requestId: 'req-2', traceId: 'trace-2', channel: { conversationId: 'conv-2' } },
      stage: 'persist_done',
      error: new Error('persist failed')
    });

    const content = await fs.readFile(outPath, 'utf8');
    assert.match(content, /conversationId=conv-2/);
    assert.match(content, /### 异常/);
    assert.match(content, /persist failed/);
    assert.doesNotMatch(content, /### LLM API 请求/);
  } finally {
    if (previousEnabled == null) delete process.env.AGENT_DEBUG_MD_ENABLED;
    else process.env.AGENT_DEBUG_MD_ENABLED = previousEnabled;
    if (previousPath == null) delete process.env.AGENT_DEBUG_MD_PATH;
    else process.env.AGENT_DEBUG_MD_PATH = previousPath;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
