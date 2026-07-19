const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {
  STORAGE,
  TMP_TTL_HOURS,
  ensureTempDir,
  buildTempLocalUrl,
  getOssClient,
  buildOssUrl,
  buildTempOssObjectKey
} = require('../config/agentAssetStorage');
const { validateAttachmentDescriptor } = require('./agentAttachmentPolicy');

function decodeMaybeLatin1(name) {
  try {
    return Buffer.from(String(name || ''), 'latin1').toString('utf8');
  } catch (_) {
    return String(name || '');
  }
}

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_) {}
}

function expiresAtIso() {
  return new Date(Date.now() + Math.max(1, TMP_TTL_HOURS) * 60 * 60 * 1000).toISOString();
}

function detectAttachmentType(mimeType) {
  const mime = String(mimeType || '').trim().toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (buf) => hash.update(buf));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function readUInt24BE(buffer, offset) {
  return (buffer[offset] << 16) | (buffer[offset + 1] << 8) | buffer[offset + 2];
}

function parsePngDimensions(buffer) {
  if (buffer.length < 24) return null;
  if (buffer.toString('ascii', 1, 4) !== 'PNG') return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function parseJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const size = buffer.readUInt16BE(offset + 2);
    if (size < 2 || offset + 2 + size > buffer.length) break;
    const isSofMarker = (
      (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf)
    );
    if (isSofMarker) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7)
      };
    }
    offset += 2 + size;
  }
  return null;
}

function parseWebpDimensions(buffer) {
  if (buffer.length < 30) return null;
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    return null;
  }
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff
    };
  }
  if (chunk === 'VP8L') {
    const b0 = buffer[21];
    const b1 = buffer[22];
    const b2 = buffer[23];
    const b3 = buffer[24];
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))
    };
  }
  if (chunk === 'VP8X') {
    return {
      width: 1 + readUInt24BE(buffer, 24),
      height: 1 + readUInt24BE(buffer, 27)
    };
  }
  return null;
}

async function extractImageDimensions(filePath, mimeType) {
  const mime = String(mimeType || '').trim().toLowerCase();
  if (!mime.startsWith('image/')) return { width: null, height: null };
  const buffer = await fs.promises.readFile(filePath);
  let size = null;
  if (mime === 'image/png') size = parsePngDimensions(buffer);
  else if (mime === 'image/jpeg') size = parseJpegDimensions(buffer);
  else if (mime === 'image/webp') size = parseWebpDimensions(buffer);
  return {
    width: Number.isFinite(size?.width) ? size.width : null,
    height: Number.isFinite(size?.height) ? size.height : null
  };
}

function buildStoredName(originalName) {
  const ext = path.extname(originalName || '').trim();
  const safeExt = ext || '';
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`;
}

async function moveFile(sourcePath, targetPath) {
  try {
    await fs.promises.rename(sourcePath, targetPath);
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error;
    await fs.promises.copyFile(sourcePath, targetPath);
    safeUnlink(sourcePath);
  }
}

async function ingestAgentAssetFromFile(options = {}) {
  const filePath = String(options.filePath || '').trim();
  if (!filePath) {
    throw new Error('filePath is required');
  }

  const originalName = decodeMaybeLatin1(options.originalName || path.basename(filePath) || 'file').trim()
    || 'file';

  const mimeType = String(options.mimeType || 'application/octet-stream').trim().toLowerCase();

  const stat = await fs.promises.stat(filePath);
  const sizeBytes = Number(options.sizeBytes || stat.size || 0);
  validateAttachmentDescriptor({ filename: originalName, mimeType, sizeBytes });

  ensureTempDir();
  const attachmentType = detectAttachmentType(mimeType);
  const imageMeta = await extractImageDimensions(filePath, mimeType);
  const sha256 = await sha256File(filePath);
  const storedName = String(options.storedName || '').trim() || buildStoredName(originalName);
  const source = String(options.source || 'web').trim() || 'web';
  const uploaderId = options.uploaderId == null ? undefined : String(options.uploaderId);

  if (STORAGE === 'oss') {
    const client = await getOssClient();
    const objectKey = buildTempOssObjectKey(storedName);
    const putResult = await client.put(objectKey, filePath);
    safeUnlink(filePath);
    const url = buildOssUrl(objectKey, putResult?.url);
    return {
      assetId: crypto.randomUUID(),
      type: attachmentType,
      storage: 'oss',
      objectKey,
      bucket: String(process.env.OSS_BUCKET || '').trim() || null,
      originalName,
      storedName,
      mimeType,
      sizeBytes,
      sha256,
      uploaderId,
      source,
      previewUrl: attachmentType === 'image' ? url : null,
      url: url || null,
      width: imageMeta.width,
      height: imageMeta.height,
      status: 'available',
      expiresAt: expiresAtIso()
    };
  }

  const targetPath = path.resolve(ensureTempDir(), storedName);
  if (path.resolve(filePath) !== targetPath) {
    await moveFile(filePath, targetPath);
  }
  const objectKey = `tmp/${storedName}`;
  const url = buildTempLocalUrl(storedName);
  return {
    assetId: crypto.randomUUID(),
    type: attachmentType,
    storage: 'local',
    objectKey,
    bucket: null,
    originalName,
    storedName,
    mimeType,
    sizeBytes,
    sha256,
    uploaderId,
    source,
    previewUrl: attachmentType === 'image' ? url : null,
    url: url || null,
    width: imageMeta.width,
    height: imageMeta.height,
    status: 'available',
    expiresAt: expiresAtIso()
  };
}

module.exports = {
  ingestAgentAssetFromFile,
  safeUnlink
};
