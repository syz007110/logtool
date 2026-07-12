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

test('composeExplanationPreviewFromI18n uses prefixSourceRaw for full-code arm/joint when displayCode is compact', () => {
  const t = (k) => k;
  const out = composeExplanationPreviewFromI18n({
    rawCode: '1:010A',
    prefixSourceRaw: '141010A',
    subsystemFromDb: '1',
    typeCodeFromDb: '0X010A',
    template: '模板',
    param1: '',
    param2: '',
    param3: '',
    param4: '',
    t
  });
  assert.match(out.explanation, /模板/);
  assert.ok(out.prefixRaw && out.prefixRaw.includes('toolArm2'));
  assert.ok(out.prefixRaw.includes('joint:1'));
});

test('composeExplanationPreviewFromI18n returns prefix without template when code resolves', () => {
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
  assert.ok(out.prefixRaw && String(out.prefixRaw).length > 0);
  assert.ok(typeof out.prefix === 'string' && out.prefix.length > 0);
});

test('composeExplanationPreviewFromI18n uses seriesCode with shared prefix profile', () => {
  const t = (k) => k;
  const out = composeExplanationPreviewFromI18n({
    rawCode: '141010A',
    seriesCode: 'SA',
    subsystemFromDb: '1',
    typeCodeFromDb: '0X010A',
    template: '模板',
    param1: '',
    param2: '',
    param3: '',
    param4: '',
    t
  });
  assert.ok(out.prefixRaw && out.prefixRaw.includes('toolArm2'));
});
