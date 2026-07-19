const path = require('path');
const { getAgentFixedT } = require('../agentization/utils/agentI18n');
const {
  MAX_FILES,
  MAX_FILE_SIZE,
  MAX_TOTAL_SIZE,
  ALLOWED_MIMES,
  ALLOWED_EXTENSIONS
} = require('../config/agentAssetStorage');

function matchMimeRule(mime, rule) {
  const m = String(mime || '').trim().toLowerCase();
  const r = String(rule || '').trim().toLowerCase();
  if (!m || !r) return false;
  if (r === '*/*') return true;
  if (r.endsWith('/*')) return m.startsWith(r.slice(0, -1));
  return m === r;
}

function isAllowedMime(mimeType) {
  const mime = String(mimeType || '').trim().toLowerCase();
  if (!mime) return false;
  if (ALLOWED_MIMES.length === 0) return true;
  return ALLOWED_MIMES.some((rule) => matchMimeRule(mime, rule));
}

function isAllowedExtension(filename) {
  const ext = String(path.extname(filename || '')).trim().toLowerCase();
  if (!ext) return false;
  if (ALLOWED_EXTENSIONS.length === 0) return true;
  return ALLOWED_EXTENSIONS.includes(ext);
}

function createAttachmentPolicyError(code, message, details = {}) {
  const error = new Error(String(message || code || 'ATTACHMENT_POLICY_VIOLATION'));
  error.code = String(code || 'ATTACHMENT_POLICY_VIOLATION').trim() || 'ATTACHMENT_POLICY_VIOLATION';
  error.userMessage = String(message || '').trim() || '附件不符合上传规则。';
  error.details = details && typeof details === 'object' ? { ...details } : {};
  error.isAttachmentPolicyError = true;
  return error;
}

function isAttachmentPolicyError(error) {
  return Boolean(error?.isAttachmentPolicyError);
}

function validateAttachmentCount(count, options = {}) {
  const t = getAgentFixedT(options.language);
  const normalized = Number(count || 0);
  if (normalized > MAX_FILES) {
    throw createAttachmentPolicyError(
      'ATTACHMENT_COUNT_EXCEEDED',
      t('shared.agent.attachmentPolicy.countExceeded', { maxFiles: MAX_FILES }),
      { maxFiles: MAX_FILES, count: normalized }
    );
  }
}

function validateAttachmentTotalSize(totalSizeBytes, options = {}) {
  const t = getAgentFixedT(options.language);
  const normalized = Number(totalSizeBytes || 0);
  if (normalized > MAX_TOTAL_SIZE) {
    throw createAttachmentPolicyError(
      'ATTACHMENT_TOTAL_SIZE_EXCEEDED',
      t('shared.agent.attachmentPolicy.totalSizeExceeded', {
        maxTotalSizeMb: Math.round(MAX_TOTAL_SIZE / (1024 * 1024))
      }),
      { maxTotalSize: MAX_TOTAL_SIZE, totalSizeBytes: normalized }
    );
  }
}

function validateAttachmentDescriptor({ filename, mimeType, sizeBytes }, options = {}) {
  const t = getAgentFixedT(options.language);
  if (!isAllowedExtension(filename)) {
    throw createAttachmentPolicyError(
      'UNSUPPORTED_FILE_EXTENSION',
      t('shared.agent.attachmentPolicy.unsupportedExtension'),
      { filename: String(filename || '') }
    );
  }
  if (!isAllowedMime(mimeType)) {
    throw createAttachmentPolicyError(
      'UNSUPPORTED_FILE_TYPE',
      t('shared.agent.attachmentPolicy.unsupportedMimeType'),
      { mimeType: String(mimeType || '') }
    );
  }
  const normalized = Number(sizeBytes || 0);
  if (normalized > MAX_FILE_SIZE) {
    throw createAttachmentPolicyError(
      'FILE_TOO_LARGE',
      t('shared.agent.attachmentPolicy.fileTooLarge', {
        maxFileSizeMb: Math.round(MAX_FILE_SIZE / (1024 * 1024))
      }),
      { maxFileSize: MAX_FILE_SIZE, sizeBytes: normalized }
    );
  }
}

function validateAttachmentCandidateDescriptor({ filename }, options = {}) {
  const normalizedFilename = String(filename || '').trim();
  if (!normalizedFilename) return;
  const t = getAgentFixedT(options.language);
  if (!isAllowedExtension(normalizedFilename)) {
    throw createAttachmentPolicyError(
      'UNSUPPORTED_FILE_EXTENSION',
      t('shared.agent.attachmentPolicy.unsupportedExtension'),
      { filename: normalizedFilename }
    );
  }
}

function validateResolvedAttachments(attachments, options = {}) {
  const list = Array.isArray(attachments) ? attachments : [];
  validateAttachmentCount(list.length, options);
  const totalSizeBytes = list.reduce((sum, item) => sum + Number(item?.sizeBytes || 0), 0);
  validateAttachmentTotalSize(totalSizeBytes, options);
}

function buildAttachmentShortCircuit(error) {
  if (!isAttachmentPolicyError(error)) return null;
  return {
    reason: String(error.code || 'ATTACHMENT_POLICY_VIOLATION').trim().toLowerCase(),
    message: String(error.userMessage || error.message || '附件不符合上传规则。').trim(),
    details: error.details && typeof error.details === 'object' ? { ...error.details } : {}
  };
}

module.exports = {
  MAX_FILES,
  MAX_FILE_SIZE,
  MAX_TOTAL_SIZE,
  ALLOWED_MIMES,
  ALLOWED_EXTENSIONS,
  isAllowedMime,
  isAllowedExtension,
  createAttachmentPolicyError,
  isAttachmentPolicyError,
  validateAttachmentCount,
  validateAttachmentTotalSize,
  validateAttachmentCandidateDescriptor,
  validateAttachmentDescriptor,
  validateResolvedAttachments,
  buildAttachmentShortCircuit
};
