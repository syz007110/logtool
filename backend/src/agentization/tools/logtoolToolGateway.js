const { buildToolCall } = require('../types/contracts');
const { loadToolRegistry } = require('./registry/registryLoader');
const { getToolHandler } = require('./handlers');

function createLogtoolToolGateway() {
  const handlerByIntent = new Map([
    ['log_query', 'LogAnalysisHandler'],
    ['surgery_summary', 'SurgeryDataHandler']
  ]);

  return {
    async executeToolCall({ toolName, args, request, intentResult }) {
      const handler = getToolHandler(toolName);
      return handler.execute({ toolName, args, request, intentResult });
    },

    ensureToolResultMatrix(result) {
      const status = String(result?.status || '').trim();
      const data = result?.data;
      const evidence = Array.isArray(result?.evidence) ? result.evidence : [];
      const error = result?.error == null ? null : result.error;
      if (!['success', 'empty', 'failed'].includes(status)) throw new Error(`invalid ToolResult.status: ${status}`);
      if (status === 'success') {
        if (!(data && typeof data === 'object')) throw new Error('ToolResult success requires object/array data');
        if (evidence.length < 1) throw new Error('ToolResult success requires evidence');
        if (error !== null) throw new Error('ToolResult success requires error=null');
      }
      if (status === 'empty' && error !== null) throw new Error('ToolResult empty requires error=null');
      if (status === 'failed') {
        if (data !== null) throw new Error('ToolResult failed requires data=null');
        if (!String(error?.code || '').trim() || !String(error?.message || '').trim()) {
          throw new Error('ToolResult failed requires error.code and error.message');
        }
      }
      return { status, data: data == null ? null : data, evidence, error };
    },

    toToolResult(toolName, gatewayOutput) {
      const text = String(gatewayOutput?.text || '').trim();
      const data = gatewayOutput?.data && typeof gatewayOutput.data === 'object' ? gatewayOutput.data : null;
      const payload = gatewayOutput?.debugMeta?.intentExecution || {};
      const hasPayloadData = payload && typeof payload === 'object' && Object.keys(payload).length > 0;
      if (!text && !data && !hasPayloadData) return { status: 'empty', data: null, evidence: [], error: null };
      return {
        status: data ? 'success' : 'empty',
        data,
        evidence: [{ source: 'tool_gateway', recordId: String(toolName || 'unknown') }],
        error: null
      };
    },

    validateToolArguments(toolName, args = {}) {
      const registry = loadToolRegistry();
      const tool = registry.byName.get(String(toolName || '').trim());
      if (!tool) {
        const err = new Error(`unknown tool: ${toolName}`);
        err.code = 'TOOL_NOT_FOUND';
        throw err;
      }
      const contract = tool.inputContract || {};
      const requiredSlots = Array.isArray(contract.requiredSlots) ? contract.requiredSlots : [];
      const anyOfRequired = Array.isArray(contract.anyOfRequired) ? contract.anyOfRequired : [];
      const defaultable = contract.defaultable && typeof contract.defaultable === 'object' ? contract.defaultable : {};
      const properties = contract.properties && typeof contract.properties === 'object' ? contract.properties : {};
      const out = { ...args };
      for (const [k, v] of Object.entries(defaultable)) {
        if (out[k] == null || String(out[k]).trim() === '') out[k] = v;
      }
      for (const key of requiredSlots) {
        if (out[key] == null || String(out[key]).trim() === '') {
          const err = new Error(`missing required slot: ${key}`);
          err.code = 'MISSING_REQUIRED_SLOT';
          err.slot = key;
          throw err;
        }
      }
      for (const group of anyOfRequired) {
        if (!Array.isArray(group) || group.length === 0) continue;
        const ok = group.some((key) => !(out[key] == null || String(out[key]).trim() === ''));
        if (!ok) {
          const err = new Error(`missing anyOfRequired slots: ${group.join('|')}`);
          err.code = 'MISSING_ANYOF_SLOT';
          err.group = group;
          throw err;
        }
      }
      for (const [key, spec] of Object.entries(properties)) {
        const value = out[key];
        if (value == null || String(value).trim() === '') continue;
        if (Array.isArray(spec?.enum) && spec.enum.length > 0 && !spec.enum.includes(value)) {
          const err = new Error(`invalid enum for ${key}`);
          err.code = 'INVALID_ENUM';
          err.slot = key;
          throw err;
        }
        if (spec?.pattern) {
          const reg = new RegExp(spec.pattern);
          if (!reg.test(String(value))) {
            const err = new Error(`invalid pattern for ${key}`);
            err.code = 'INVALID_PATTERN';
            err.slot = key;
            throw err;
          }
        }
      }
      return { tool, arguments: out };
    },

    async invokeByPlan(planOutput, request, intentResult) {
      const decision = String(planOutput?.decision || '').trim();
      if (decision !== 'call_tool') {
        const text = decision === 'ask_user'
          ? String(planOutput?.clarification?.question || planOutput?.reason || '请补充必要信息后我再继续。')
          : (decision === 'reject'
            ? String(planOutput?.reason || '当前请求不满足执行条件。')
            : String(planOutput?.reason || '我已理解你的问题。'));
        return { text, debugMeta: { plannerDecision: decision, planOutput } };
      }

      const toolName = String(planOutput?.toolCall?.toolName || '').trim();
      const { arguments: args } = this.validateToolArguments(toolName, planOutput?.toolCall?.arguments || {});
      let out = null;
      let toolResult = null;
      try {
        out = await this.executeToolCall({ toolName, args, request, intentResult });
        toolResult = this.ensureToolResultMatrix(this.toToolResult(toolName, out));
      } catch (error) {
        toolResult = this.ensureToolResultMatrix({
          status: 'failed',
          data: null,
          evidence: [],
          error: {
            code: String(error?.code || 'TOOL_EXECUTION_FAILED'),
            message: String(error?.message || error || 'tool execution failed')
          }
        });
        out = {
          text: `工具执行失败：${toolResult.error.message}`,
          debugMeta: {
            source: 'logtool',
            intent: intentResult?.intent,
            traceId: request?.traceId,
            executionRoute: toolName,
            toolCall: { toolName, input: args }
          }
        };
      }
      return { ...out, debugMeta: { ...(out?.debugMeta || {}), toolResult, planOutput } };
    },

    async invoke(intent, request, intentResult) {
      const query = String(request?.message?.text || '').trim();
      const normalizedIntent = String(intent || '').trim();
      const common = {
        source: 'logtool',
        intent: intentResult.intent,
        traceId: request.traceId,
        handlerName: handlerByIntent.get(normalizedIntent) || 'FaultCaseCollectHandler'
      };

      if (normalizedIntent === 'log_query') {
        const toolCall = buildToolCall({ toolName: 'log_query', input: { query } });
        return {
          text: query ? `已接收 log_query 请求：${query}` : '已接收 log_query 请求',
          debugMeta: { ...common, executionRoute: 'log_query', toolCall }
        };
      }

      if (normalizedIntent === 'surgery_summary') {
        const toolCall = buildToolCall({ toolName: 'surgery_summary', input: { query } });
        return {
          text: query ? `已接收 surgery_summary 请求：${query}` : '已接收 surgery_summary 请求',
          debugMeta: { ...common, executionRoute: 'surgery_summary', toolCall }
        };
      }

      const toolCall = buildToolCall({ toolName: 'case_record', input: { query, confirmationRequired: true } });
      return {
        text: query ? `已生成 case_record 草稿，待人工确认：${query}` : '已生成 case_record 草稿，待人工确认',
        actions: [{ type: 'human_review', label: '人工确认后入库' }],
        debugMeta: { ...common, executionRoute: 'case_record', toolCall }
      };
    }
  };
}

module.exports = {
  createLogtoolToolGateway
};
