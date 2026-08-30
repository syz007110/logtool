const fs = require('fs');
const path = require('path');

const Log = require('../models/log');
const Device = require('../models/device');
const queueManager = require('./queueManager');
const { getKeyForDeviceAndDate } = require('./deviceKeyService');
const { extractTimeFromFileName } = require('../utils/logTimeExtractor');
const { ensureDeviceModelAndSeries, parseSeriesId } = require('../utils/deviceSeriesBinding');
const { validateDeviceId } = require('../utils/deviceIdExtractor');
const { validateKey } = require('./agentLogUploadHelper');

const DEFAULT_DEVICE_ID = '0000-00';

function createUploadError(code, message, statusCode = 400) {
  const error = new Error(String(message || code || 'LOG_UPLOAD_FAILED'));
  error.code = String(code || 'LOG_UPLOAD_FAILED');
  error.statusCode = Number(statusCode) || 400;
  return error;
}

function normalizeName(value) {
  return String(value || '').trim();
}

function normalizeDeviceId(value) {
  return normalizeName(value) || DEFAULT_DEVICE_ID;
}

function normalizeNullableInt(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : NaN;
}

async function resolveDeviceBindingByDeviceId(deviceId) {
  const normalizedDeviceId = normalizeDeviceId(deviceId);
  if (!normalizedDeviceId || normalizedDeviceId === DEFAULT_DEVICE_ID) {
    return {
      deviceId: normalizedDeviceId,
      deviceModelId: null,
      seriesId: null
    };
  }

  const device = await Device.findOne({
    where: { device_id: normalizedDeviceId },
    attributes: ['device_id', 'device_model_id', 'series_id']
  });

  return {
    deviceId: normalizedDeviceId,
    deviceModelId: Number.isInteger(Number(device?.device_model_id)) ? Number(device.device_model_id) : null,
    seriesId: parseSeriesId(device?.series_id)
  };
}

async function resolveCommand(command = {}) {
  const sourceFilePath = path.resolve(normalizeName(command.sourceFilePath));
  if (!sourceFilePath || !fs.existsSync(sourceFilePath)) {
    throw createUploadError('SOURCE_FILE_MISSING', '上传文件不存在');
  }

  const originalName = normalizeName(command.originalName);
  if (!originalName) {
    throw createUploadError('ORIGINAL_NAME_REQUIRED', 'originalName 必填');
  }

  const deviceId = normalizeDeviceId(command.deviceId);
  if (deviceId !== DEFAULT_DEVICE_ID && !validateDeviceId(deviceId)) {
    throw createUploadError('INVALID_DEVICE_ID', '设备编号格式不正确');
  }

  const normalizedSource = String(command.source || '').trim().toLowerCase();
  const source = normalizedSource === 'auto-upload'
    ? 'auto-upload'
    : (normalizedSource === 'agent-upload' ? 'agent-upload' : 'user-upload');

  const stat = await fs.promises.stat(sourceFilePath);
  const binding = await resolveDeviceBindingByDeviceId(deviceId);
  const deviceModelId = normalizeNullableInt(command.deviceModelId ?? binding.deviceModelId);
  const seriesId = normalizeNullableInt(command.seriesId ?? binding.seriesId);

  if (Number.isNaN(deviceModelId)) {
    throw createUploadError('INVALID_DEVICE_MODEL_ID', 'deviceModelId 必须为正整数');
  }
  if (Number.isNaN(seriesId)) {
    throw createUploadError('INVALID_SERIES_ID', 'seriesId 必须为正整数');
  }

  const requireBinding = !(source === 'auto-upload' && (deviceModelId === null || seriesId === null));
  await ensureDeviceModelAndSeries({
    deviceId,
    deviceModelId,
    seriesId,
    required: requireBinding
  });

  const explicitLogTime = command.logTime ? new Date(command.logTime) : null;
  const parsedLogTime = explicitLogTime && !Number.isNaN(explicitLogTime.getTime())
    ? explicitLogTime
    : (extractTimeFromFileName(originalName) || new Date());
  const dbKey = deviceId !== DEFAULT_DEVICE_ID
    ? await getKeyForDeviceAndDate(deviceId, parsedLogTime)
    : null;
  const userKey = normalizeName(command.decryptKey) || null;

  if (!dbKey && !userKey) {
    throw createUploadError('KEY_NOT_FOUND', '未找到设备对应密钥，且未提供手动密钥');
  }
  if (userKey && !validateKey(userKey)) {
    throw createUploadError('INVALID_DECRYPT_KEY', '手动密钥格式不正确');
  }
  if (dbKey && !validateKey(dbKey)) {
    throw createUploadError('INVALID_DECRYPT_KEY', '数据库密钥格式不正确');
  }

  return {
    sourceFilePath,
    originalName,
    stagedFilename: path.basename(sourceFilePath),
    size: stat.size,
    deviceId,
    deviceModelId: deviceModelId == null ? null : Number(deviceModelId),
    seriesId: seriesId == null ? null : Number(seriesId),
    source,
    uploaderId: command.uploaderId == null ? null : Number(command.uploaderId),
    clientId: normalizeName(command.clientId) || null,
    attachmentAssetId: normalizeName(command.attachmentAssetId) || null,
    agentLogUploadTaskId: normalizeName(command.agentLogUploadTaskId) || null,
    channel: normalizeName(command.channel) || null,
    traceId: normalizeName(command.traceId) || null,
    requestId: normalizeName(command.requestId) || null,
    logTime: parsedLogTime,
    dbKey,
    userKey,
    decryptKey: dbKey || userKey,
    usedDecryptKeySource: dbKey ? 'device-key' : 'manual'
  };
}

async function upsertLogRecord({
  originalName,
  stagedFilename,
  size,
  deviceId,
  decryptKey,
  uploaderId
}) {
  let log = await Log.findOne({
    where: {
      device_id: deviceId || null,
      original_name: originalName
    }
  });

  if (log) {
    const currentVersion = Number.isInteger(log.version) ? log.version : 1;
    await log.update({
      filename: stagedFilename,
      size,
      status: 'uploading',
      upload_time: new Date(),
      uploader_id: uploaderId,
      device_id: deviceId || null,
      key_id: decryptKey || null,
      version: currentVersion + 1
    });
    return log;
  }

  return Log.create({
    filename: stagedFilename,
    original_name: originalName,
    size,
    status: 'uploading',
    upload_time: new Date(),
    uploader_id: uploaderId,
    device_id: deviceId || null,
    key_id: decryptKey || null
  });
}

async function enqueueLogProcessing(resolved, logId) {
  const queueSource = resolved.source === 'auto-upload' ? 'auto-upload' : 'user-upload';
  const queue = queueManager.getQueueBySource(queueSource);
  const priority = resolved.source === 'auto-upload' ? 1 : 10;

  return queue.add('process-log', {
    filePath: resolved.sourceFilePath,
    originalName: resolved.originalName,
    decryptKey: resolved.decryptKey,
    dbKey: resolved.dbKey || null,
    userKey: resolved.userKey || null,
    useKeyCascade: true,
    logTimeIso: resolved.logTime.toISOString(),
    deviceId: resolved.deviceId || null,
    uploaderId: resolved.uploaderId,
    logId,
    source: resolved.source,
    clientId: resolved.clientId,
    attachmentAssetId: resolved.attachmentAssetId || null,
    agentLogUploadTaskId: resolved.agentLogUploadTaskId || null
  }, {
    priority,
    delay: 0,
    attempts: 1,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    removeOnComplete: true,
    removeOnFail: true
  });
}

async function createLogUploadJob(command = {}) {
  const resolved = await resolveCommand(command);
  const logRecord = await upsertLogRecord({
    originalName: resolved.originalName,
    stagedFilename: resolved.stagedFilename,
    size: resolved.size,
    deviceId: resolved.deviceId,
    decryptKey: resolved.decryptKey,
    uploaderId: resolved.uploaderId
  });
  const job = await enqueueLogProcessing(resolved, logRecord.id);

  return {
    logId: Number(logRecord.id),
    jobId: String(job.id),
    deviceId: resolved.deviceId,
    originalName: resolved.originalName,
    source: resolved.source,
    status: 'queued',
    usedDecryptKeySource: resolved.usedDecryptKeySource,
    resolvedLogTime: resolved.logTime.toISOString(),
    logRecord
  };
}

module.exports = {
  DEFAULT_DEVICE_ID,
  createUploadError,
  createLogUploadJob,
  resolveDeviceBindingByDeviceId
};
