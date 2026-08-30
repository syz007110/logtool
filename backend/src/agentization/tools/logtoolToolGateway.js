const { loadToolRegistry } = require('./registry/registryLoader');
const {
  getToolParameters,
  getToolRuntime,
  validateArgumentsAgainstParameters
} = require('./registry/toolRegistrySchema');
const { getToolHandler, getToolHandlerByExecution } = require('./handlers');
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

function normalizeChannelType(channelType) {
  return String(channelType || '').trim().toLowerCase();
}

function toolAllowsPermissionBypassForChannel(tool, request = {}) {
  const channelType = normalizeChannelType(request?.channel?.type);
  if (!channelType) return false;
  const channels = Array.isArray(tool?.security?.permissionBypassChannels)
    ? tool.security.permissionBypassChannels
    : [];
  return channels.some((item) => normalizeChannelType(item) === channelType);
}

function normalizeExecution(tool = {}) {
  const runtime = tool?.runtime && typeof tool.runtime === 'object' ? tool.runtime : {};
  const execution = tool?.execution && typeof tool.execution === 'object'
    ? tool.execution
    : (runtime.execution && typeof runtime.execution === 'object' ? runtime.execution : {});
  const rawMode = String(execution.mode || 'sync').trim().toLowerCase();
  const mode = rawMode === 'http' ? 'http' : 'sync';
  const completionMode = String(execution.completionMode || 'immediate').trim().toLowerCase() === 'deferred'
    ? 'deferred'
    : 'immediate';
  return {
    mode,
    completionMode,
    asyncTaskType: String(execution.asyncTaskType || '').trim().toLowerCase() || null,
    dispatchTimeoutMs: Number.isFinite(Number(execution.dispatchTimeoutMs))
      ? Number(execution.dispatchTimeoutMs)
      : (Number.isFinite(Number(execution.timeoutMs)) ? Number(execution.timeoutMs) : 8000),
    batchTimeoutMs: Number.isFinite(Number(execution.batchTimeoutMs))
      ? Number(execution.batchTimeoutMs)
      : null,
    deferredPrompt: execution.deferredPrompt && typeof execution.deferredPrompt === 'object'
      ? execution.deferredPrompt
      : null,
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

function ensureDeferredToolEnvelope(toolName, gatewayOutput) {
  const taskId = String(gatewayOutput?.taskId || '').trim();
  const event = gatewayOutput?.event && typeof gatewayOutput.event === 'object' && !Array.isArray(gatewayOutput.event)
    ? gatewayOutput.event
    : null;
  const phase = String(event?.phase || '').trim().toLowerCase();
  const text = String(event?.text || '').trim();
  const eventToolName = String(event?.toolName || toolName || '').trim();
  if (!taskId) throw new Error('deferred tool result requires taskId');
  if (!event) throw new Error('deferred tool result requires event');
  if (!eventToolName) throw new Error('deferred tool result requires event.toolName');
  if (!phase) throw new Error('deferred tool result requires event.phase');
  if (!text) throw new Error('deferred tool result requires event.text');
  return {
    mode: 'deferred',
    taskId,
    event: {
      kind: String(event?.kind || 'async_tool').trim() || 'async_tool',
      toolName: eventToolName,
      phase,
      text,
      data: event?.data && typeof event.data === 'object' && !Array.isArray(event.data)
        ? event.data
        : null
    }
  };
}

function createLogtoolToolGateway() {
  return {
    async executeToolCall({ toolName, args, request, orchestratorResult, execution }) {
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
            turnKind: orchestratorResult?.kind || null
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
      return handler.execute({ toolName, args, request, orchestratorResult, execution });
    },

    ensureToolResultMatrix(result) {
      const status = String(result?.status || '').trim();
      const text = String(result?.text || '').trim();
      const data = result?.data;
      const error = result?.error == null ? null : result.error;
      if (!['success', 'empty', 'failed'].includes(status)) throw new Error(`invalid ToolResult.status: ${status}`);
      if (status === 'success') {
        if (!(data && typeof data === 'object')) throw new Error('ToolResult success requires object/array data');
        if (!text) throw new Error('ToolResult success requires text');
        if (error !== null) throw new Error('ToolResult success requires error=null');
      }
      if (status === 'empty') {
        if (data !== null) throw new Error('ToolResult empty requires data=null');
        if (error !== null) throw new Error('ToolResult empty requires error=null');
        if (!text) throw new Error('ToolResult empty requires text');
      }
      if (status === 'failed') {
        if (data !== null) throw new Error('ToolResult failed requires data=null');
        if (!String(error?.code || '').trim() || !String(error?.message || '').trim()) {
          throw new Error('ToolResult failed requires error.code and error.message');
        }
      }
      return { status, text, data: data == null ? null : data, error };
    },

    toToolResult(toolName, gatewayOutput) {
      const text = String(gatewayOutput?.text || '').trim();
      const data = gatewayOutput?.data && typeof gatewayOutput.data === 'object' ? gatewayOutput.data : null;
      const payload = gatewayOutput?.debugMeta?.toolExecution || {};
      const hasPayloadData = payload && typeof payload === 'object' && Object.keys(payload).length > 0;
      if (!text && !data && !hasPayloadData) {
        return {
          status: 'empty',
          text: '工具未返回可用结果。',
          data: null,
          error: null
        };
      }
      return {
        text,
        status: data ? 'success' : 'empty',
        data,
        error: null
      };
    },

    normalizeToolResult(toolName, gatewayOutput) {
      return this.ensureToolResultMatrix(this.toToolResult(toolName, gatewayOutput));
    },

    normalizeGatewayOutcome(toolName, gatewayOutput) {
      const mode = String(gatewayOutput?.mode || 'immediate').trim().toLowerCase();
      if (mode === 'deferred') {
        return {
          delivery: 'deferred',
          deferred: ensureDeferredToolEnvelope(toolName, gatewayOutput)
        };
      }
      return {
        delivery: 'immediate',
        toolResult: this.normalizeToolResult(toolName, gatewayOutput)
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
      const parameters = getToolParameters(tool);
      const runtime = getToolRuntime(tool);
      const out = validateArgumentsAgainstParameters(parameters, args, runtime);
      return { tool, arguments: out };
    },

    enforceToolPermission(tool, request) {
      if (toolAllowsPermissionBypassForChannel(tool, request)) return;
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

    async executeWithPolicy({ toolName, args, request, orchestratorResult, tool }) {
      const execution = normalizeExecution(tool);
      let lastError = null;
      for (let attempt = 1; attempt <= execution.retryAttempts; attempt += 1) {
        try {
          const run = this.executeToolCall({ toolName, args, request, orchestratorResult, execution });
          return await withTimeout(run, execution.dispatchTimeoutMs || execution.timeoutMs, 'TOOL_EXECUTION_TIMEOUT');
        } catch (error) {
          lastError = error;
          if (attempt >= execution.retryAttempts) break;
          if (!execution.retryable) break;
          await sleep(execution.retryBackoffMs);
        }
      }
      throw lastError || new Error('tool execution failed');
    },

    async invokeFromToolCall({ toolCall, request, turnResult }) {
      const toolName = String(toolCall?.toolName || '').trim();
      const rawArgs = toolCall?.arguments && typeof toolCall.arguments === 'object'
        ? toolCall.arguments
        : {};
      let out = null;
      let toolResult = null;
      let gatewayOutcome = null;
      let validatedArgs = rawArgs;
      try {
        // 参数校验失败也收成 failed ToolResult，写入 tool message，供模型追问/改参
        const validated = this.validateToolArguments(toolName, rawArgs);
        const { tool } = validated;
        validatedArgs = validated.arguments;
        const execution = normalizeExecution(tool);
        if (execution.completionMode === 'deferred' && request?.context?.disallowDeferredTools === true) {
          const err = new Error(`tool ${toolName} is not allowed in async continuation`);
          err.code = 'TOOL_DEFERRED_NOT_ALLOWED';
          throw err;
        }
        this.enforceToolPermission(tool, request);
        out = await this.executeWithPolicy({
          toolName,
          args: validatedArgs,
          request,
          orchestratorResult: turnResult,
          tool
        });
        gatewayOutcome = this.normalizeGatewayOutcome(toolName, out);
        if (gatewayOutcome.delivery === 'deferred' && execution.completionMode !== 'deferred') {
          const err = new Error(`tool ${toolName} returned deferred result without deferred registry declaration`);
          err.code = 'TOOL_DEFERRED_NOT_DECLARED';
          throw err;
        }
        toolResult = gatewayOutcome.delivery === 'immediate' ? gatewayOutcome.toolResult : null;
      } catch (error) {
        gatewayOutcome = {
          delivery: 'immediate'
        };
        toolResult = this.ensureToolResultMatrix({
          status: 'failed',
          text: '',
          data: null,
          error: {
            code: String(error?.code || 'TOOL_EXECUTION_FAILED'),
            message: String(error?.message || error || 'tool execution failed')
          }
        });
        const isArgError = [
          'MISSING_REQUIRED_SLOT',
          'MISSING_ANYOF_SLOT',
          'INVALID_ENUM',
          'INVALID_PATTERN',
          'TOOL_NOT_FOUND'
        ].includes(String(error?.code || ''));
        out = {
          text: isArgError
            ? `工具参数不合格：${toolResult.error.message}`
            : `工具执行失败：${toolResult.error.message}`,
          debugMeta: {
            source: 'logtool',
            traceId: request?.traceId,
            executionRoute: toolName,
            toolCall: { toolName, input: validatedArgs, id: toolCall?.id || null }
          }
        };
      }
      return {
        ...out,
        delivery: gatewayOutcome?.delivery || 'immediate',
        taskId: gatewayOutcome?.deferred?.taskId || null,
        deferredEvent: gatewayOutcome?.deferred?.event || null,
        debugMeta: {
          ...(out?.debugMeta || {}),
          toolResult,
          turnResult,
          toolCallId: toolCall?.id || null
        }
      };
    }
  };
}

module.exports = {
  createLogtoolToolGateway,
  toolAllowsPermissionBypassForChannel
};
