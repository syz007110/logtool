const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const resolverPath = path.resolve(__dirname, './attachmentUploadPreparationResolver.js');
const deviceKeyPath = path.resolve(__dirname, './deviceKeyService.js');
const logUploadPath = path.resolve(__dirname, './logUploadService.js');

function loadResolverWithMocks({ getKeyForDeviceAndDate, findDeviceIdByKeyValue, resolveDeviceBindingByDeviceId }) {
  delete require.cache[resolverPath];
  require.cache[deviceKeyPath] = {
    exports: {
      getKeyForDeviceAndDate,
      findDeviceIdByKeyValue
    }
  };
  require.cache[logUploadPath] = {
    exports: {
      resolveDeviceBindingByDeviceId
    }
  };
  return require('./attachmentUploadPreparationResolver');
}

test('resolver fills key and binding from device id when scan files exist', async () => {
  const { resolveAttachmentUploadPreparation } = loadResolverWithMocks({
    getKeyForDeviceAndDate: async () => '00-01-05-77-6a-09',
    findDeviceIdByKeyValue: async () => null,
    resolveDeviceBindingByDeviceId: async () => ({ deviceModelId: 12, seriesId: 3 })
  });

  const result = await resolveAttachmentUploadPreparation({
    files: [{
      sourceFilePath: 'D:/tmp/2026080412_log.medbot',
      originalName: '2026080412_log.medbot',
      attachmentAssetId: 'asset-1'
    }],
    explicitDeviceId: '4371-01'
  });

  assert.equal(result.uploadPreparation.canUpload, true);
  assert.equal(result.uploadPreparation.resolvedDeviceId, '4371-01');
  assert.equal(result.uploadPreparation.resolvedDecryptKey, '00-01-05-77-6a-09');
  assert.equal(result.uploadPreparation.resolvedDeviceModelId, 12);
  assert.equal(result.uploadPreparation.resolvedSeriesId, 3);
});

test('resolver can reverse device id from explicit key', async () => {
  const { resolveAttachmentUploadPreparation } = loadResolverWithMocks({
    getKeyForDeviceAndDate: async () => null,
    findDeviceIdByKeyValue: async () => '5G-07',
    resolveDeviceBindingByDeviceId: async () => ({ deviceModelId: 88, seriesId: 9 })
  });

  const result = await resolveAttachmentUploadPreparation({
    files: [{
      sourceFilePath: 'D:/tmp/2026080412_log.medbot',
      originalName: '2026080412_log.medbot',
      attachmentAssetId: 'asset-2'
    }],
    explicitDecryptKey: '00-01-05-77-6a-09'
  });

  assert.equal(result.uploadPreparation.resolvedDeviceId, '5G-07');
  assert.equal(result.uploadPreparation.resolvedDecryptKeyStatus, 'valid');
  assert.deepEqual(result.uploadPreparation.missingFields, []);
});
