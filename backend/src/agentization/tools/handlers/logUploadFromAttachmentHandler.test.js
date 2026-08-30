const test = require('node:test');
const assert = require('node:assert/strict');

const {
  pickAttachment,
  pickAttachmentsByAssetIds,
  normalizeAttachmentAssetIds,
  resolveAttachmentSourcePath,
  SUPPORTED_LOG_EXTENSIONS
} = require('../../../services/agentLogUploadHelper');

test('pickAttachment selects the sole medbot attachment by default', () => {
  const attachment = pickAttachment([{
    assetId: 'asset-1',
    originalName: '2026080210_log.medbot',
    status: 'available'
  }], {});

  assert.equal(attachment.assetId, 'asset-1');
});

test('pickAttachment rejects unsupported attachment extension', () => {
  assert.throws(() => {
    pickAttachment([{
      assetId: 'asset-2',
      originalName: 'screenshot.png',
      status: 'available'
    }], {});
  }, /当前仅支持上传/);
});

test('pickAttachment requires explicit selection when multiple attachments exist', () => {
  assert.throws(() => {
    pickAttachment([
      { assetId: 'asset-1', originalName: '2026080210_log.medbot', status: 'available' },
      { assetId: 'asset-2', originalName: '2026080211_log.medbot', status: 'available' }
    ], {});
  }, /未找到目标附件/);
});

test('pickAttachmentsByAssetIds selects multiple medbot attachments by asset ids', () => {
  const attachments = pickAttachmentsByAssetIds([
    { assetId: 'asset-1', originalName: '2026080210_log.medbot', status: 'available' },
    { assetId: 'asset-2', originalName: '2026080211_log.medbot', status: 'available' }
  ], ['asset-2', 'asset-1']);

  assert.deepEqual(attachments.map((item) => item.assetId), ['asset-1', 'asset-2']);
});

test('normalizeAttachmentAssetIds deduplicates and trims values', () => {
  assert.deepEqual(
    normalizeAttachmentAssetIds([' asset-1 ', 'asset-2', 'asset-1', '', null]),
    ['asset-1', 'asset-2']
  );
});

test('resolveAttachmentSourcePath keeps local attachment paths inside asset storage', () => {
  const resolved = resolveAttachmentSourcePath({
    storage: 'local',
    objectKey: 'tmp/sample.medbot'
  });

  assert.match(resolved, /agent-assets[\\/]tmp[\\/]sample\.medbot$/);
});

test('supported log extensions is medbot only', () => {
  assert.deepEqual(Array.from(SUPPORTED_LOG_EXTENSIONS), ['.medbot']);
});
