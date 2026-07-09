const test = require('node:test');
const assert = require('node:assert/strict');

const {
  syncBatchAnalysisDslRefresh
} = require('../../frontend/src/utils/batchAnalysisStateSync');

test('syncBatchAnalysisDslRefresh clears stale actions when new dsl has no actions', () => {
  const state = syncBatchAnalysisDslRefresh({
    nextFilters: { logic: 'AND', conditions: [{ field: 'error_code', operator: 'contains', value: '050b' }] },
    nextActions: [],
    previousPendingActions: [{ type: 'stats', field: 'error_code', value: '601e' }]
  });

  assert.deepEqual(state.pendingFiltersRoot, {
    logic: 'AND',
    conditions: [{ field: 'error_code', operator: 'contains', value: '050b' }]
  });
  assert.deepEqual(state.pendingNlActions, []);
});

test('syncBatchAnalysisDslRefresh keeps new actions when dsl refresh includes actions', () => {
  const state = syncBatchAnalysisDslRefresh({
    nextFilters: { logic: 'AND', conditions: [{ field: 'error_code', operator: 'contains', value: '050b' }] },
    nextActions: [{ type: 'stats', field: 'error_code', value: '050b' }],
    previousPendingActions: [{ type: 'stats', field: 'error_code', value: '601e' }]
  });

  assert.deepEqual(state.pendingNlActions, [{ type: 'stats', field: 'error_code', value: '050b' }]);
});
