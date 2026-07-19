const test = require('node:test');
const assert = require('node:assert/strict');

const {
  loadSystemPrompt,
  loadPromptBlocks
} = require('../src/agentization/orchestrator/promptLoader');
const { buildOrchestratorMessages, buildOrchestratorPromptInjectionSnapshot } = require('../src/agentization/orchestrator/promptRenderer');

test('promptLoader exposes prompt blocks from manifest', () => {
  const blocks = loadPromptBlocks('zh');
  assert.equal(blocks.langKey, 'zh');
  assert.ok(blocks.blocks.system);
  assert.ok(blocks.blocks.tool);
  assert.ok(blocks.blocks.memory);
  assert.equal(blocks.blocks.context, undefined);
  assert.match(blocks.system, /# Role/);
});

test('system.md contains Role/Mission/Boundary chapters', () => {
  const { systemPrompt } = loadSystemPrompt('zh');
  assert.match(systemPrompt, /# Mission/);
  assert.match(systemPrompt, /# Boundary/);
  assert.match(systemPrompt, /tools\[\]/);
});

test('system prompt loads by lang', () => {
  assert.match(loadSystemPrompt('zh').systemPrompt, /腹腔镜手术机器人/);
  assert.match(loadSystemPrompt('en').systemPrompt, /laparoscopic/i);
});

test('promptRenderer builds messages without context template', () => {
  const snapshot = buildOrchestratorPromptInjectionSnapshot({
    lang: 'zh',
    currentQuery: '141010A 是什么故障',
    currentInput: { assetIds: [] },
    historySummary: { summary: null },
    historyContext: { messages: [] }
  });
  const messages = snapshot.messages;
  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /# Role/);
  const userBodies = messages.filter((m) => m.role === 'user').map((m) => m.content);
  assert.ok(userBodies.length >= 1);
  assert.match(userBodies.join('\n'), /141010A 是什么故障/);
  assert.doesNotMatch(userBodies.join('\n'), /\{\{currentQuery\}\}/);
  assert.doesNotMatch(userBodies.join('\n'), /仅返回 JSON/);
  assert.ok(Array.isArray(snapshot.functionTools));
  assert.ok(snapshot.functionTools.some((t) => t.function.name === 'error_code_lookup'));
});

test('buildOrchestratorMessages returns message array only', () => {
  const messages = buildOrchestratorMessages({
    lang: 'zh',
    currentQuery: 'test',
    currentInput: { assetIds: [] },
    historySummary: { summary: null },
    historyContext: { messages: [] }
  });
  assert.equal(Array.isArray(messages), true);
  assert.equal(messages.every((m) => m.role && m.content != null), true);
});
