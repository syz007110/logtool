const fs = require('fs');
const path = require('path');
const { STORAGE } = require('./storageMode');

const LOCAL_DIR = process.env.MOTION_DATA_LOCAL_DIR || path.resolve(__dirname, '../../uploads/motion-data');
const LOCAL_PUBLIC_BASE = (process.env.MOTION_DATA_PUBLIC_BASE || '/static/motion-data').replace(/\/$/, '');

const OSS_PREFIX = (process.env.MOTION_DATA_OSS_PREFIX || 'motion-data/').replace(/^\//, '');
const OSS_PUBLIC_BASE = process.env.MOTION_DATA_OSS_BASE_URL || '';
const USE_BACKEND_OSS_PROXY = String(process.env.MOTION_DATA_OSS_USE_PROXY || process.env.OSS_USE_BACKEND_PROXY || 'true')
  .toLowerCase() === 'true';

let ossClient = null;
let ossClientPromise = null;

const ensureLocalDir = () => {
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
  return LOCAL_DIR;
};

const buildLocalUrl = (filename) => `${LOCAL_PUBLIC_BASE}/${filename}`;

function safePathSegment(input) {
  const s = String(input || '').trim();
  // Replace path separators and suspicious characters
  return s.replace(/[\\\/\0]/g, '_').replace(/\.\./g, '_').slice(0, 100) || 'unknown';
}

function safeFilename(name, fallback = 'file.bin') {
  const base = path.basename(String(name || '').trim() || fallback);
  return base.replace(/[\r\n"]/g, '_');
}

// ECS RAM 角色认证（与其他 OSS 模块一致）
const getOssClient = async () => {
  if (STORAGE !== 'oss') return null;
  if (ossClient) return ossClient;
  if (ossClientPromise) return ossClientPromise;

  // eslint-disable-next-line global-require
  const OSS = require('ali-oss');
  // eslint-disable-next-line global-require
  const Credential = require('@alicloud/credentials');

  const {
    OSS_REGION,
    OSS_BUCKET,
    OSS_ENDPOINT,
    OSS_INTERNAL,
    OSS_SECURE,
    OSS_RAM_ROLE,
    OSS_DISABLE_IMDSV1
  } = process.env;

  if (!OSS_REGION || !OSS_BUCKET) {
    throw new Error('OSS storage selected but OSS_REGION or OSS_BUCKET is missing');
  }

  const credentialsConfig = (typeof Credential.Config === 'function')
    ? new Credential.Config({
      type: 'ecs_ram_role',
      roleName: OSS_RAM_ROLE || undefined,
      disableIMDSv1: OSS_DISABLE_IMDSV1 !== 'false'
    })
    : {
      type: 'ecs_ram_role',
      roleName: OSS_RAM_ROLE || undefined,
      disableIMDSv1: OSS_DISABLE_IMDSV1 !== 'false'
    };

  ossClientPromise = (async () => {
    const credentialClient = new Credential.default(credentialsConfig);
    const c = await credentialClient.getCredential();
    const accessKeyId = String(c?.accessKeyId || c?.AccessKeyId || '');
    const accessKeySecret = String(c?.accessKeySecret || c?.AccessKeySecret || '');
    const stRaw = c?.securityToken || c?.SecurityToken;
    const stsToken = stRaw ? String(stRaw) : null;

    if (!accessKeyId || !accessKeySecret) {
      throw new Error('Failed to get valid credentials from ECS RAM role (missing accessKeyId/accessKeySecret)');
    }
    if (!stsToken) {
      throw new Error('Failed to get securityToken from ECS RAM role. STS token is required.');
    }

    const ossConfig = {
      region: OSS_REGION,
      bucket: OSS_BUCKET,
      accessKeyId,
      accessKeySecret,
      stsToken,
      endpoint: OSS_ENDPOINT || undefined,
      internal: OSS_INTERNAL === 'true',
      secure: OSS_SECURE !== 'false'
    };

    ossConfig.refreshSTSTokenInterval = Number.parseInt(process.env.OSS_REFRESH_STS_TOKEN_INTERVAL || `${10 * 60 * 1000}`, 10);
    ossConfig.refreshSTSToken = async () => {
      const cc = await credentialClient.getCredential();
      const ak = String(cc?.accessKeyId || cc?.AccessKeyId || '');
      const sk = String(cc?.accessKeySecret || cc?.AccessKeySecret || '');
      const st2Raw = cc?.securityToken || cc?.SecurityToken;
      const st2 = st2Raw ? String(st2Raw) : null;
      if (!ak || !sk || !st2) throw new Error('Failed to refresh STS token: credential is incomplete');
      return { accessKeyId: ak, accessKeySecret: sk, stsToken: st2 };
    };

    console.log('[OSS][motion-data] 使用ECS RAM角色认证方式（通过 getCredential() 获取STS Token）');
    ossClient = new OSS(ossConfig);
    return ossClient;
  })().finally(() => {
    if (!ossClient) ossClientPromise = null;
  });

  return ossClientPromise;
};

const buildOssUrl = (objectKey, putResultUrl) => {
  if (OSS_PUBLIC_BASE) return `${OSS_PUBLIC_BASE.replace(/\/$/, '')}/${String(objectKey || '').replace(/^\//, '')}`;
  if (USE_BACKEND_OSS_PROXY) {
    const key = encodeURIComponent(String(objectKey || '').replace(/^\//, ''));
    return `/api/oss/motion-data?key=${key}`;
  }
  if (putResultUrl) return putResultUrl;
  return objectKey;
};

function buildRawObjectKey(deviceId, originalName) {
  const dev = safePathSegment(deviceId);
  const file = safeFilename(originalName, 'motion.bin');
  return `${OSS_PREFIX.replace(/\/?$/, '/')}${dev}/raw/${file}`;
}

function buildParsedObjectKey(deviceId, originalName) {
  const dev = safePathSegment(deviceId);
  const file = safeFilename(originalName, 'motion.bin');
  const base = file.replace(/\.bin$/i, '');
  return `${OSS_PREFIX.replace(/\/?$/, '/')}${dev}/parsed/${base}.jsonl.gz`;
}

// 本地存储：构建文件路径（raw）
function buildRawLocalPath(deviceId, originalName) {
  ensureLocalDir();
  const dev = safePathSegment(deviceId);
  const file = safeFilename(originalName, 'motion.bin');
  const devDir = path.join(LOCAL_DIR, dev, 'raw');
  fs.mkdirSync(devDir, { recursive: true });
  return path.join(devDir, file);
}

// 本地存储：构建文件路径（parsed）
function buildParsedLocalPath(deviceId, originalName) {
  ensureLocalDir();
  const dev = safePathSegment(deviceId);
  const file = safeFilename(originalName, 'motion.bin');
  const base = file.replace(/\.bin$/i, '');
  const devDir = path.join(LOCAL_DIR, dev, 'parsed');
  fs.mkdirSync(devDir, { recursive: true });
  return path.join(devDir, `${base}.jsonl.gz`);
}

// 本地存储：构建 URL（raw）
function buildRawLocalUrl(deviceId, originalName) {
  const dev = safePathSegment(deviceId);
  const file = safeFilename(originalName, 'motion.bin');
  return `${LOCAL_PUBLIC_BASE}/${dev}/raw/${file}`;
}

// 本地存储：构建 URL（parsed）
function buildParsedLocalUrl(deviceId, originalName) {
  const dev = safePathSegment(deviceId);
  const file = safeFilename(originalName, 'motion.bin');
  const base = file.replace(/\.bin$/i, '');
  return `${LOCAL_PUBLIC_BASE}/${dev}/parsed/${base}.jsonl.gz`;
}

// 本地存储：保存文件
function saveLocalFile(sourcePath, targetPath) {
  ensureLocalDir();
  const targetDir = path.dirname(targetPath);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  return targetPath;
}

// 本地存储：删除文件
function deleteLocalFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (err) {
    console.error(`[motion-data][local] 删除文件失败: ${filePath}`, err);
    return false;
  }
}

// 本地存储：读取文件流（用于下载）
function getLocalFileStream(filePath) {
  if (!fs.existsSync(filePath)) {
    const error = new Error('File not found');
    error.status = 404;
    throw error;
  }
  return fs.createReadStream(filePath);
}

module.exports = {
  STORAGE,
  LOCAL_DIR,
  LOCAL_PUBLIC_BASE,
  OSS_PREFIX,
  OSS_PUBLIC_BASE,
  USE_BACKEND_OSS_PROXY,
  ensureLocalDir,
  buildLocalUrl,
  getOssClient,
  buildOssUrl,
  buildRawObjectKey,
  buildParsedObjectKey,
  // 本地存储相关
  buildRawLocalPath,
  buildParsedLocalPath,
  buildRawLocalUrl,
  buildParsedLocalUrl,
  saveLocalFile,
  deleteLocalFile,
  getLocalFileStream
};

