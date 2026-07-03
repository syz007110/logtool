const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getSmartSearchLlmStatusForProvider,
  getAgentOrchestratorLlmStatusForProvider
} = require('../src/services/smartSearchLlmService');

const baseProvider = {
  id: 'test',
  label: 'Test',
  kind: 'openai_compatible',
  requiresApiKey: true,
  apiKey: 'sk-test',
  baseUrl: 'https://example.com/v1',
  model: 'test-model'
};

test('smart search and agent orchestrator use independent enable flags', () => {
  const prevSmart = process.env.SMART_SEARCH_LLM_ENABLED;
  const prevAgent = process.env.AGENT_ORCHESTRATOR_LLM_ENABLED;
  try {
    process.env.SMART_SEARCH_LLM_ENABLED = 'false';
    process.env.AGENT_ORCHESTRATOR_LLM_ENABLED = 'true';

    const smartStatus = getSmartSearchLlmStatusForProvider(baseProvider);
    const agentStatus = getAgentOrchestratorLlmStatusForProvider(baseProvider);

    assert.equal(smartStatus.available, false);
    assert.equal(smartStatus.reason, 'not_enabled');
    assert.equal(agentStatus.available, true);
    assert.equal(agentStatus.reason, 'ok');
  } finally {
    if (prevSmart === undefined) delete process.env.SMART_SEARCH_LLM_ENABLED;
    else process.env.SMART_SEARCH_LLM_ENABLED = prevSmart;
    if (prevAgent === undefined) delete process.env.AGENT_ORCHESTRATOR_LLM_ENABLED;
    else process.env.AGENT_ORCHESTRATOR_LLM_ENABLED = prevAgent;
  }
});

test('agent orchestrator defaults to enabled when flag is unset', () => {
  const prevAgent = process.env.AGENT_ORCHESTRATOR_LLM_ENABLED;
  try {
    delete process.env.AGENT_ORCHESTRATOR_LLM_ENABLED;
    const status = getAgentOrchestratorLlmStatusForProvider(baseProvider);
    assert.equal(status.enabled, true);
    assert.equal(status.available, true);
  } finally {
    if (prevAgent === undefined) delete process.env.AGENT_ORCHESTRATOR_LLM_ENABLED;
    else process.env.AGENT_ORCHESTRATOR_LLM_ENABLED = prevAgent;
  }
});
