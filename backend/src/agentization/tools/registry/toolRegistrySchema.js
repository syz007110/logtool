function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function isBlankValue(value) {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  return String(value).trim() === '';
}

function validateEnumValue(spec, value, key) {
  if (!Array.isArray(spec?.enum) || spec.enum.length === 0) return;
  if (!spec.enum.includes(value)) {
    const err = new Error(`invalid enum for ${key}`);
    err.code = 'INVALID_ENUM';
    err.slot = key;
    throw err;
  }
}

function validatePatternValue(pattern, value, key) {
  if (!pattern) return;
  const reg = new RegExp(pattern);
  if (!reg.test(String(value))) {
    const err = new Error(`invalid pattern for ${key}`);
    err.code = 'INVALID_PATTERN';
    err.slot = key;
    throw err;
  }
}

function validateStringLength(spec, value, key) {
  const text = String(value == null ? '' : value);
  const minLength = Number(spec?.minLength);
  const maxLength = Number(spec?.maxLength);
  if (Number.isFinite(minLength) && text.length < minLength) {
    const err = new Error(`invalid minLength for ${key}`);
    err.code = 'INVALID_MIN_LENGTH';
    err.slot = key;
    throw err;
  }
  if (Number.isFinite(maxLength) && text.length > maxLength) {
    const err = new Error(`invalid maxLength for ${key}`);
    err.code = 'INVALID_MAX_LENGTH';
    err.slot = key;
    throw err;
  }
}

function validateValueAgainstSpec(spec, value, key) {
  const anyOf = asArray(spec?.anyOf);
  if (anyOf.length > 0) {
    const errors = [];
    for (const branch of anyOf) {
      try {
        validateValueAgainstSpec(branch, value, key);
        return;
      } catch (error) {
        errors.push(error);
      }
    }
    const err = new Error(`invalid anyOf for ${key}`);
    err.code = errors[0]?.code || 'INVALID_ANYOF';
    err.slot = key;
    throw err;
  }
  const type = String(spec?.type || '').trim().toLowerCase();
  if (type === 'array') {
    if (!Array.isArray(value)) {
      const err = new Error(`invalid type for ${key}, expected array`);
      err.code = 'INVALID_TYPE';
      err.slot = key;
      throw err;
    }
    const minItems = Number(spec?.minItems);
    const maxItems = Number(spec?.maxItems);
    if (Number.isFinite(minItems) && value.length < minItems) {
      const err = new Error(`invalid minItems for ${key}`);
      err.code = 'INVALID_MIN_ITEMS';
      err.slot = key;
      throw err;
    }
    if (Number.isFinite(maxItems) && value.length > maxItems) {
      const err = new Error(`invalid maxItems for ${key}`);
      err.code = 'INVALID_MAX_ITEMS';
      err.slot = key;
      throw err;
    }
    const itemSpec = asObject(spec?.items);
    for (const item of value) {
      if (isBlankValue(item)) {
        const err = new Error(`invalid empty item for ${key}`);
        err.code = 'INVALID_ARRAY_ITEM';
        err.slot = key;
        throw err;
      }
      validateEnumValue(itemSpec, item, key);
      validatePatternValue(itemSpec?.pattern, item, key);
    }
    return;
  }
  if (type === 'string') {
    validateStringLength(spec, value, key);
  }
  validateEnumValue(spec, value, key);
  validatePatternValue(spec?.pattern, value, key);
}

/** parameters.anyOf with single-key branches → legacy planner group [[a,b,c]] */
function legacyAnyOfGroupsFromParameters(parameters = {}) {
  const anyOf = asArray(parameters.anyOf);
  if (anyOf.length === 0) return [];
  const branches = anyOf
    .map((entry) => asArray(entry?.required).map((x) => String(x || '').trim()).filter(Boolean))
    .filter((group) => group.length > 0);
  const allSingle = branches.length > 0 && branches.every((g) => g.length === 1);
  if (allSingle && branches.length > 1) {
    return [branches.map((g) => g[0])];
  }
  return branches;
}

function deriveOptionalParameterKeys(parameters = {}) {
  const props = asObject(parameters.properties);
  const keys = Object.keys(props);
  const required = new Set(asArray(parameters.required).map((x) => String(x || '').trim()).filter(Boolean));
  for (const group of legacyAnyOfGroupsFromParameters(parameters)) {
    for (const key of group) required.add(key);
  }
  return keys.filter((key) => !required.has(key));
}

function buildLegacyInputContractView(tool = {}) {
  const parameters = asObject(tool.parameters);
  const runtime = asObject(tool.runtime);
  const requiredSlots = asArray(parameters.required).map((x) => String(x || '').trim()).filter(Boolean);
  const anyOfRequired = legacyAnyOfGroupsFromParameters(parameters);
  const optionalSlots = deriveOptionalParameterKeys(parameters);
  return {
    type: 'object',
    properties: asObject(parameters.properties),
    required: requiredSlots,
    requiredSlots,
    optionalSlots,
    anyOfRequired,
    anyOf: asArray(parameters.anyOf),
    defaultable: asObject(runtime.defaults),
    contextFillable: asArray(runtime.contextFillable)
  };
}

function buildParametersFromLegacyInputContract(inputContract = {}) {
  const properties = asObject(inputContract.properties);
  const schema = {
    type: 'object',
    properties,
    additionalProperties: inputContract.additionalProperties === false ? false : false
  };
  const required = asArray(inputContract.requiredSlots).length
    ? asArray(inputContract.requiredSlots)
    : asArray(inputContract.required);
  if (required.length > 0) {
    schema.required = required.filter((key) => properties[key]);
  }
  const anyOfRequired = asArray(inputContract.anyOfRequired);
  if (anyOfRequired.length > 0) {
    const anyOf = [];
    for (const group of anyOfRequired) {
      if (!Array.isArray(group) || group.length === 0) continue;
      for (const key of group) {
        if (properties[key]) anyOf.push({ required: [String(key)] });
      }
    }
    if (anyOf.length > 0) schema.anyOf = anyOf;
  }
  return schema;
}

function getToolParameters(tool = {}) {
  const direct = asObject(tool.parameters);
  if (Object.keys(direct).length > 0) return direct;
  if (tool.inputContract) return buildParametersFromLegacyInputContract(tool.inputContract);
  return { type: 'object', properties: {} };
}

/**
 * Server-side runtime config (not sent to LLM tools[]).
 * runtime.contextFillable: RESERVED — parameter keys to inject from session/request
 * context at execute time. Not implemented yet; define per tool after real traffic
 * shows which fields should come from contextEnvelope vs tool_calls.arguments.
 */
function getToolRuntime(tool = {}) {
  const runtime = asObject(tool.runtime);
  return {
    defaults: asObject(runtime.defaults),
    contextFillable: asArray(runtime.contextFillable),
    execution: asObject(runtime.execution || tool.execution)
  };
}

/**
 * runtime.execution registry contract
 *
 * Common fields:
 * - mode: 'sync' | 'http'
 * - handler: local handler id when mode=sync
 * - endpoint/method/headers: remote invocation config when mode=http
 * - retryable/retryAttempts/retryBackoffMs: retry policy
 *
 * Deferred-tool fields:
 * - completionMode: 'immediate' | 'deferred'
 * - asyncTaskType: required when completionMode=deferred
 * - dispatchTimeoutMs: required when completionMode=deferred; timeout for task creation/dispatch
 * - batchTimeoutMs: required when completionMode=deferred; timeout for whole async batch finalization
 * - deferredPrompt.text: optional; user-visible deferred status text template
 */
function validateRuntimeExecutionSpec(execution = {}, toolName = '') {
  const mode = String(execution.mode || 'sync').trim().toLowerCase();
  if (mode && mode !== 'sync' && mode !== 'http') {
    const err = new Error(`invalid runtime.execution.mode for ${toolName || 'tool'}`);
    err.code = 'INVALID_TOOL_RUNTIME_EXECUTION_MODE';
    throw err;
  }

  const completionMode = String(execution.completionMode || 'immediate').trim().toLowerCase();
  if (completionMode !== 'immediate' && completionMode !== 'deferred') {
    const err = new Error(`invalid runtime.execution.completionMode for ${toolName || 'tool'}`);
    err.code = 'INVALID_TOOL_RUNTIME_COMPLETION_MODE';
    throw err;
  }

  if (completionMode === 'deferred') {
    const asyncTaskType = String(execution.asyncTaskType || '').trim().toLowerCase();
    const dispatchTimeoutMs = Number(execution.dispatchTimeoutMs);
    const batchTimeoutMs = Number(execution.batchTimeoutMs);
    const deferredPrompt = asObject(execution.deferredPrompt);
    if (!asyncTaskType) {
      const err = new Error(`deferred tool requires runtime.execution.asyncTaskType: ${toolName || 'tool'}`);
      err.code = 'INVALID_TOOL_RUNTIME_ASYNC_TASK_TYPE';
      throw err;
    }
    if (!Number.isFinite(dispatchTimeoutMs) || dispatchTimeoutMs <= 0) {
      const err = new Error(`deferred tool requires positive runtime.execution.dispatchTimeoutMs: ${toolName || 'tool'}`);
      err.code = 'INVALID_TOOL_RUNTIME_DISPATCH_TIMEOUT';
      throw err;
    }
    if (!Number.isFinite(batchTimeoutMs) || batchTimeoutMs <= 0) {
      const err = new Error(`deferred tool requires positive runtime.execution.batchTimeoutMs: ${toolName || 'tool'}`);
      err.code = 'INVALID_TOOL_RUNTIME_BATCH_TIMEOUT';
      throw err;
    }
    if (Object.keys(deferredPrompt).length > 0 && !String(deferredPrompt.text || '').trim()) {
      const err = new Error(`deferred tool runtime.execution.deferredPrompt.text must be non-empty when provided: ${toolName || 'tool'}`);
      err.code = 'INVALID_TOOL_RUNTIME_DEFERRED_PROMPT';
      throw err;
    }
  }

  return execution;
}

function validateArgumentsAgainstParameters(parameters, args = {}, runtime = {}) {
  const schema = asObject(parameters);
  const properties = asObject(schema.properties);
  const required = asArray(schema.required).map((x) => String(x || '').trim()).filter(Boolean);
  const defaults = asObject(runtime.defaults);
  const out = { ...args };

  for (const [key, value] of Object.entries(defaults)) {
    if (out[key] == null || String(out[key]).trim() === '') out[key] = value;
  }

  for (const key of required) {
    if (isBlankValue(out[key])) {
      const err = new Error(`missing required slot: ${key}`);
      err.code = 'MISSING_REQUIRED_SLOT';
      err.slot = key;
      throw err;
    }
  }

  // JSON Schema anyOf: at least one branch must be fully satisfied (all required keys present).
  const anyOfBranches = asArray(schema.anyOf)
    .map((entry) => asArray(entry?.required).map((x) => String(x || '').trim()).filter(Boolean))
    .filter((group) => group.length > 0);
  if (anyOfBranches.length > 0) {
    const matched = anyOfBranches.some((group) => group.every((key) => !isBlankValue(out[key])));
    if (!matched) {
      const err = new Error(
        `missing anyOfRequired slots: ${anyOfBranches.map((g) => g.join('+')).join('|')}`
      );
      err.code = 'MISSING_ANYOF_SLOT';
      err.group = anyOfBranches;
      throw err;
    }
  }

  for (const [key, spec] of Object.entries(properties)) {
    const value = out[key];
    if (isBlankValue(value)) continue;
    validateValueAgainstSpec(spec, value, key);
  }

  return out;
}

module.exports = {
  asArray,
  asObject,
  legacyAnyOfGroupsFromParameters,
  deriveOptionalParameterKeys,
  buildLegacyInputContractView,
  buildParametersFromLegacyInputContract,
  getToolParameters,
  getToolRuntime,
  validateRuntimeExecutionSpec,
  validateArgumentsAgainstParameters
};
