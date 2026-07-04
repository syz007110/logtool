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

function validateToolResultEvidence(evidence) {
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
      return handler.execute({ toolName, args, request, orchestratorResult });
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
      const payload = gatewayOutput?.debugMeta?.toolExecution || {};
      const hasPayloadData = payload && typeof payload === 'object' && Object.keys(payload).length > 0;
      if (!text && !data && !hasPayloadData) return { status: 'empty', data: null, evidence: [], error: null };
      return {
        status: data ? 'success' : 'empty',
        data,
        evidence: evidence.length > 0 ? evidence : [{ type: 'sql_row', engine: 'mysql', table: 'unknown', pk: { column: 'id', value: String(toolName || 'unknown') } }],
        error: null
      };
    },

    normalizeToolResult(toolName, gatewayOutput) {
      const result = this.ensureToolResultMatrix(this.toToolResult(toolName, gatewayOutput));
      if (result.status === 'success') {
        validateToolResultEvidence(result.evidence);
      }
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

    async invokeFromToolCall({ toolCall, request, turnResult }) {
      const toolName = String(toolCall?.toolName || '').trim();
      const rawArgs = toolCall?.arguments && typeof toolCall.arguments === 'object'
        ? toolCall.arguments
        : {};
      const { tool, arguments: args } = this.validateToolArguments(toolName, rawArgs);
      let out = null;
      let toolResult = null;
      try {
        this.enforceToolPermission(tool, request);
        out = await this.executeWithPolicy({
          toolName,
          args,
          request,
          orchestratorResult: turnResult,
          tool
        });
        toolResult = this.normalizeToolResult(toolName, out);
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
            traceId: request?.traceId,
            executionRoute: toolName,
            toolCall: { toolName, input: args, id: toolCall?.id || null }
          }
        };
      }
      return {
        ...out,
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
