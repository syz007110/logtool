const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeErrorCodeCsvRow
} = require('../src/scripts/importStructuredErrorCodesCsv');

test('normalizeErrorCodeCsvRow converts SA csv row into db payload', () => {
  const out = normalizeErrorCodeCsvRow({
    series_id: '2',
    subsystem: '1',
    code: '0x010a',
    is_axis_error: '1',
    is_arm_error: '0',
    solution: 'recoverable',
    for_expert: '1',
    for_novice: '1',
    related_log: '',
    level: 'high',
    category: ''
  });

  assert.deepEqual(out, {
    series_id: 2,
    subsystem: '1',
    code: '0X010A',
    is_axis_error: true,
    is_arm_error: false,
    solution: 'recoverable',
    for_expert: true,
    for_novice: true,
    related_log: false,
    level: 'high',
    category: null
  });
});

test('normalizeErrorCodeCsvRow rejects invalid required fields', () => {
  assert.throws(
    () => normalizeErrorCodeCsvRow({ series_id: '', subsystem: '', code: '' }),
    /series_id|subsystem|code/i
  );
});
