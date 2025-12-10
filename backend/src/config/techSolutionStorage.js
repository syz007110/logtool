const fs = require('fs');
const path = require('path');

const STORAGE = (process.env.TECH_SOLUTION_STORAGE || 'local').toLowerCase();
const LOCAL_DIR = process.env.TECH_SOLUTION_LOCAL_DIR || path.resolve(__dirname, '../../uploads/tech-solution');
const TMP_DIR = path.resolve(LOCAL_DIR, 'tmp');
const LOCAL_PUBLIC_BASE = (process.env.TECH_SOLUTION_PUBLIC_BASE || '/static/tech-solution').replace(/\/$/, '');
const MAX_IMAGES = Number.parseInt(process.env.TECH_SOLUTION_MAX_IMAGES || '5', 10);
const MAX_IMAGE_SIZE = Number.parseInt(process.env.TECH_SOLUTION_MAX_SIZE || `${20 * 1024 * 1024}`, 10); // 默认20MB
const ALLOWED_MIMES = (process.env.TECH_SOLUTION_ALLOWED_MIMES ||
  'image/jpeg,image/png,image/gif,image/webp,image/bmp,' +
  'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/zip,application/x-zip-compressed,application/octet-stream,text/plain')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const OSS_PREFIX = process.env.TECH_SOLUTION_OSS_PREFIX || 'tech-solution/';
const TMP_PREFIX = process.env.TECH_SOLUTION_TMP_PREFIX || 'tech-solution/tmp/';
const OSS_PUBLIC_BASE = process.env.TECH_SOLUTION_OSS_BASE_URL || '';

let ossClient = null;

const ensureLocalDir = () => {
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
  return LOCAL_DIR;
};

const ensureTempDir = () => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  return TMP_DIR;
};

const buildLocalUrl = (filename) => `${LOCAL_PUBLIC_BASE}/${filename}`;
const buildTempLocalUrl = (filename) => `${LOCAL_PUBLIC_BASE}/tmp/${filename}`;

const getOssClient = () => {
  if (STORAGE !== 'oss') return null;
  if (ossClient) return ossClient;
  // 按需加载，避免未配置时报错
  // eslint-disable-next-line global-require
  const OSS = require('ali-oss');
  const {
    OSS_REGION,
    OSS_ACCESS_KEY_ID,
    OSS_ACCESS_KEY_SECRET,
    OSS_BUCKET,
    OSS_ENDPOINT,
    OSS_INTERNAL,
    OSS_SECURE
  } = process.env;
  if (!OSS_REGION || !OSS_ACCESS_KEY_ID || !OSS_ACCESS_KEY_SECRET || !OSS_BUCKET) {
    throw new Error('OSS storage selected but OSS credentials are missing');
  }
  ossClient = new OSS({
    region: OSS_REGION,
    accessKeyId: OSS_ACCESS_KEY_ID,
    accessKeySecret: OSS_ACCESS_KEY_SECRET,
    bucket: OSS_BUCKET,
    endpoint: OSS_ENDPOINT || undefined,
    internal: OSS_INTERNAL === 'true',
    secure: OSS_SECURE !== 'false'
  });
  return ossClient;
};

const buildOssUrl = (objectKey, putResultUrl) => {
  if (OSS_PUBLIC_BASE) {
    return `${OSS_PUBLIC_BASE.replace(/\/$/, '')}/${objectKey}`;
  }
  if (putResultUrl) return putResultUrl;
  return objectKey;
};

const buildOssObjectKey = (filename) => {
  const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '/'); // yyyy/mm/dd
  return `${OSS_PREFIX.replace(/\/?$/, '/')}${datePrefix}/${filename}`;
};

const buildTempOssObjectKey = (filename) => {
  const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '/'); // yyyy/mm/dd
  return `${TMP_PREFIX.replace(/\/?$/, '/')}${datePrefix}/${filename}`;
};

module.exports = {
  STORAGE,
  LOCAL_DIR,
  TMP_DIR,
  LOCAL_PUBLIC_BASE,
  MAX_IMAGES,
  MAX_IMAGE_SIZE,
  ALLOWED_MIMES,
  OSS_PREFIX,
  TMP_PREFIX,
  OSS_PUBLIC_BASE,
  ensureLocalDir,
  ensureTempDir,
  buildLocalUrl,
  buildTempLocalUrl,
  getOssClient,
  buildOssUrl,
  buildOssObjectKey,
  buildTempOssObjectKey
};

