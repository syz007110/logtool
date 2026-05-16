const test = require('node:test');
const assert = require('node:assert/strict');

const { composeExplanationPreviewFromI18n } = require('../src/utils/explanationPreview');

test('composeExplanationPreviewFromI18n matches preview pipeline without DB', () => {
  const t = (k) => k;
  const out = composeExplanationPreviewFromI18n({
    rawCode: '1010A',
    subsystemFromDb: '1',
    typeCodeFromDb: '0X010A',
    template: '释义正文',
    param1: '',
    param2: '',
    param3: '',
    param4: '',
    t
  });
  assert.match(out.explanation, /释义正文/);
  assert.ok(String(out.prefixRaw || '').length >= 0);
  assert.ok(typeof out.prefix === 'string');
});

test('composeExplanationPreviewFromI18n returns nulls when no template', () => {
  const out = composeExplanationPreviewFromI18n({
    rawCode: '1010A',
    subsystemFromDb: '1',
    typeCodeFromDb: '0X010A',
    template: '',
    param1: '',
    param2: '',
    param3: '',
    param4: '',
    t: (k) => k
  });
  assert.equal(out.explanation, null);
  assert.equal(out.prefix, null);
  assert.equal(out.prefixRaw, null);
});
