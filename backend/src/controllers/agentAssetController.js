const path = require('path');
const { ingestAgentAssetFromFile, safeUnlink } = require('../services/agentAssetIngestService');
const {
  MAX_FILES,
  MAX_FILE_SIZE,
  MAX_TOTAL_SIZE,
  ALLOWED_MIMES,
  ALLOWED_EXTENSIONS,
  validateAttachmentCount,
  validateAttachmentTotalSize,
  validateAttachmentDescriptor,
  isAttachmentPolicyError
} = require('../services/agentAttachmentPolicy');

async function uploadAgentAssets(req, res) {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      return res.status(400).json({ message: 'No file uploaded', error: 'NO_FILE' });
    }
    try {
      validateAttachmentCount(files.length);
    } catch (error) {
      files.forEach((f) => safeUnlink(f.path));
      return res.status(400).json({ message: error.userMessage, error: error.code });
    }

    const totalSize = files.reduce((sum, file) => sum + Number(file?.size || 0), 0);
    try {
      validateAttachmentTotalSize(totalSize);
    } catch (error) {
      files.forEach((f) => safeUnlink(f.path));
      return res.status(413).json({ message: error.userMessage, error: error.code });
    }

    for (const file of files) {
      try {
        validateAttachmentDescriptor({
          filename: file.originalname || file.filename || '',
          mimeType: file.mimetype,
          sizeBytes: Number(file.size || 0)
        });
      } catch (error) {
        files.forEach((f) => safeUnlink(f.path));
        const statusCode = error.code === 'FILE_TOO_LARGE' ? 413 : 400;
        return res.status(statusCode).json({ message: error.userMessage, error: error.code });
      }
    }

    const uploaded = [];
    for (const file of files) {
      uploaded.push(await ingestAgentAssetFromFile({
        filePath: file.path,
        originalName: file.originalname || path.basename(file.filename || 'file'),
        storedName: path.basename(file.filename || file.path || 'file'),
        mimeType: file.mimetype,
        sizeBytes: Number(file.size || 0),
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

module.exports = {
  uploadAgentAssets,
  MAX_FILES,
  MAX_FILE_SIZE,
  MAX_TOTAL_SIZE,
  ALLOWED_MIMES,
  ALLOWED_EXTENSIONS
};
