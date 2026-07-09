const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function readLocale(fileName) {
  const fullPath = path.resolve(__dirname, `../../frontend/src/i18n/locales/${fileName}`);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

test('batchAnalysis stats i18n keys exist in zh-CN locale', () => {
  const locale = readLocale('zh-CN.json');
  assert.equal(locale.batchAnalysis?.nlStatsLabel, '统计');
  assert.equal(locale.batchAnalysis?.nlStatsUnit, '条');
});
