const test = require('node:test');
const assert = require('node:assert/strict');

const { loadToolRegistry, getAllowedToolNames, getEnabledTools } = require('../src/agentization/tools/registry/registryLoader');
const { buildIntentToolPrompt } = require('../src/agentization/tools/registry/toolPromptBinder');

test('registry loader reads enabled tools and normalized slot fields', () => {
  const registry = loadToolRegistry({ forceReload: true });
  const tools = getEnabledTools(registry);
  assert.ok(tools.length >= 1);
  const target = tools.find((x) => x.toolName === 'error_code_lookup');
  assert.ok(target);
  assert.deepEqual(target.inputContract.requiredSlots, []);
  assert.deepEqual(target.inputContract.optionalSlots, ['language']);
  assert.equal(
    String(target.inputContract?.properties?.errorCode?.pattern || ''),
    '^(?:0X[0-9A-F]{4}|[1-9A][0-9A-F]{5}[A-E])$'
  );
});

test('tool prompt binder builds prompt from registry fields', () => {
  const out = buildIntentToolPrompt();
  assert.ok(Array.isArray(out.toolNames));
  assert.ok(out.toolNames.includes('error_code_lookup'));
  assert.match(out.toolPrompt, /error_code_lookup/);
  assert.match(out.toolPrompt, /用途：/);
  assert.match(out.toolPrompt, /anyOfRequired/);
  assert.doesNotMatch(out.toolPrompt, /适用条件：/);
});

test('allowed tool names includes registry tools', () => {
  const names = getAllowedToolNames(loadToolRegistry());
  assert.ok(names.has('error_code_lookup'));
});
