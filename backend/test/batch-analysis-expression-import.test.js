const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseBatchAnalysisImportedExpression
} = require('../../frontend/src/utils/batchAnalysisExpressionImport');

test('parseBatchAnalysisImportedExpression returns pending filters only for valid imported json', () => {
  const parsed = parseBatchAnalysisImportedExpression(JSON.stringify({
    logic: 'AND',
    conditions: [
      { field: 'error_code', operator: 'contains', value: '050b' }
    ]
  }));

  assert.deepEqual(parsed, {
    logic: 'AND',
    conditions: [
      { field: 'error_code', operator: 'contains', value: '050b' }
    ]
  });
});

test('parseBatchAnalysisImportedExpression supports nested filters wrapper', () => {
  const parsed = parseBatchAnalysisImportedExpression(JSON.stringify({
    filters: {
      logic: 'OR',
      conditions: [
        { field: 'explanation', operator: 'contains', value: '3号' }
      ]
    }
  }));

  assert.deepEqual(parsed, {
    logic: 'OR',
    conditions: [
      { field: 'explanation', operator: 'contains', value: '3号' }
    ]
  });
});
