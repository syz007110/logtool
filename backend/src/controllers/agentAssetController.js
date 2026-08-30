const path = require('path');
const { ingestAgentAssetFromFile, safeUnlink } = require('../services/agentAssetIngestService');
const {
  MAX_FILES,
  MAX_FILE_SIZE,
  MAX_TOTAL_SIZE,
  MAX_FOLDER_DEPTH,
  MAX_INPUT_CHARS,
  ALLOWED_MIMES,
  ALLOWED_EXTENSIONS,
  validateAttachmentCount,
  validateAttachmentTotalSize,
  validateAttachmentDescriptor,
  validateRelativePath,
  normalizeRelativePath,
  isHiddenSystemPath,
  isAttachmentPolicyError
} = require('../services/agentAttachmentPolicy');

function normalizeMultipartFieldList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || ''));
  if (value == null) return [];
  return [String(value)];
}

async function uploadAgentAssets(req, res) {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      return res.status(400).json({ message: 'No file uploaded', error: 'NO_FILE' });
    }
    const relativePaths = normalizeMultipartFieldList(req.body?.relativePaths);
    const normalizedFiles = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const normalizedRelativePath = normalizeRelativePath(relativePaths[index] || '');
      if (normalizedRelativePath && isHiddenSystemPath(normalizedRelativePath)) {
        safeUnlink(file.path);
        continue;
      }
      normalizedFiles.push({
        ...file,
        relativePath: normalizedRelativePath || undefined
      });
    }
    if (normalizedFiles.length === 0) {
      return res.status(400).json({ message: '没有可上传的有效附件', error: 'NO_VALID_FILE' });
    }
    try {
      validateAttachmentCount(normalizedFiles.length);
    } catch (error) {
      normalizedFiles.forEach((f) => safeUnlink(f.path));
      return res.status(400).json({ message: error.userMessage, error: error.code });
    }

    const totalSize = normalizedFiles.reduce((sum, file) => sum + Number(file?.size || 0), 0);
    try {
      validateAttachmentTotalSize(totalSize);
    } catch (error) {
      normalizedFiles.forEach((f) => safeUnlink(f.path));
      return res.status(413).json({ message: error.userMessage, error: error.code });
    }

    for (const file of normalizedFiles) {
      try {
        validateAttachmentDescriptor({
          filename: file.originalname || file.filename || '',
          mimeType: file.mimetype,
          sizeBytes: Number(file.size || 0)
        });
        validateRelativePath(file.relativePath);
      } catch (error) {
        normalizedFiles.forEach((f) => safeUnlink(f.path));
        const statusCode = error.code === 'FILE_TOO_LARGE' ? 413 : 400;
        return res.status(statusCode).json({ message: error.userMessage, error: error.code });
      }
    }

    const uploaded = [];
    for (const file of normalizedFiles) {
      uploaded.push(await ingestAgentAssetFromFile({
        filePath: file.path,
        originalName: file.originalname || path.basename(file.filename || 'file'),
        storedName: path.basename(file.filename || file.path || 'file'),
        mimeType: file.mimetype,
        sizeBytes: Number(file.size || 0),
        relativePath: file.relativePath,
        uploaderId: req.user?.id != null ? String(req.user.id) : undefined,
        source: 'web'
      }));
    }

    return res.json({ success: true, attachments: uploaded });
  } catch (error) {
    const files = Array.isArray(req.files) ? req.files : [];
    files.forEach((f) => safeUnlink(f.path));
    if (isAttachmentPolicyError(error)) {
      const statusCode = error.code === 'FILE_TOO_LARGE' || error.code === 'ATTACHMENT_TOTAL_SIZE_EXCEEDED' ? 413 : 400;
      return res.status(statusCode).json({ message: error.userMessage, error: error.code });
    }
    console.error('uploadAgentAssets failed:', error);
    return res.status(500).json({ message: '上传失败，请稍后重试', error: String(error?.message || error) });
  }
}

function getAgentAssetPolicy(req, res) {
  return res.json({
    success: true,
    policy: {
      maxFiles: MAX_FILES,
      maxFileSize: MAX_FILE_SIZE,
      maxTotalSize: MAX_TOTAL_SIZE,
      maxFolderDepth: MAX_FOLDER_DEPTH,
      maxInputChars: MAX_INPUT_CHARS,
      allowedMimes: ALLOWED_MIMES,
      allowedExtensions: ALLOWED_EXTENSIONS
    }
  });
}

module.exports = {
  getAgentAssetPolicy,
  uploadAgentAssets,
  MAX_FILES,
  MAX_FILE_SIZE,
  MAX_TOTAL_SIZE,
  MAX_FOLDER_DEPTH,
  ALLOWED_MIMES,
  ALLOWED_EXTENSIONS
};
