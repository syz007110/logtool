const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const servicePath = path.resolve(__dirname, './agentLogUploadService.js');
const logUploadServicePath = path.resolve(__dirname, './logUploadService.js');
const asyncTaskServicePath = path.resolve(__dirname, './agentAsyncToolTaskService.js');
const attachmentResolverPath = path.resolve(__dirname, './attachmentUploadPreparationResolver.js');
const idGeneratorsPath = path.resolve(__dirname, '../utils/idGenerators.js');

function loadServiceWithMocks({
  createLogUploadJob = async () => null,
  createAgentAsyncToolTask = async () => null,
  resolveAttachmentUploadPreparation = async () => null,
  generateUlid = () => '01TESTULID0000000000000000'
} = {}) {
  delete require.cache[servicePath];
  require.cache[logUploadServicePath] = {
    exports: {
      createLogUploadJob,
      createUploadError: (code, message) => {
        const error = new Error(message);
        error.code = code;
        return error;
      }
    }
  };
  require.cache[asyncTaskServicePath] = {
    exports: {
      createAgentAsyncToolTask
    }
  };
  require.cache[attachmentResolverPath] = {
    exports: {
      resolveAttachmentUploadPreparation
    }
  };
  require.cache[idGeneratorsPath] = {
    exports: {
      generateUlid
    }
  };
  return require('./agentLogUploadService');
}

test('uploadLogFromAgentAttachment returns deferred async task envelope and keeps attachment status', async () => {
  const createdJobs = [];
  const createdTasks = [];
  const { uploadLogFromAgentAttachment } = loadServiceWithMocks({
    createLogUploadJob: async (command) => {
      createdJobs.push(command);
      return {
        logId: createdJobs.length,
        jobId: `job-${createdJobs.length}`,
        deviceId: command.deviceId,
        originalName: command.originalName,
        source: command.source,
        status: 'queued'
      };
    },
    createAgentAsyncToolTask: async (payload) => {
      createdTasks.push(payload);
    },
    resolveAttachmentUploadPreparation: async ({ files, explicitDeviceId, explicitDecryptKey }) => ({
      summary: '共识别到4373-39的2个日志文件，密钥可用，下一步动作是继续',
      nextAction: 'continue',
      scanSummary: {
        logsFound: files.length,
        logsReady: files.length,
        logsMissingKey: 0,
        logsMissingDeviceId: 0
      },
      uploadPreparation: {
        canUpload: true,
        resolvedDeviceId: explicitDeviceId || '4373-39',
        resolvedDecryptKeyStatus: 'valid',
        resolvedDecryptKey: explicitDecryptKey || '00-01-05-a9-40-dc',
        resolvedDeviceModelId: 4,
        resolvedSeriesId: 1,
        missingFields: [],
        files
      }
    })
  });

  const request = {
    traceId: 'trace-1',
    requestId: 'req-1',
    channel: { type: 'web', conversationId: 'conv-1' },
    session: { instanceId: 42 },
    user: { id: 123 },
    context: {
      agentTaskId: 'agent-task-1',
      attachmentStatus: {
        summary: '旧扫描结果',
        nextAction: 'continue',
        uploadPreparation: {
          canUpload: true,
          resolvedDeviceId: '4373-39',
          resolvedDecryptKeyStatus: 'valid',
          resolvedDecryptKey: '00-01-05-a9-40-dc',
          resolvedDeviceModelId: 4,
          resolvedSeriesId: 1,
          missingFields: [],
          files: [{
            sourceFilePath: 'D:/tmp/2026081713_log.medbot',
            originalName: '2026081713_log.medbot',
            attachmentAssetId: 'asset-1'
          }, {
            sourceFilePath: 'D:/tmp/2026081714_log.medbot',
            originalName: '2026081714_log.medbot',
            attachmentAssetId: 'asset-2'
          }]
        }
      }
    }
  };

  const result = await uploadLogFromAgentAttachment({
    queryType: 'device_id',
    originalNames: ['2026081713_log.medbot', '2026081714_log.medbot'],
    deviceId: '4373-39'
  }, request);

  assert.equal(createdJobs.length, 2);
  assert.equal(createdTasks.length, 1);
  assert.equal(createdTasks[0].taskId, 'agent_log_upload_01TESTULID0000000000000000');
  assert.equal(createdTasks[0].parentTaskId, 'agent-task-1');
  assert.equal(createdTasks[0].taskType, 'log_upload');
  assert.equal(createdTasks[0].toolName, 'start_log_upload');
  assert.equal(createdTasks[0].totalCount, 2);
  assert.equal(createdTasks[0].meta.deviceId, '4373-39');
  assert.equal(result.mode, 'deferred');
  assert.equal(result.taskId, 'agent_log_upload_01TESTULID0000000000000000');
  assert.equal(result.event.kind, 'async_tool');
  assert.equal(result.event.toolName, 'start_log_upload');
  assert.equal(result.event.phase, 'submitted');
  assert.equal(result.event.data.uploadedCount, 2);
  assert.deepEqual(result.event.data.files, [
    { originalName: '2026081713_log.medbot' },
    { originalName: '2026081714_log.medbot' }
  ]);
  assert.equal(request.context.attachmentStatus?.uploadPreparation?.files?.length, 2);
});

test('uploadLogFromAgentAttachment includes all duplicate-name files', async () => {
  const createdJobs = [];
  const { uploadLogFromAgentAttachment } = loadServiceWithMocks({
    createLogUploadJob: async (command) => {
      createdJobs.push(command);
      return {
        logId: createdJobs.length,
        jobId: `job-${createdJobs.length}`,
        deviceId: command.deviceId,
        originalName: command.originalName,
        source: command.source,
        status: 'queued'
      };
    },
    createAgentAsyncToolTask: async () => {},
    resolveAttachmentUploadPreparation: async ({ files, explicitDecryptKey }) => ({
      summary: '共识别到5G-07的2个日志文件，密钥可用，下一步动作是继续',
      nextAction: 'continue',
      scanSummary: {
        logsFound: files.length,
        logsReady: files.length,
        logsMissingKey: 0,
        logsMissingDeviceId: 0
      },
      uploadPreparation: {
        canUpload: true,
        resolvedDeviceId: '5G-07',
        resolvedDecryptKeyStatus: 'valid',
        resolvedDecryptKey: explicitDecryptKey || '00-01-05-a9-40-dc',
        resolvedDeviceModelId: 88,
        resolvedSeriesId: 9,
        missingFields: [],
        files
      }
    })
  });

  const request = {
    user: { id: 123 },
    context: {
      attachmentStatus: {
        uploadPreparation: {
          files: [{
            sourceFilePath: 'D:/tmp/a/2026081713_log.medbot',
            originalName: '2026081713_log.medbot',
            attachmentAssetId: 'asset-1'
          }, {
            sourceFilePath: 'D:/tmp/b/2026081713_log.medbot',
            originalName: '2026081713_log.medbot',
            attachmentAssetId: 'asset-2'
          }]
        }
      }
    }
  };

  await uploadLogFromAgentAttachment({
    queryType: 'decrypt_key',
    originalNames: ['2026081713_log.medbot'],
    decryptKey: '00-01-05-a9-40-dc'
  }, request);

  assert.equal(createdJobs.length, 2);
  assert.equal(createdJobs[0].originalName, '2026081713_log.medbot');
  assert.equal(createdJobs[1].originalName, '2026081713_log.medbot');
});
