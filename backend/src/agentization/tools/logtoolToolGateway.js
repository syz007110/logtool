const { buildToolCall } = require('../types/contracts');
const { loadToolRegistry } = require('./registry/registryLoader');
const { getToolHandler, getToolHandlerByExecution } = require('./handlers');
const { buildToolArgumentsFromSlotEnvelope } = require('../planner/toolCallSlotEnvelope');
const http = require('http');
const https = require('https');
const { URL } = require('url');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function withTimeout(promise, timeoutMs, code = 'TOOL_EXECUTION_TIMEOUT') {
  const ms = Number(timeoutMs);
  if (!Number.isFinite(ms) || ms <= 0) return promise;
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`tool execution timeout after ${ms}ms`);
      err.code = code;
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function extractUserPermissions(request = {}) {
  const c = request?.context && typeof request.context === 'object' ? request.context : {};
  const candidates = [
    c.userPermissions,
    c.permissions,
    c.auth?.permissions,
    c.user?.permissions
  ];
  for (const list of candidates) {
    if (Array.isArray(list)) {
      return list.map((x) => String(x || '').trim()).filter(Boolean);
    }
  }
  return null;
}

function normalizeExecution(tool = {}) {
  const execution = tool?.execution && typeof tool.execution === 'object' ? tool.execution : {};
  const rawMode = String(execution.mode || 'sync').trim().toLowerCase();
  const mode = rawMode === 'http' ? 'http' : 'sync';
  return {
    mode,
    handler: String(execution.handler || '').trim(),
    timeoutMs: Number.isFinite(Number(execution.timeoutMs)) ? Number(execution.timeoutMs) : 8000,
    retryable: Boolean(execution.retryable),
    retryAttempts: Number.isFinite(Number(execution.retryAttempts))
      ? Math.max(1, Number(execution.retryAttempts))
      : (Boolean(execution.retryable) ? 2 : 1),
    retryBackoffMs: Number.isFinite(Number(execution.retryBackoffMs))
      ? Math.max(0, Number(execution.retryBackoffMs))
      : 0,
    endpoint: String(execution.endpoint || execution.url || execution.http?.url || '').trim(),
    method: String(execution.method || execution.http?.method || 'POST').trim().toUpperCase(),
    headers: execution.headers && typeof execution.headers === 'object'
      ? execution.headers
      : (execution.http?.headers && typeof execution.http.headers === 'object' ? execution.http.headers : {})
  };
}

function validateEvidenceAgainstContract(evidence, outputContract) {
  if (!outputContract || typeof outputContract !== 'object') return;
  const evidenceSchema = outputContract?.properties?.evidence;
  if (!evidenceSchema || typeof evidenceSchema !== 'object') return;
  if (!Array.isArray(evidence)) {
    const err = new Error('ToolResult evidence must be an array');
    err.code = 'INVALID_TOOL_OUTPUT';
    throw err;
  }

  for (const item of evidence) {
    if (!item || typeof item !== 'object') {
      const err = new Error('ToolResult evidence item must be object');
      err.code = 'INVALID_TOOL_OUTPUT';
      throw err;
    }
    const type = String(item.type || '').trim();
    if (!type) continue;
    if (type === 'sql_row') {
      const hasPk = item.pk && typeof item.pk === 'object';
      const hasPks = Array.isArray(item.pks) && item.pks.length > 0;
      if (String(item.engine || '').trim() !== 'mysql'
        || !String(item.table || '').trim()
        || (!hasPk && !hasPks)) {
        const err = new Error('invalid sql_row evidence');
        err.code = 'INVALID_TOOL_OUTPUT';
        throw err;
      }
    } else if (type === 'search_hit') {
      if (String(item.engine || '').trim() !== 'elasticsearch'
        || (!String(item.index || '').trim() && !String(item.alias || '').trim())
        || !String(item.documentId || '').trim()) {
        const err = new Error('invalid search_hit evidence');
        err.code = 'INVALID_TOOL_OUTPUT';
        throw err;
      }
    }
  }
}

function doJsonRequest({ endpoint, method, headers, body, timeoutMs }) {
  return new Promise((resolve, reject) => {
    let urlObj = null;
    try {
      urlObj = new URL(endpoint);
    } catch (_) {
      const err = new Error(`invalid tool endpoint: ${endpoint}`);
      err.code = 'TOOL_HTTP_ENDPOINT_INVALID';
      reject(err);
      return;
    }
    const lib = urlObj.protocol === 'https:' ? https : http;
    const payload = JSON.stringify(body || {});
    const req = lib.request({
      protocol: urlObj.protocol,
      hostname: urlObj.hostname,
      port: urlObj.port || undefined,
      path: `${urlObj.pathname || '/'}${urlObj.search || ''}`,
      method: String(method || 'POST').toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...(headers || {})
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(Buffer.from(d)));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const code = Number(res.statusCode || 0);
        if (code >= 400) {
          const err = new Error(`tool http failed: ${code}`);
          err.code = 'TOOL_HTTP_FAILED';
          err.statusCode = code;
          err.responseText = text;
          reject(err);
          return;
        }
        try {
          const json = text ? JSON.parse(text) : {};
          resolve(json);
        } catch (error) {
          const err = new Error('tool http response is not valid json');
          err.code = 'TOOL_HTTP_BAD_RESPONSE';
          err.cause = error;
          reject(err);
        }
      });
    });
    req.on('error', (error) => {
      const err = new Error(error?.message || 'tool http request failed');
      err.code = 'TOOL_HTTP_ERROR';
      reject(err);
    });
    req.setTimeout(timeoutMs || 8000, () => {
      req.destroy();
      const err = new Error(`tool http timeout after ${timeoutMs}ms`);
      err.code = 'TOOL_EXECUTION_TIMEOUT';
      reject(err);
    });
    req.write(payload);
    req.end();
  });
}

function createLogtoolToolGateway() {
  const handlerByIntent = new Map([
    ['log_query', 'LogAnalysisHandler'],
    ['surgery_summary', 'SurgeryDataHandler']
  ]);

  return {
    async executeToolCall({ toolName, args, request, intentResult, execution }) {
      if (execution?.mode === 'http') {
        if (!execution.endpoint) {
          const err = new Error(`tool http endpoint missing: ${toolName}`);
          err.code = 'TOOL_HTTP_ENDPOINT_MISSING';
          throw err;
        }
        const remote = await doJsonRequest({
          endpoint: execution.endpoint,
          method: execution.method,
          headers: execution.headers,
          timeoutMs: execution.timeoutMs,
          body: {
            toolName,
            args,
            traceId: request?.traceId,
            requestId: request?.requestId,
            intent: intentResult?.intent
          }
        });
        if (remote && typeof remote === 'object' && (remote.text !== undefined || remote.data !== undefined)) {
          return remote;
        }
        return {
          text: '',
          data: remote && typeof remote === 'object' ? remote : null,
          debugMeta: { source: 'http_tool_adapter', toolName }
        };
      }
      const handler = execution?.handler
        ? getToolHandlerByExecution(execution.handler)
        : getToolHandler(toolName);
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
      const evidence = Array.isArray(gatewayOutput?.evidence)
        ? gatewayOutput.evidence
        : (Array.isArray(gatewayOutput?.debugMeta?.evidence) ? gatewayOutput.debugMeta.evidence : []);
      const payload = gatewayOutput?.debugMeta?.intentExecution || {};
      const hasPayloadData = payload && typeof payload === 'object' && Object.keys(payload).length > 0;
      if (!text && !data && !hasPayloadData) return { status: 'empty', data: null, evidence: [], error: null };
      return {
        status: data ? 'success' : 'empty',
        data,
        evidence: evidence.length > 0 ? evidence : [{ type: 'sql_row', engine: 'mysql', table: 'unknown', pk: { column: 'id', value: String(toolName || 'unknown') } }],
        error: null
      };
    },

    validateToolResultContract(toolName, result, tool) {
      const contract = tool?.outputContract && typeof tool.outputContract === 'object' ? tool.outputContract : {};
      const required = Array.isArray(contract.required) ? contract.required : [];
      for (const key of required) {
        if (!(key in (result || {}))) {
          const err = new Error(`ToolResult missing required field: ${key}`);
          err.code = 'INVALID_TOOL_OUTPUT';
          err.toolName = toolName;
          throw err;
        }
      }
      validateEvidenceAgainstContract(result?.evidence, contract);
      return result;
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

    enforceToolPermission(tool, request) {
      const requiredPermission = String(tool?.security?.requiredPermissions?.[0] || '').trim();
      if (!requiredPermission) return;
      const rawPermissions = extractUserPermissions(request);
      if (!Array.isArray(rawPermissions)) return;
      const perms = new Set(rawPermissions);
      if (!perms.has(requiredPermission)) {
        const err = new Error(`permission denied for tool: ${requiredPermission}`);
        err.code = 'TOOL_PERMISSION_DENIED';
        err.requiredPermission = requiredPermission;
        throw err;
      }
    },

    async executeWithPolicy({ toolName, args, request, intentResult, tool }) {
      const execution = normalizeExecution(tool);
      let lastError = null;
      for (let attempt = 1; attempt <= execution.retryAttempts; attempt += 1) {
        try {
          const run = this.executeToolCall({ toolName, args, request, intentResult, execution });
          return await withTimeout(run, execution.timeoutMs);
        } catch (error) {
          lastError = error;
          if (attempt >= execution.retryAttempts) break;
          if (!execution.retryable) break;
          await sleep(execution.retryBackoffMs);
        }
      }
      throw lastError || new Error('tool execution failed');
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

      const toolCall = planOutput?.toolCall || {};
      const toolName = String(toolCall.toolName || '').trim();
      const rawArgs = buildToolArgumentsFromSlotEnvelope({
        toolName,
        toolSlots: toolCall.toolSlots,
        entities: toolCall.entities,
        confirmedSlots: toolCall.confirmedSlots,
        userMessageText: toolCall.userMessageText !== undefined && toolCall.userMessageText !== null
          ? toolCall.userMessageText
          : request?.message?.text,
        language: toolCall.language
      });
      const { tool, arguments: args } = this.validateToolArguments(toolName, rawArgs);
      let out = null;
      let toolResult = null;
      try {
        this.enforceToolPermission(tool, request);
        out = await this.executeWithPolicy({ toolName, args, request, intentResult, tool });
        toolResult = this.validateToolResultContract(
          toolName,
          this.ensureToolResultMatrix(this.toToolResult(toolName, out)),
          tool
        );
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
