function asArray (v) {
  return Array.isArray(v) ? v : []
}

function mapErrorCodeToolToSourceCards (toolTraces) {
  const faultCodes = []
  let idx = 0
  for (const trace of asArray(toolTraces)) {
    if (String(trace?.toolName || '') !== 'error_code_lookup') continue
    const items = asArray(trace?.data?.items)
    for (const item of items) {
      idx += 1
      const params = item.params && typeof item.params === 'object' ? item.params : {}
      faultCodes.push({
        ref: `F${idx}`,
        id: item.id != null ? item.id : undefined,
        subsystem: String(item.subsystem || '').trim(),
        code: String(item.code || '').trim(),
        short_message: String(item.shortMessage || item.short_message || '').trim(),
        explanation: item.explanation != null ? String(item.explanation) : null,
        user_hint: String(item.userHint || item.user_hint || '').trim(),
        operation: String(item.operation || '').trim(),
        param1: String(params.param1 || item.param1 || '').trim(),
        param2: String(params.param2 || item.param2 || '').trim(),
        param3: String(params.param3 || item.param3 || '').trim(),
        param4: String(params.param4 || item.param4 || '').trim(),
        detail: String(item.detail || '').trim(),
        method: String(item.method || '').trim(),
        category: String(item.category || '').trim(),
        tech_solution: String(item.techSolution || item.tech_solution || '').trim()
      })
    }
  }
  return { faultCodes }
}

function buildAssistantPayloadFromAgentResult (result) {
  const text = String(result?.text || '').trim()
  const sources = mapErrorCodeToolToSourceCards(result?.toolTraces)
  return {
    ok: true,
    answerText: text,
    sources,
    toolTraces: Array.isArray(result?.toolTraces) ? result.toolTraces : []
  }
}

module.exports = {
  mapErrorCodeToolToSourceCards,
  buildAssistantPayloadFromAgentResult
}
