const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  buildRarExtractArgs,
  formatRarExtractFailure,
  isExtractorMissingError,
  isUnsupportedMethodError,
  listRarExtractorCandidates,
  shouldTryNextRarExtractor,
  withTrailingSep
} = require('./rarExtractor');

test('unrar extract args keep destination trailing separator', () => {
  const extractDir = path.join('tmp', 'extract');
  const args = buildRarExtractArgs('unrar', 'logs.rar', extractDir);
  assert.deepEqual(args, ['x', '-o+', '-y', 'logs.rar', withTrailingSep(extractDir)]);
  assert.equal(args[4].endsWith(path.sep), true);
});

test('7z extract args use -o without space', () => {
  const extractDir = path.join('tmp', 'extract');
  const args = buildRarExtractArgs('7z', 'logs.rar', extractDir);
  assert.deepEqual(args, ['x', 'logs.rar', `-o${extractDir}`, '-y']);
});

test('Unsupported Method from p7zip should fall back to next extractor', () => {
  const err = new Error('Command failed: 7z x logs.rar\nERROR: Unsupported Method : 2026090313_log.medbot');
  assert.equal(isUnsupportedMethodError(err), true);
  assert.equal(shouldTryNextRarExtractor(err), true);
});

test('missing binary should fall back to next extractor', () => {
  const err = Object.assign(new Error('spawn unrar ENOENT'), { code: 'ENOENT' });
  assert.equal(isExtractorMissingError(err), true);
  assert.equal(shouldTryNextRarExtractor(err), true);
});

test('password errors are not treated as missing extractor', () => {
  const err = new Error('Corrupt file or wrong password');
  assert.equal(isExtractorMissingError(err), false);
  assert.equal(isUnsupportedMethodError(err), false);
  assert.equal(shouldTryNextRarExtractor(err), false);
});

test('candidate list prefers unrar before 7z', () => {
  const candidates = listRarExtractorCandidates();
  assert.ok(candidates.length >= 1);
  const kinds = candidates.map((item) => item.kind);
  const firstUnrar = kinds.indexOf('unrar');
  const first7z = kinds.indexOf('7z');
  if (firstUnrar >= 0 && first7z >= 0) {
    assert.ok(firstUnrar < first7z);
  }
});

test('failure message tells operator to install RARLab unrar', () => {
  const message = formatRarExtractFailure(['7z: ERROR: Unsupported Method']);
  assert.match(message, /RARLab/);
  assert.match(message, /Unsupported Method/);
});
