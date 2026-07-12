const test = require('node:test');
const assert = require('node:assert/strict');

const { loadToolRegistry, getAllowedToolNames, getEnabledTools } = require('../src/agentization/tools/registry/registryLoader');
const {
  buildFunctionToolsFromRegistry,
  contractToJsonSchemaParameters
} = require('../src/agentization/tools/toolSchemaBuilder');
const { mapFunctionToolsForProvider } = require('../src/agentization/tools/toolProviderAdapter');

test('registry loader reads enabled tools and normalized parameters', () => {
  const registry = loadToolRegistry({ forceReload: true });
  const tools = getEnabledTools(registry);
  assert.ok(tools.length >= 1);
  const target = tools.find((x) => x.toolName === 'error_code_lookup');
  assert.ok(target);
  assert.ok(target.parameters);
  assert.deepEqual(target.inputContract.requiredSlots, []);
  assert.deepEqual(target.inputContract.optionalSlots, ['language', 'subsystem']);
  assert.deepEqual(target.runtime.defaults, { language: 'zh-CN' });
  assert.deepEqual(target.parameters?.properties?.seriesCode?.enum, ['SR', 'SA']);
  assert.equal(
    String(target.parameters?.properties?.errorCode?.pattern || ''),
    '^(?:0X[0-9A-F]{4}|[1-9A][0-9A-F]{5}[A-E])$'
  );
  assert.equal(target.execution.handler, 'errorCodeLookupHandler.execute');
});

test('tool schema builder maps registry to OpenAI function tools', () => {
  const out = buildFunctionToolsFromRegistry({ lang: 'zh' });
  assert.ok(out.toolNames.includes('error_code_lookup'));
  assert.equal(out.tools.length, out.toolNames.length);

  const tool = out.tools.find((x) => x.function.name === 'error_code_lookup');
  assert.ok(tool);
  assert.equal(tool.type, 'function');
  assert.match(tool.function.description, /故障码/);
  assert.doesNotMatch(tool.function.description, /适用场景/);
  assert.equal(tool.function.parameters.type, 'object');
  assert.equal(tool.function.parameters.additionalProperties, false);
  assert.deepEqual(tool.function.parameters.anyOf, [
    { required: ['errorCode', 'seriesCode'] },
    { required: ['keywords', 'seriesCode'] }
  ]);
  assert.deepEqual(tool.function.parameters.properties.seriesCode.enum, ['SR', 'SA']);
  assert.equal(
    String(tool.function.parameters.properties.errorCode.pattern),
    '^(?:0X[0-9A-F]{4}|[1-9A][0-9A-F]{5}[A-E])$'
  );
});

test('contractToJsonSchemaParameters converts anyOfRequired groups', () => {
  const schema = contractToJsonSchemaParameters({
    properties: {
      errorCode: { type: 'string' },
      keywords: { type: 'string' }
    },
    requiredSlots: [],
    anyOfRequired: [['errorCode', 'keywords']]
  });
  assert.deepEqual(schema.anyOf, [
    { required: ['errorCode'] },
    { required: ['keywords'] }
  ]);
});

test('tool provider adapter maps tools for deepseek provider shape', () => {
  const { tools } = buildFunctionToolsFromRegistry();
  const mapped = mapFunctionToolsForProvider(tools, {
    id: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com',
    capabilities: { toolCalls: true, strictTools: { default: false } },
    orchestrator: { toolChoice: 'auto' }
  });
  assert.ok(Array.isArray(mapped.tools));
  assert.ok(mapped.tools.length >= 1);
  assert.equal(mapped.tool_choice, 'auto');
  assert.equal(mapped.tools[0].function.strict, undefined);
});

test('allowed tool names includes registry tools', () => {
  const names = getAllowedToolNames(loadToolRegistry());
  assert.ok(names.has('error_code_lookup'));
});
