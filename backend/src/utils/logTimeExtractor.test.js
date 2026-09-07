const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveWritebackLogTime } = require('./logTimeExtractor');

test('writeback time prefers first decrypted log timestamp', () => {
  const actual = resolveWritebackLogTime({
    entries: [{ timestamp: '2024-03-15 09:12:33' }],
    fallbackIso: '2026-09-06T09:00:00.000Z',
    fileName: '2026080412_log.medbot'
  });

  assert.equal(actual.getFullYear(), 2024);
  assert.equal(actual.getMonth(), 2);
  assert.equal(actual.getDate(), 15);
  assert.equal(actual.getHours(), 9);
});

test('writeback time falls back to filename when entries have no timestamp', () => {
  const actual = resolveWritebackLogTime({
    entries: [{}],
    fileName: '2026080412_log.medbot'
  });

  assert.equal(actual.getFullYear(), 2026);
  assert.equal(actual.getMonth(), 7);
  assert.equal(actual.getDate(), 4);
  assert.equal(actual.getHours(), 12);
});
