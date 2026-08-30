const { createLogUploadJob, createUploadError } = require('./logUploadService');
const { resolveAttachmentUploadPreparation } = require('./attachmentUploadPreparationResolver');
const { createAgentAsyncToolTask } = require('./agentAsyncToolTaskService');
const { generateUlid } = require('../utils/idGenerators');
const {
  normalizeName,
  validateKey,
  createServiceError
} = require('./agentLogUploadHelper');

function normalizeOriginalNames(rawValue) {
  const list = Array.isArray(rawValue) ? rawValue : [];
  return Array.from(new Set(
    list
      .map((item) => normalizeName(item))
      .filter(Boolean)
  ));
}

function normalizeQueryType(value) {
  const text = normalizeName(value).toLowerCase();
  if (text === 'device_id' || text === 'decrypt_key' || text === 'device_id_and_key') return text;
  return '';
}

function renderDeferredPromptText(execution = {}, fileCount) {
  const template = String(execution?.deferredPrompt?.text || '').trim();
  if (template) {
    return template.replace(/\{\{\s*(fileCount|uploadedCount)\s*\}\}/g, String(Number(fileCount || 0) || 0));
  }
  if (fileCount <= 1) return '已创建日志上传任务，正在处理中。';
  return `已创建日志上传任务，正在处理 ${fileCount} 个日志文件。`;
}

function validateQueryArgs(args = {}) {
  const queryType = normalizeQueryType(args.queryType);
  if (!queryType) {
    throw createServiceError('INVALID_QUERY_TYPE', 'queryType 必须为 device_id、decrypt_key 或 device_id_and_key');
  }
  const originalNames = normalizeOriginalNames(args.originalNames);
  if (originalNames.length < 1) {
    throw createServiceError('ORIGINAL_NAMES_REQUIRED', 'originalNames 必填');
  }

  const deviceId = normalizeName(args.deviceId).toUpperCase();
  const decryptKey = normalizeName(args.decryptKey);
  if (queryType === 'device_id' && !deviceId) {
    throw createServiceError('DEVICE_ID_REQUIRED', 'queryType=device_id 时 deviceId 必填');
  }
  if (queryType === 'decrypt_key' && !decryptKey) {
    throw createServiceError('DECRYPT_KEY_REQUIRED', 'queryType=decrypt_key 时 decryptKey 必填');
  }
  if (queryType === 'device_id_and_key') {
    if (!deviceId) {
      throw createServiceError('DEVICE_ID_REQUIRED', 'queryType=device_id_and_key 时 deviceId 必填');
    }
    if (!decryptKey) {
      throw createServiceError('DECRYPT_KEY_REQUIRED', 'queryType=device_id_and_key 时 decryptKey 必填');
    }
  }
  if (decryptKey && !validateKey(decryptKey)) {
    throw createServiceError('INVALID_DECRYPT_KEY', 'decryptKey 格式不正确');
  }

  return {
    queryType,
    originalNames,
    deviceId,
    decryptKey
  };
}

function normalizePreparedFiles(files = []) {
  return (Array.isArray(files) ? files : [])
    .map((item) => ({
      sourceFilePath: normalizeName(item?.sourceFilePath),
      originalName: normalizeName(item?.originalName),
      attachmentAssetId: normalizeName(item?.attachmentAssetId) || null
    }))
    .filter((item) => item.sourceFilePath && item.originalName);
}

function resolveCurrentAttachmentStatus(request = {}) {
  const status = request?.context?.attachmentStatus
    && typeof request.context.attachmentStatus === 'object'
    ? request.context.attachmentStatus
    : null;
  return status;
}

function pickPreparedFilesByOriginalNames(originalNames = [], attachmentStatus = null) {
  const files = normalizePreparedFiles(attachmentStatus?.uploadPreparation?.files);
  if (files.length < 1) {
    throw createServiceError('ATTACHMENT_STATUS_EMPTY', '当前会话中没有可上传的日志文件，请先上传并识别日志附件');
  }

  const matchedFiles = [];
  const missingNames = [];
  for (const originalName of originalNames) {
    const matches = files.filter((item) => item.originalName === originalName);
    if (matches.length < 1) {
      missingNames.push(originalName);
      continue;
    }
    matchedFiles.push(...matches);
  }

  if (missingNames.length > 0) {
    throw createServiceError(
      'ORIGINAL_NAME_NOT_FOUND',
      `未找到目标日志文件：${missingNames.join(', ')}`
    );
  }

  return matchedFiles;
}

async function resolveUploadPreparation({ args = {}, attachmentStatus = null, preparedFiles = [] }) {
  const uploadPreparation = attachmentStatus?.uploadPreparation
    && typeof attachmentStatus.uploadPreparation === 'object'
    ? attachmentStatus.uploadPreparation
    : {};
  return resolveAttachmentUploadPreparation({
    files: preparedFiles,
    explicitDeviceId: normalizeName(args.deviceId).toUpperCase() || undefined,
    explicitDecryptKey: normalizeName(args.decryptKey) || undefined,
    explicitDeviceModelId: uploadPreparation.resolvedDeviceModelId,
    explicitSeriesId: uploadPreparation.resolvedSeriesId,
    fallbackResolvedDeviceId: normalizeName(uploadPreparation.resolvedDeviceId).toUpperCase() || undefined,
    fallbackResolvedDecryptKey: normalizeName(uploadPreparation.resolvedDecryptKey) || undefined,
    fallbackResolvedDeviceModelId: uploadPreparation.resolvedDeviceModelId,
    fallbackResolvedSeriesId: uploadPreparation.resolvedSeriesId,
    deviceIdCandidates: [
      normalizeName(uploadPreparation.resolvedDeviceId).toUpperCase()
    ].filter(Boolean),
    detectedKeys: [
      normalizeName(uploadPreparation.resolvedDecryptKey)
    ].filter(Boolean).map((value) => ({ value }))
  });
}

function buildDeferredResult({ taskId, fileCount, deviceId, files = [], execution = {} }) {
  const text = renderDeferredPromptText(execution, fileCount);
  return {
    mode: 'deferred',
    taskId: String(taskId || '').trim(),
    event: {
      kind: 'async_tool',
      toolName: 'start_log_upload',
      phase: 'submitted',
      text,
      data: {
        uploadedCount: fileCount,
        deviceId: deviceId || null,
        files: files.map((item) => ({
          originalName: item.originalName
        }))
      }
    },
    debugMeta: {
      source: 'registered_tool',
      toolName: 'start_log_upload'
    }
  };
}

async function uploadLogFromAgentAttachment(args = {}, request = {}, execution = {}) {
  const validated = validateQueryArgs(args);
  const attachmentStatus = resolveCurrentAttachmentStatus(request);
  const preparedFiles = pickPreparedFilesByOriginalNames(validated.originalNames, attachmentStatus);
  const updatedAttachmentStatus = await resolveUploadPreparation({
    args: validated,
    attachmentStatus,
    preparedFiles
  });

  const uploadPreparation = updatedAttachmentStatus?.uploadPreparation
    && typeof updatedAttachmentStatus.uploadPreparation === 'object'
    ? updatedAttachmentStatus.uploadPreparation
    : null;
  if (!uploadPreparation || uploadPreparation.canUpload !== true) {
    const missingFields = Array.isArray(uploadPreparation?.missingFields) ? uploadPreparation.missingFields : [];
    throw createServiceError(
      'UPLOAD_PREPARATION_INCOMPLETE',
      missingFields.length > 0
        ? `日志上传条件不完整，缺少：${missingFields.join(', ')}`
        : '日志上传条件不完整'
    );
  }

  const resolvedDeviceId = normalizeName(uploadPreparation.resolvedDeviceId).toUpperCase();
  const resolvedDecryptKey = normalizeName(uploadPreparation.resolvedDecryptKey);
  const resolvedDeviceModelId = Number(uploadPreparation.resolvedDeviceModelId || 0) || null;
  const resolvedSeriesId = Number(uploadPreparation.resolvedSeriesId || 0) || null;
  if (!resolvedDeviceId && !resolvedDecryptKey) {
    throw createServiceError('UPLOAD_CONTEXT_MISSING', '缺少 deviceId 或 decryptKey，无法执行日志上传');
  }

  const taskId = `agent_log_upload_${generateUlid()}`;
  await createAgentAsyncToolTask({
    taskId,
    parentTaskId: request?.context?.agentTaskId || null,
    taskType: 'log_upload',
    toolName: 'start_log_upload',
    instanceId: request?.session?.instanceId || request?.context?.instanceId || null,
    conversationId: request?.channel?.conversationId || null,
    userId: request?.user?.id || null,
    requestId: request?.requestId || null,
    traceId: request?.traceId || null,
    totalCount: preparedFiles.length,
    batchTimeoutMs: execution?.batchTimeoutMs || null,
    meta: {
      deviceId: resolvedDeviceId || null,
      channelType: request?.channel?.type || 'agent',
      lang: request?.context?.lang || 'zh-CN',
      llmProviderId: request?.context?.llmProviderId || null
    }
  });

  const jobRefs = [];
  for (const file of preparedFiles) {
    let uploadResult = null;
    try {
      // eslint-disable-next-line no-await-in-loop
      uploadResult = await createLogUploadJob({
        sourceFilePath: file.sourceFilePath,
        originalName: file.originalName,
        attachmentAssetId: file.attachmentAssetId,
        deviceId: resolvedDeviceId,
        deviceModelId: resolvedDeviceModelId,
        seriesId: resolvedSeriesId,
        decryptKey: resolvedDecryptKey || null,
        source: 'agent-upload',
        uploaderId: request?.user?.id == null ? null : Number(request.user.id),
        channel: request?.channel?.type || 'agent',
        traceId: request?.traceId || null,
        requestId: request?.requestId || null,
        agentLogUploadTaskId: taskId
      });
    } catch (error) {
      if (error?.code) throw error;
      throw createUploadError('LOG_UPLOAD_SUBMIT_FAILED', error?.message || '日志上传任务创建失败');
    }
    jobRefs.push({
      jobId: String(uploadResult.jobId),
      logId: Number(uploadResult.logId),
      originalName: file.originalName,
      sourceFilePath: file.sourceFilePath,
      attachmentAssetId: file.attachmentAssetId || null
    });
  }

  return buildDeferredResult({
    taskId,
    fileCount: jobRefs.length,
    deviceId: resolvedDeviceId || null,
    files: preparedFiles,
    execution
  });
}

module.exports = {
  uploadLogFromAgentAttachment
};
