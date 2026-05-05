const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {
  STORAGE,
  MAX_FILES,
  MAX_FILE_SIZE,
  TMP_TTL_HOURS,
  ALLOWED_MIMES,
  ensureTempDir,
  buildTempLocalUrl,
  getOssClient,
  buildOssUrl,
  buildTempOssObjectKey
} = require('../config/agentAssetStorage');

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_) {}
}

function expiresAtIso() {
  return new Date(Date.now() + Math.max(1, TMP_TTL_HOURS) * 60 * 60 * 1000).toISOString();
}

function matchMimeRule(mime, rule) {
  const m = String(mime || '').trim().toLowerCase();
  const r = String(rule || '').trim().toLowerCase();
  if (!m || !r) return false;
  if (r === '*/*') return true;
  if (r.endsWith('/*')) {
    const prefix = r.slice(0, -1); // keep trailing "/"
    return m.startsWith(prefix);
  }
  return m === r;
}

function isAllowedMime(mimeType) {
  const mime = String(mimeType || '').trim().toLowerCase();
  if (!mime) return false;
  if (ALLOWED_MIMES.length === 0) return true;
  return ALLOWED_MIMES.some((rule) => matchMimeRule(mime, rule));
}

async function uploadAgentAssets(req, res) {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      return res.status(400).json({ message: 'No file uploaded', error: 'NO_FILE' });
    }
    if (files.length > MAX_FILES) {
      files.forEach((f) => safeUnlink(f.path));
      return res.status(400).json({ message: `最多上传 ${MAX_FILES} 个附件` });
    }

    const uploaded = [];
    for (const file of files) {
      if (!isAllowedMime(file.mimetype)) {
        safeUnlink(file.path);
        return res.status(400).json({ message: '文件类型不支持', error: 'UNSUPPORTED_FILE_TYPE' });
      }
      if (Number(file.size || 0) > MAX_FILE_SIZE) {
        safeUnlink(file.path);
        return res.status(413).json({ message: `单个附件不能超过 ${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB` });
      }

      let url = '';
      let objectKey = '';
      const storage = STORAGE === 'oss' ? 'oss' : 'local';

      if (STORAGE === 'oss') {
        const client = await getOssClient();
        objectKey = buildTempOssObjectKey(path.basename(file.filename || file.originalname || 'file'));
        const putResult = await client.put(objectKey, file.path);
        url = buildOssUrl(objectKey, putResult?.url);
        safeUnlink(file.path);
      } else {
        ensureTempDir();
        objectKey = `tmp/${path.basename(file.path)}`;
        url = buildTempLocalUrl(path.basename(file.path));
      }

      uploaded.push({
        id: crypto.randomUUID(),
        url,
        storage,
        filename: file.filename || path.basename(objectKey),
        original_name: file.originalname,
        object_key: objectKey,
        size_bytes: Number(file.size || 0),
        mime_type: file.mimetype,
        expires_at: expiresAtIso()
      });
    }

    return res.json({ success: true, files: uploaded });
  } catch (error) {
    console.error('uploadAgentAssets failed:', error);
    return res.status(500).json({ message: '上传失败，请稍后重试', error: String(error?.message || error) });
  }
}

module.exports = {
  uploadAgentAssets,
  MAX_FILES,
  MAX_FILE_SIZE,
  ALLOWED_MIMES
};
