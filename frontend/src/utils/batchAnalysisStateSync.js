function cloneActions (actions) {
  return Array.isArray(actions) ? actions.map((item) => ({ ...item })) : []
}

function syncBatchAnalysisDslRefresh ({ nextFilters, nextActions }) {
  return {
    pendingFiltersRoot: nextFilters || { logic: 'AND', conditions: [] },
    pendingNlActions: cloneActions(nextActions)
  }
}

module.exports = {
  syncBatchAnalysisDslRefresh
}
