const test = require('node:test');
const assert = require('node:assert/strict');

const { createV1Planner, buildAvailableTools } = require('../src/agentization/planner/v1Planner');
const { createLogtoolToolGateway } = require('../src/agentization/tools/logtoolToolGateway');
const { getToolHandler } = require('../src/agentization/tools/handlers');

test('planner returns ask_user when clarification is required', () => {
  const planner = createV1Planner();
  const out = planner.buildPlan({
    request: { message: { text: '这个问题怎么处理' }, context: {} },
    intentResult: {
      intent: 'provide_missing_info',
      needClarification: true,
      clarificationQuestion: '请提供故障码。',
      nextAction: { type: 'ask_user', message: '' },
      toolDecision: { shouldCallTool: false, toolName: null, reason: '' },
      entities: { fileIds: [] },
      language: 'zh-CN'
    }
  });
  assert.equal(out.decision, 'ask_user');
  assert.match(out.clarification.question, /故障码/);
  assert.equal(out.clarification.missingSlots[0], 'errorCode');
});

test('planner computes missingSlots from tool contract', () => {
  const planner = createV1Planner();
  const out = planner.buildPlan({
    request: { message: { text: '' }, context: {} },
    intentResult: {
      intent: 'error_code_lookup',
      needClarification: true,
      clarificationQuestion: '请补充参数',
      nextAction: { type: 'ask_user', message: '' },
      toolDecision: { shouldCallTool: true, toolName: 'error_code_lookup', reason: '' },
      entities: { errorCode: null, keywords: null, fileIds: [] },
      language: 'zh-CN'
    }
  });
  assert.equal(out.decision, 'ask_user');
  assert.equal(Array.isArray(out.clarification.missingSlots), true);
  assert.equal(out.clarification.missingSlots[0], 'errorCode');
});

test('planner call_tool passes through full fault code from confirmedSlots without collapsing to type code', () => {
  const planner = createV1Planner();
  const out = planner.buildPlan({
    request: { message: { text: '随便追问一句' }, context: {} },
    planInputContext: {
      contextIntent: null,
      confirmedSlots: { errorCode: '141010A' },
      runtimeState: { userPermissions: ['error_code:read'] }
    },
    intentResult: {
      intent: 'error_code_lookup',
      needClarification: false,
      clarificationQuestion: null,
      toolDecision: { shouldCallTool: true, toolName: 'error_code_lookup', reason: '' },
      entities: { errorCode: '0X010A', fileIds: [] },
      nextAction: { type: 'call_tool', message: '' },
      language: 'zh-CN'
    }
  });
  assert.equal(out.decision, 'call_tool');
  assert.equal(out.toolCall.arguments.errorCode, '141010A');
});

test('planner call_tool keeps full code from user message when slot empty', () => {
  const planner = createV1Planner();
  const out = planner.buildPlan({
    request: { message: { text: '142020A 怎么办' }, context: {} },
    planInputContext: {
      contextIntent: null,
      confirmedSlots: {},
      runtimeState: { userPermissions: ['error_code:read'] }
    },
    intentResult: {
      intent: 'error_code_lookup',
      needClarification: false,
      clarificationQuestion: null,
      toolDecision: { shouldCallTool: true, toolName: 'error_code_lookup', reason: '' },
      entities: { errorCode: null, fileIds: [] },
      nextAction: { type: 'call_tool', message: '' },
      language: 'zh-CN'
    }
  });
  assert.equal(out.decision, 'call_tool');
  assert.equal(out.toolCall.arguments.errorCode, '142020A');
});

test('planner coerces call_tool to reply_direct when remainingCalls exhausted', () => {
  const planner = createV1Planner();
  const out = planner.buildPlan({
    request: { message: { text: '查码' }, context: {} },
    planInputContext: {
      contextIntent: {
        intent: 'error_code_lookup',
        entities: { errorCode: '0X010A', fileIds: [] },
        toolDecision: { shouldCallTool: true, toolName: 'error_code_lookup', reason: '' },
        needClarification: false,
        nextAction: { type: 'call_tool', message: '' },
        answerDraft: null,
        language: 'zh-CN'
      },
      confirmedSlots: {},
      availableTools: [{
        name: 'error_code_lookup',
        allowed: true,
        requiredSlots: [],
        anyOfRequired: []
      }],
      runtimeState: {
        userPermissions: ['error_code:read'],
        remainingCalls: 0,
        toolFallbackText: '工具侧摘要'
      },
      policy: {}
    },
    intentResult: {}
  });
  assert.equal(out.decision, 'reply_direct');
  assert.equal(out.reason, '工具侧摘要');
});

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
    intentResult: { intent: 'error_code_lookup' }
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

test('gateway invokeByPlan returns failed ToolResult on execution error', async (t) => {
  const gateway = createLogtoolToolGateway();
  const originalExecuteToolCall = gateway.executeToolCall;
  gateway.executeToolCall = async () => {
    const err = new Error('boom');
    err.code = 'TOOL_BROKEN';
    throw err;
  };
  t.after(() => { gateway.executeToolCall = originalExecuteToolCall; });

  const out = await gateway.invokeByPlan(
    {
      decision: 'call_tool',
      toolCall: {
        toolName: 'error_code_lookup',
        arguments: { errorCode: '0X010A', language: 'zh-CN' }
      }
    },
    { traceId: 't-1', message: { text: 'x' } },
    { intent: 'error_code_lookup', entities: { errorCode: '0X010A' } }
  );

  assert.equal(out.debugMeta.toolResult.status, 'failed');
  assert.equal(out.debugMeta.toolResult.data, null);
  assert.equal(out.debugMeta.toolResult.error.code, 'TOOL_BROKEN');
});

test('gateway maps error_code_lookup output to contracted data fields', async (t) => {
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

  const out = await gateway.invokeByPlan(
    {
      decision: 'call_tool',
      toolCall: {
        toolName: 'error_code_lookup',
        arguments: { errorCode: '0X010A', language: 'zh-CN' }
      }
    },
    { traceId: 't-1', message: { text: '141010A是什么故障码' } },
    { intent: 'error_code_lookup', entities: { errorCode: '0X010A' } }
  );

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

test('buildAvailableTools marks tool disallowed when permission missing', () => {
  const tools = buildAvailableTools([]);
  const lookup = tools.find((x) => x.name === 'error_code_lookup');
  assert.equal(Boolean(lookup), true);
  assert.equal(lookup.allowed, false);
});
