const test = require('node:test');
const assert = require('node:assert/strict');

const { createLogtoolToolGateway } = require('../src/agentization/tools/logtoolToolGateway');
const { getToolHandler } = require('../src/agentization/tools/handlers');
const { buildFunctionToolsFromRegistry, toolAllowedForPermissions } = require('../src/agentization/tools/toolSchemaBuilder');
const { loadToolRegistry, getEnabledTools } = require('../src/agentization/tools/registry/registryLoader');

function toolCall(toolName, args, id = 'call-1') {
  return {
    id,
    toolName,
    arguments: args,
    rawArguments: JSON.stringify(args)
  };
}

function turnResult(overrides = {}) {
  return {
    turnVersion: 'v1',
    kind: 'tool_call',
    toolCalls: [],
    ...overrides
  };
}

test('gateway validates required anyOf slots for error_code_lookup', () => {
  const gateway = createLogtoolToolGateway();
  assert.throws(() => {
    gateway.validateToolArguments('error_code_lookup', { language: 'zh-CN' });
  }, /missing anyOfRequired/i);
});

test('gateway accepts full log fault code in error_code_lookup args pattern', () => {
  const gateway = createLogtoolToolGateway();
  const out = gateway.validateToolArguments('error_code_lookup', { errorCode: '141010A', language: 'zh-CN' });
  assert.equal(out.arguments.errorCode, '141010A');
});

test('gateway accepts subsystem in error_code_lookup args pattern', () => {
  const gateway = createLogtoolToolGateway();
  const out = gateway.validateToolArguments('error_code_lookup', {
    errorCode: '0X010A',
    subsystem: '2',
    language: 'zh-CN'
  });
  assert.equal(out.arguments.subsystem, '2');
});

test('gateway resolves registered tool through independent handler registry', async (t) => {
  const handler = getToolHandler('error_code_lookup');
  assert.equal(typeof handler.execute, 'function');

  const gateway = createLogtoolToolGateway();
  const originalExecute = handler.execute;
  handler.execute = async ({ args }) => ({
    text: `handler:${args.errorCode}`,
    data: {
      ambiguous: false,
      items: [
        {
          subsystem: '1',
          code: '0X010A',
          displayCode: '141010A',
          shortMessage: '',
          userHint: '',
          operation: '',
          params: { param1: '', param2: '', param3: '', param4: '' },
          detail: '',
          method: '',
          techSolution: '',
          category: '',
          explanation: null,
          prefix: null,
          prefixRaw: null
        }
      ]
    }
  });
  t.after(() => { handler.execute = originalExecute; });

  const out = await gateway.executeToolCall({
    toolName: 'error_code_lookup',
    args: { errorCode: '0X010A', language: 'zh-CN' },
    request: { traceId: 't-1' },
    orchestratorResult: turnResult()
  });

  assert.equal(out.text, 'handler:0X010A');
  assert.equal(out.data.items[0].displayCode, '141010A');
});

test('gateway enforces ToolResult matrix for failed status', () => {
  const gateway = createLogtoolToolGateway();
  assert.throws(() => {
    gateway.ensureToolResultMatrix({
      status: 'failed',
      data: null,
      evidence: [],
      error: null
    });
  }, /error.code/);
});

test('gateway invokeFromToolCall returns failed ToolResult on execution error', async (t) => {
  const gateway = createLogtoolToolGateway();
  const originalExecuteToolCall = gateway.executeToolCall;
  gateway.executeToolCall = async () => {
    const err = new Error('boom');
    err.code = 'TOOL_BROKEN';
    throw err;
  };
  t.after(() => { gateway.executeToolCall = originalExecuteToolCall; });

  const out = await gateway.invokeFromToolCall({
    toolCall: toolCall('error_code_lookup', { errorCode: '0X010A', language: 'zh-CN' }),
    request: { traceId: 't-1', message: { text: 'x' } },
    turnResult: turnResult()
  });

  assert.equal(out.debugMeta.toolResult.status, 'failed');
  assert.equal(out.debugMeta.toolResult.data, null);
  assert.equal(out.debugMeta.toolResult.error.code, 'TOOL_BROKEN');
});

test('gateway invokeFromToolCall maps error_code_lookup output to contracted data fields', async (t) => {
  const gateway = createLogtoolToolGateway();
  const originalExecuteToolCall = gateway.executeToolCall;
  gateway.executeToolCall = async () => ({
    text: '已查询到故障码 0X010A',
    data: {
      ambiguous: false,
      items: [
        {
          subsystem: '1',
          code: '0X010A',
          displayCode: '141010A',
          shortMessage: '关节位置偏差',
          userHint: '请检查机械臂状态',
          operation: '复位后重试',
          params: {
            param1: '指令位置',
            param2: '实际位置',
            param3: '指令速度',
            param4: '实际速度'
          },
          detail: '期望位置偏差超限',
          method: '检查编码器和传动机构',
          techSolution: '按技术排查方案处理',
          category: '运动控制',
          explanation: null,
          prefix: null,
          prefixRaw: null
        }
      ]
    }
  });
  t.after(() => { gateway.executeToolCall = originalExecuteToolCall; });

  const out = await gateway.invokeFromToolCall({
    toolCall: toolCall('error_code_lookup', { errorCode: '0X010A', language: 'zh-CN' }),
    request: { traceId: 't-1', message: { text: '141010A是什么故障码' } },
    turnResult: turnResult()
  });

  assert.equal(out.debugMeta.toolResult.status, 'success');
  const d = out.debugMeta.toolResult.data;
  assert.equal(d.ambiguous, false);
  assert.equal(Array.isArray(d.items) && d.items.length, 1);
  const first = d.items[0];
  const requiredKeys = [
    'category',
    'code',
    'detail',
    'displayCode',
    'explanation',
    'method',
    'operation',
    'params',
    'prefix',
    'prefixRaw',
    'shortMessage',
    'subsystem',
    'techSolution',
    'userHint'
  ];
  for (const k of requiredKeys) {
    assert.ok(Object.prototype.hasOwnProperty.call(first, k), `expected data.items[0].${k}`);
  }
  assert.deepEqual(Object.keys(first.params).sort(), ['param1', 'param2', 'param3', 'param4']);
});

test('buildFunctionToolsFromRegistry omits tools when permission missing', () => {
  const registry = loadToolRegistry();
  const lookup = getEnabledTools(registry).find((x) => x.toolName === 'error_code_lookup');
  assert.equal(toolAllowedForPermissions(lookup, []), false);
  const pack = buildFunctionToolsFromRegistry({ userPermissions: [] });
  assert.equal(pack.tools.some((t) => t.function.name === 'error_code_lookup'), false);
});

test('gateway invokeFromToolCall denies tool call when explicit permissions miss required scope', async () => {
  const gateway = createLogtoolToolGateway();
  const out = await gateway.invokeFromToolCall({
    toolCall: toolCall('error_code_lookup', { errorCode: '0X010A', language: 'zh-CN' }),
    request: { traceId: 't-1', context: { userPermissions: [] }, message: { text: 'x' } },
    turnResult: turnResult()
  });
  assert.equal(out.debugMeta.toolResult.status, 'failed');
  assert.equal(out.debugMeta.toolResult.error.code, 'TOOL_PERMISSION_DENIED');
});

test('gateway invokeFromToolCall validates output evidence contract', async (t) => {
  const handler = getToolHandler('error_code_lookup');
  const originalExecute = handler.execute;
  handler.execute = async () => ({
    text: 'bad evidence',
    data: {
      ambiguous: false,
      items: [
        {
          subsystem: '1',
          code: '0X010A',
          displayCode: '141010A',
          shortMessage: '',
          userHint: '',
          operation: '',
          params: { param1: '', param2: '', param3: '', param4: '' },
          detail: '',
          method: '',
          techSolution: '',
          category: '',
          explanation: null,
          prefix: null,
          prefixRaw: null
        }
      ]
    },
    evidence: [{ type: 'search_hit', engine: 'elasticsearch', index: 'error_codes' }]
  });
  t.after(() => { handler.execute = originalExecute; });

  const gateway = createLogtoolToolGateway();
  const out = await gateway.invokeFromToolCall({
    toolCall: toolCall('error_code_lookup', { errorCode: '0X010A', language: 'zh-CN' }),
    request: { traceId: 't-1', context: { userPermissions: ['error_code:read'] }, message: { text: 'x' } },
    turnResult: turnResult()
  });

  assert.equal(out.debugMeta.toolResult.status, 'failed');
  assert.equal(out.debugMeta.toolResult.error.code, 'INVALID_TOOL_OUTPUT');
});
