const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  buildUnrarExtractArgs,
  formatRarExtractFailure,
  isExtractorMissingError,
  listUnrarBinaries,
  withTrailingSep
} = require('./rarExtractor');

test('unrar extract args keep destination trailing separator', () => {
  const extractDir = path.join('tmp', 'extract');
  const args = buildUnrarExtractArgs('logs.rar', extractDir);
  assert.deepEqual(args, ['x', '-o+', '-y', 'logs.rar', withTrailingSep(extractDir)]);
  assert.equal(args[4].endsWith(path.sep), true);
});

test('rar extractor list is unrar only', () => {
  const bins = listUnrarBinaries();
  assert.ok(bins.length >= 1);
  assert.ok(bins.some((bin) => path.basename(bin).toLowerCase().includes('unrar')));
  assert.equal(bins.some((bin) => /(^|[\\/])7z(z)?(\.exe)?$/i.test(bin)), false);
});

test('missing binary is reported as extractor missing', () => {
  const err = Object.assign(new Error('spawn unrar ENOENT'), { code: 'ENOENT' });
  assert.equal(isExtractorMissingError(err), true);
});

test('failure message tells operator to install RARLab unrar', () => {
  const message = formatRarExtractFailure(['unrar: spawn unrar ENOENT']);
  assert.match(message, /RARLab/);
  assert.match(message, /unrar/);
  assert.doesNotMatch(message, /7zz|7z/);
});
