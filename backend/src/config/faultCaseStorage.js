const fs = require('fs');
const path = require('path');

// Storage mode: local | oss
// 复用排查方案的存储模式配置（如果未单独设置 FAULT_CASE_STORAGE）
const STORAGE = (process.env.FAULT_CASE_STORAGE || process.env.TECH_SOLUTION_STORAGE || 'local').toLowerCase();
const LOCAL_DIR = process.env.FAULT_CASE_LOCAL_DIR || path.resolve(__dirname, '../../uploads/fault-cases');
const TMP_DIR = path.resolve(LOCAL_DIR, 'tmp');
const LOCAL_PUBLIC_BASE = (process.env.FAULT_CASE_PUBLIC_BASE || '/static/fault-cases').replace(/\/$/, '');

const MAX_FILES = Number.parseInt(process.env.FAULT_CASE_MAX_FILES || '10', 10);
const MAX_FILE_SIZE = Number.parseInt(process.env.FAULT_CASE_MAX_SIZE || `${50 * 1024 * 1024}`, 10); // 50MB default

const ALLOWED_MIMES = (process.env.FAULT_CASE_ALLOWED_MIMES ||
  'image/jpeg,image/png,image/gif,image/webp,image/bmp,' +
  'application/pdf,application/zip,application/x-zip-compressed,' +
  'application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'text/plain,application/octet-stream')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const OSS_PREFIX = process.env.FAULT_CASE_OSS_PREFIX || 'fault-cases/';
const TMP_PREFIX = process.env.FAULT_CASE_TMP_PREFIX || 'fault-cases/tmp/';
const OSS_PUBLIC_BASE = process.env.FAULT_CASE_OSS_BASE_URL || '';

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

  const credentialsConfig = {
    type: 'ecs_ram_role',
    roleName: OSS_RAM_ROLE || undefined,
    disableIMDSv1: OSS_DISABLE_IMDSV1 !== 'false'
  };

  const cred = new Credential.default(credentialsConfig);
  const accessKeyId = cred.getAccessKeyId();
  const accessKeySecret = cred.getAccessKeySecret();
  const securityToken = cred.getSecurityToken();

  if (!accessKeyId || !accessKeySecret) {
    throw new Error('Failed to get credentials from ECS RAM role');
  }

  const ossConfig = {
    region: OSS_REGION,
    bucket: OSS_BUCKET,
    accessKeyId,
    accessKeySecret,
    endpoint: OSS_ENDPOINT || undefined,
    internal: OSS_INTERNAL === 'true',
    secure: OSS_SECURE !== 'false'
  };
  if (securityToken) ossConfig.stsToken = securityToken;

  ossClient = new OSS(ossConfig);
  return ossClient;
};

const buildOssUrl = (objectKey, putResultUrl) => {
  if (OSS_PUBLIC_BASE) return `${OSS_PUBLIC_BASE.replace(/\/$/, '')}/${objectKey}`;
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
  MAX_FILES,
  MAX_FILE_SIZE,
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


