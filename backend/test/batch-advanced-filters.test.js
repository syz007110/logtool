const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAdvancedFilterExpression,
  parseAdvancedFilterPayload
} = require('../src/workers/batchAdvancedFilters');

test('buildAdvancedFilterExpression supports error_code notcontains', () => {
  const queryParams = {};
  const expr = buildAdvancedFilterExpression({
    field: 'error_code',
    operator: 'notcontains',
    value: '601e'
  }, queryParams);

  assert.equal(expr, 'positionCaseInsensitive(error_code, {adv_ec_0:String}) = 0');
  assert.deepEqual(queryParams, {
    adv_ec_0: '601e'
  });
});

test('buildAdvancedFilterExpression keeps negated notcontains semantics explicit', () => {
  const queryParams = {};
  const expr = buildAdvancedFilterExpression({
    field: 'error_code',
    operator: 'notcontains',
    value: '405e',
    negate: true
  }, queryParams);

  assert.equal(expr, 'NOT (positionCaseInsensitive(error_code, {adv_ec_0:String}) = 0)');
  assert.deepEqual(queryParams, {
    adv_ec_0: '405e'
  });
});

test('parseAdvancedFilterPayload parses json string for controller clickhouse chain', () => {
  const parsed = parseAdvancedFilterPayload(JSON.stringify({
    logic: 'AND',
    conditions: [
      {
        field: 'error_code',
        operator: 'notcontains',
        value: '601e'
      }
    ]
  }));

  assert.deepEqual(parsed, {
    logic: 'AND',
    conditions: [
      {
        field: 'error_code',
        operator: 'notcontains',
        value: '601e'
      }
    ]
  });
});
