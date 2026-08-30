const path = require('path');
const {
  LOCAL_DIR: AGENT_ASSET_LOCAL_DIR,
  TMP_DIR: AGENT_ASSET_TMP_DIR
} = require('../config/agentAssetStorage');

const SUPPORTED_LOG_EXTENSIONS = new Set(['.medbot']);
const DEFAULT_DEVICE_ID = '0000-00';
const MAC_ADDRESS_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;

function normalizeName(value) {
  return String(value || '').trim();
}

function validateKey(value) {
  return MAC_ADDRESS_REGEX.test(String(value || '').trim());
}

function createServiceError(code, message, extra = {}) {
  const error = new Error(String(message || code || 'AGENT_LOG_UPLOAD_FAILED'));
  error.code = String(code || 'AGENT_LOG_UPLOAD_FAILED');
  Object.assign(error, extra);
  return error;
}

function ensureWithinBase(baseDir, targetPath) {
  const base = path.resolve(baseDir);
  const target = path.resolve(targetPath);
  const relative = path.relative(base, target);
  if (!relative || relative === '') return target;
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw createServiceError('ATTACHMENT_PATH_INVALID', '附件路径不在允许范围内');
  }
  return target;
}

function resolveAttachmentSourcePath(attachment) {
  const objectKey = normalizeName(attachment?.objectKey).replace(/\//g, path.sep);
  const storedName = normalizeName(attachment?.storedName);
  if (objectKey) {
    return ensureWithinBase(AGENT_ASSET_LOCAL_DIR, path.join(AGENT_ASSET_LOCAL_DIR, objectKey));
  }
  if (storedName) {
    return ensureWithinBase(AGENT_ASSET_TMP_DIR, path.join(AGENT_ASSET_TMP_DIR, storedName));
  }
  throw createServiceError('ATTACHMENT_PATH_MISSING', '附件缺少可用存储路径');
}

function pickAttachment(attachments, args = {}) {
  const list = Array.isArray(attachments) ? attachments : [];
  if (list.length < 1) {
    throw createServiceError('ATTACHMENT_REQUIRED', '当前消息没有可用附件');
  }

  const requestedAssetId = normalizeName(args.attachmentAssetId);
  const requestedName = normalizeName(args.attachmentName).toLowerCase();

  let matched = null;
  if (requestedAssetId) {
    matched = list.find((item) => normalizeName(item?.assetId) === requestedAssetId) || null;
  }
  if (!matched && requestedName) {
    matched = list.find((item) => normalizeName(item?.originalName).toLowerCase() === requestedName) || null;
  }
  if (!matched && !requestedAssetId && !requestedName && list.length === 1) {
    matched = list[0];
  }
  if (!matched) {
    const available = list
      .map((item) => normalizeName(item?.originalName) || normalizeName(item?.assetId))
      .filter(Boolean)
      .join(', ');
    throw createServiceError(
      'ATTACHMENT_NOT_FOUND',
      available
        ? `未找到目标附件，可用附件：${available}`
        : '未找到目标附件'
    );
  }

  const originalName = normalizeName(matched.originalName || matched.storedName || 'attachment');
  const ext = path.extname(originalName).toLowerCase();
  if (!SUPPORTED_LOG_EXTENSIONS.has(ext)) {
    throw createServiceError(
      'UNSUPPORTED_LOG_ATTACHMENT',
      `当前仅支持上传 ${Array.from(SUPPORTED_LOG_EXTENSIONS).join(', ')} 附件`
    );
  }
  if (String(matched.status || 'available').trim().toLowerCase() !== 'available') {
    throw createServiceError('ATTACHMENT_UNAVAILABLE', '附件当前不可用，请重新上传后重试');
  }
  return matched;
}

function normalizeAttachmentAssetIds(rawValue) {
  const list = Array.isArray(rawValue) ? rawValue : [];
  return Array.from(new Set(
    list
      .map((item) => normalizeName(item))
      .filter(Boolean)
  ));
}

function pickAttachmentsByAssetIds(attachments, attachmentAssetIds) {
  const list = Array.isArray(attachments) ? attachments : [];
  const requestedIds = normalizeAttachmentAssetIds(attachmentAssetIds);
  if (requestedIds.length < 1) {
    throw createServiceError('ATTACHMENT_REQUIRED', 'attachmentAssetIds 必填');
  }
  if (list.length < 1) {
    throw createServiceError('ATTACHMENT_REQUIRED', '当前消息没有可用附件');
  }

  const matched = list.filter((item) => requestedIds.includes(normalizeName(item?.assetId)));
  if (matched.length < 1) {
    const available = list
      .map((item) => normalizeName(item?.assetId))
      .filter(Boolean)
      .join(', ');
    throw createServiceError(
      'ATTACHMENT_NOT_FOUND',
      available
        ? `未找到目标附件，可用附件：${available}`
        : '未找到目标附件'
    );
  }

  const unsupported = matched.find((item) => {
    const originalName = normalizeName(item?.originalName || item?.storedName || 'attachment');
    return !SUPPORTED_LOG_EXTENSIONS.has(path.extname(originalName).toLowerCase());
  });
  if (unsupported) {
    throw createServiceError(
      'UNSUPPORTED_LOG_ATTACHMENT',
      `当前仅支持上传 ${Array.from(SUPPORTED_LOG_EXTENSIONS).join(', ')} 附件`
    );
  }

  const unavailable = matched.find((item) => String(item?.status || 'available').trim().toLowerCase() !== 'available');
  if (unavailable) {
    throw createServiceError('ATTACHMENT_UNAVAILABLE', '附件当前不可用，请重新上传后重试');
  }

  return matched;
}

module.exports = {
  DEFAULT_DEVICE_ID,
  SUPPORTED_LOG_EXTENSIONS,
  validateKey,
  createServiceError,
  normalizeName,
  resolveAttachmentSourcePath,
  pickAttachment,
  pickAttachmentsByAssetIds,
  normalizeAttachmentAssetIds
};
