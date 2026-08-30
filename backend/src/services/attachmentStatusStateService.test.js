const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const servicePath = path.resolve(__dirname, './attachmentStatusStateService.js');
const resolverPath = path.resolve(__dirname, './attachmentUploadPreparationResolver.js');

function loadServiceWithResolverMock(resolveAttachmentUploadPreparation) {
  delete require.cache[servicePath];
  require.cache[resolverPath] = {
    exports: { resolveAttachmentUploadPreparation }
  };
  return require('./attachmentStatusStateService');
}

test('resolveActiveAttachmentStatusFromHistoryMessages clears active status after successful log upload', async () => {
  const {
    resolveActiveAttachmentStatusFromHistoryMessages
  } = loadServiceWithResolverMock(async (input) => input);

  const status = resolveActiveAttachmentStatusFromHistoryMessages([
    {
      role: 'assistant',
      content: 'scan summary',
      tool_calls: [{
        id: 'pre_attachment_scan_1',
        type: 'function',
        function: { name: 'attachment_scan', arguments: '{}' }
      }]
    },
    {
      role: 'tool',
      tool_call_id: 'pre_attachment_scan_1',
      content: JSON.stringify({
        status: 'success',
        text: 'scan summary',
        data: {
          nextAction: 'ask_for_key',
          uploadPreparation: {
            canUpload: false,
            resolvedDeviceId: null,
            resolvedDecryptKeyStatus: 'missing',
            resolvedDecryptKey: null,
            resolvedDeviceModelId: null,
            resolvedSeriesId: null,
            missingFields: ['decryptKey'],
            files: [{
              sourceFilePath: 'D:/tmp/2026081713_log.medbot',
              originalName: '2026081713_log.medbot',
              attachmentAssetId: 'asset-1'
            }]
          }
        },
        error: null
      })
    },
    {
      role: 'assistant',
      content: '',
      tool_calls: [{
        id: 'start_log_upload_1',
        type: 'function',
        function: { name: 'start_log_upload', arguments: '{}' }
      }]
    },
    {
      role: 'tool',
      tool_call_id: 'start_log_upload_1',
      content: JSON.stringify({
        status: 'success',
        text: 'queued',
        data: { uploaded: true, uploadedCount: 1, queued: true },
        error: null
      })
    }
  ]);

  assert.equal(status, null);
});

test('resolveActiveAttachmentStatusFromHistoryMessages restores active status from incomplete log upload result', async () => {
  const {
    resolveActiveAttachmentStatusFromHistoryMessages
  } = loadServiceWithResolverMock(async (input) => input);

  const status = resolveActiveAttachmentStatusFromHistoryMessages([
    {
      role: 'assistant',
      content: '',
      tool_calls: [{
        id: 'start_log_upload_1',
        type: 'function',
        function: { name: 'start_log_upload', arguments: '{}' }
      }]
    },
    {
      role: 'tool',
      tool_call_id: 'start_log_upload_1',
      content: JSON.stringify({
        status: 'success',
        text: '共识别到4373-39的1个日志文件，密钥缺失，下一步动作是追问密钥',
        data: {
          uploaded: false,
          queued: false,
          attachmentStatus: {
            summary: '共识别到4373-39的1个日志文件，密钥缺失，下一步动作是追问密钥',
            nextAction: 'ask_for_key',
            uploadPreparation: {
              canUpload: false,
              resolvedDeviceId: '4373-39',
              resolvedDecryptKeyStatus: 'missing',
              resolvedDecryptKey: null,
              resolvedDeviceModelId: 4,
              resolvedSeriesId: 1,
              missingFields: ['decryptKey'],
              files: [{
                sourceFilePath: 'D:/tmp/2026081713_log.medbot',
                originalName: '2026081713_log.medbot',
                attachmentAssetId: 'asset-1'
              }]
            }
          },
          missingFields: ['decryptKey']
        },
        error: null
      })
    }
  ]);

  assert.equal(status.nextAction, 'ask_for_key');
  assert.equal(status.uploadPreparation.resolvedDeviceId, '4373-39');
  assert.equal(status.uploadPreparation.files.length, 1);
});

test('mergeAttachmentStatus keeps previous logs and applies new key scan result', async () => {
  const {
    mergeAttachmentStatus
  } = loadServiceWithResolverMock(async (input) => ({
    summary: 'merged',
    nextAction: 'continue',
    scanSummary: {
      logsFound: Array.isArray(input.files) ? input.files.length : 0,
      logsReady: 1,
      logsMissingKey: 0,
      logsMissingDeviceId: 0
    },
    uploadPreparation: {
      canUpload: true,
      resolvedDeviceId: input.explicitDeviceId || null,
      resolvedDecryptKeyStatus: 'valid',
      resolvedDecryptKey: input.explicitDecryptKey || null,
      resolvedDeviceModelId: input.explicitDeviceModelId ?? null,
      resolvedSeriesId: input.explicitSeriesId ?? null,
      missingFields: [],
      files: input.files || []
    }
  }));

  const merged = await mergeAttachmentStatus(
    {
      summary: 'old',
      nextAction: 'ask_for_key',
      scanSummary: null,
      uploadPreparation: {
        canUpload: false,
        resolvedDeviceId: null,
        resolvedDecryptKeyStatus: 'missing',
        resolvedDecryptKey: null,
        resolvedDeviceModelId: null,
        resolvedSeriesId: null,
        missingFields: ['deviceId'],
        files: [{
          sourceFilePath: 'D:/tmp/2026081713_log.medbot',
          originalName: '2026081713_log.medbot',
          attachmentAssetId: 'asset-1'
        }]
      }
    },
    {
      summary: 'new',
      nextAction: 'continue',
      scanSummary: null,
      uploadPreparation: {
        canUpload: false,
        resolvedDeviceId: '4373-39',
        resolvedDecryptKeyStatus: 'valid',
        resolvedDecryptKey: '00-01-05-a9-40-dc',
        resolvedDeviceModelId: 4,
        resolvedSeriesId: 1,
        missingFields: [],
        files: []
      }
    }
  );

  assert.equal(merged.uploadPreparation.canUpload, true);
  assert.equal(merged.uploadPreparation.resolvedDeviceId, '4373-39');
  assert.equal(merged.uploadPreparation.resolvedDecryptKey, '00-01-05-a9-40-dc');
  assert.equal(merged.uploadPreparation.files.length, 1);
  assert.equal(merged.uploadPreparation.files[0].attachmentAssetId, 'asset-1');
});
