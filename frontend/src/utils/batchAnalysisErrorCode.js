function isCompleteErrorCode (value) {
  const normalized = value != null ? String(value).trim().toUpperCase() : ''
  return normalized.length === 7 && /^[1-9A][0-9A-F]{6}$/.test(normalized)
}

function normalizeErrorCodeOperatorAlias (operator) {
  const raw = String(operator ?? '').trim()
  const lower = raw.toLowerCase()
  if (lower === 'startwith' || lower === 'startswith') return 'startsWith'
  if (lower === 'endwith' || lower === 'endswith') return 'endsWith'
  if (lower === 'not contains' || lower === 'not_contains') return 'notcontains'
  if (lower === 'regex') return 'regex'
  if (lower === 'contains') return 'contains'
  if (lower === 'notcontains') return 'notcontains'
  if (lower === '!=' || lower === '<>' || lower === '=') return lower
  return raw
}

function normalizeBatchAnalysisErrorCodeValue (value) {
  if (typeof value === 'string') return value.trim().toLowerCase()
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : item))
  }
  return value
}

function normalizeBatchAnalysisErrorCodeNode (node) {
  if (!node || typeof node !== 'object') return node
  if (node.field !== 'error_code' || node.operator === undefined) return node
  return {
    ...node,
    operator: normalizeErrorCodeOperatorAlias(node.operator),
    value: normalizeBatchAnalysisErrorCodeValue(node.value)
  }
}

function normalizeBatchAnalysisErrorCodeTree (root) {
  if (!root || typeof root !== 'object') return
  if (root.field === 'error_code' && root.operator !== undefined) {
    const normalized = normalizeBatchAnalysisErrorCodeNode(root)
    Object.assign(root, normalized)
    return
  }
  if (Array.isArray(root.conditions)) {
    root.conditions.forEach(normalizeBatchAnalysisErrorCodeTree)
  }
}

module.exports = {
  isCompleteErrorCode,
  normalizeErrorCodeOperatorAlias,
  normalizeBatchAnalysisErrorCodeValue,
  normalizeBatchAnalysisErrorCodeNode,
  normalizeBatchAnalysisErrorCodeTree
}
