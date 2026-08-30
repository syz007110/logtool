const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeRelativePath,
  isHiddenSystemPath,
  resolveRelativePathDepth,
  validateRelativePath
} = require('./agentAttachmentPolicy');

test('normalizeRelativePath normalizes path separators', () => {
  assert.equal(normalizeRelativePath('logs\\4339-01\\2026080412_log.medbot'), 'logs/4339-01/2026080412_log.medbot');
});

test('isHiddenSystemPath detects hidden and system files', () => {
  assert.equal(isHiddenSystemPath('logs/.DS_Store'), true);
  assert.equal(isHiddenSystemPath('logs/Thumbs.db'), true);
  assert.equal(isHiddenSystemPath('logs/systemInfo.txt'), false);
});

test('resolveRelativePathDepth counts folder depth only', () => {
  assert.equal(resolveRelativePathDepth('root/a/b/file.medbot'), 3);
  assert.equal(resolveRelativePathDepth('file.medbot'), 0);
});

test('validateRelativePath rejects over-depth paths', () => {
  assert.throws(
    () => validateRelativePath('root/a/b/c/file.medbot'),
    /文件夹展开层级不能超过|Expanded folder depth must not exceed/
  );
});
