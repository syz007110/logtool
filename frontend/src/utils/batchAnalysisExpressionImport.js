function parseBatchAnalysisImportedExpression (rawText) {
  const obj = JSON.parse(String(rawText || ''))
  if (!obj || (!Array.isArray(obj.conditions) && !Array.isArray(obj.filters?.conditions))) {
    return null
  }
  const logic = obj.logic || obj.filters?.logic || 'AND'
  const conditions = Array.isArray(obj.conditions) ? obj.conditions : obj.filters?.conditions
  if (!Array.isArray(conditions) || conditions.length === 0) return null
  return {
    logic,
    conditions: [...conditions]
  }
}

module.exports = {
  parseBatchAnalysisImportedExpression
}
