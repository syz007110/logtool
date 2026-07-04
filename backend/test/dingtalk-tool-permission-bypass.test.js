const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFunctionToolsFromRegistry,
  toolAllowedForPermissions
} = require('../src/agentization/tools/toolSchemaBuilder');
const {
  createLogtoolToolGateway,
  toolAllowsPermissionBypassForChannel
} = require('../src/agentization/tools/logtoolToolGateway');

function buildRegistryTool() {
  return {
    toolName: 'error_code_lookup',
    enabled: true,
    description: 'test',
    parameters: { type: 'object', properties: {} },
    security: {
      requiredPermissions: ['error_code:read'],
      permissionBypassChannels: ['dingtalk']
    },
    runtime: {
      execution: {
        mode: 'sync',
        handler: 'errorCodeLookupHandler.execute',
        timeoutMs: 5000
      }
    }
  };
}

function buildRegistry() {
  const tool = buildRegistryTool();
  return {
    registryVersion: 'v1',
    tools: [tool],
    byName: new Map([[tool.toolName, tool]])
  };
}

test('tool schema builder allows dingtalk channel to see bypassed tool without local permissions', () => {
  const registry = buildRegistry();
  const built = buildFunctionToolsFromRegistry({
    registry,
    userPermissions: [],
    channelType: 'dingtalk'
  });

  assert.equal(built.toolNames.includes('error_code_lookup'), true);
  assert.equal(toolAllowedForPermissions(buildRegistryTool(), [], 'dingtalk'), true);
  assert.equal(toolAllowedForPermissions(buildRegistryTool(), [], 'web'), false);
});

test('logtool gateway bypasses permission enforcement for dingtalk channel only', () => {
  const gateway = createLogtoolToolGateway();
  const tool = buildRegistryTool();

  assert.equal(toolAllowsPermissionBypassForChannel(tool, { channel: { type: 'dingtalk' } }), true);
  assert.equal(toolAllowsPermissionBypassForChannel(tool, { channel: { type: 'web' } }), false);

  assert.doesNotThrow(() => {
    gateway.enforceToolPermission(tool, {
      channel: { type: 'dingtalk' },
      context: { userPermissions: [] }
    });
  });

  assert.throws(() => {
    gateway.enforceToolPermission(tool, {
      channel: { type: 'web' },
      context: { userPermissions: [] }
    });
  }, /permission denied/);
});
