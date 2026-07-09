const test = require('node:test');
const assert = require('node:assert/strict');

test('normalizeBatchAnalysisErrorCodeNode keeps incomplete error_code equality operator unchanged', () => {
  const {
    normalizeBatchAnalysisErrorCodeNode
  } = requireOrImportBatchAnalysisErrorCode();
  const out = normalizeBatchAnalysisErrorCodeNode({
    field: 'error_code',
    operator: '=',
    value: ' 601E '
  });

  assert.deepEqual(out, {
    field: 'error_code',
    operator: '=',
    value: '601e'
  });
});

test('normalizeBatchAnalysisErrorCodeNode keeps incomplete error_code inequality operator unchanged', () => {
  const {
    normalizeBatchAnalysisErrorCodeNode
  } = requireOrImportBatchAnalysisErrorCode();
  const out = normalizeBatchAnalysisErrorCodeNode({
    field: 'error_code',
    operator: '!=',
    value: ' 405E '
  });

  assert.deepEqual(out, {
    field: 'error_code',
    operator: '!=',
    value: '405e'
  });
});

test('normalizeBatchAnalysisErrorCodeNode normalizes legacy aliases only', () => {
  const {
    normalizeBatchAnalysisErrorCodeNode
  } = requireOrImportBatchAnalysisErrorCode();
  const out = normalizeBatchAnalysisErrorCodeNode({
    field: 'error_code',
    operator: 'not contains',
    value: ' 050B '
  });

  assert.deepEqual(out, {
    field: 'error_code',
    operator: 'notcontains',
    value: '050b'
  });
});

function requireOrImportBatchAnalysisErrorCode() {
  return require('../../frontend/src/utils/batchAnalysisErrorCode');
}
