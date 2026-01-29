const fs = require('fs');
const path = require('path');
const { STORAGE } = require('./storageMode');

const LOCAL_DIR = process.env.KB_LOCAL_DIR || path.resolve(__dirname, '../../uploads/kb');
const TMP_DIR = path.resolve(LOCAL_DIR, 'tmp');
const LOCAL_PUBLIC_BASE = (process.env.KB_PUBLIC_BASE || '/static/kb').replace(/\/$/, '');

const MAX_FILES = Number.parseInt(process.env.KB_MAX_FILES || '5', 10);
const MAX_FILE_SIZE = Number.parseInt(process.env.KB_MAX_SIZE || `${50 * 1024 * 1024}`, 10); // 50MB

// docx / md / txt
const ALLOWED_MIMES = (process.env.KB_ALLOWED_MIMES ||
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/msword,' +
  'text/plain,text/markdown,application/octet-stream')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const OSS_PREFIX = process.env.KB_OSS_PREFIX || 'kb/';
const TMP_PREFIX = process.env.KB_TMP_PREFIX || 'kb/tmp/';
const OSS_PUBLIC_BASE = process.env.KB_OSS_BASE_URL || '';
const USE_BACKEND_OSS_PROXY = String(process.env.KB_OSS_USE_PROXY || 'true').toLowerCase() === 'true';

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

// ECS RAM 角色认证（与 faultCaseStorage 保持一致）
const getOssClient = async () => {
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

  const credentialClient = new Credential.default(credentialsConfig);

  let accessKeyId, accessKeySecret, securityToken;
  try {
    const credential = await credentialClient.getCredential();
    accessKeyId = String(credential?.accessKeyId || credential?.AccessKeyId || '');
    accessKeySecret = String(credential?.accessKeySecret || credential?.AccessKeySecret || '');
    const stRaw = credential?.securityToken || credential?.SecurityToken;
    securityToken = stRaw ? String(stRaw) : null;
  } catch (error) {
    throw new Error(`Failed to get credentials from ECS RAM role via getCredential(): ${error.message}. Make sure the ECS instance has a RAM role attached and the role has OSS permissions.`);
  }

  if (!accessKeyId || !accessKeySecret) {
    throw new Error(`Failed to get valid credentials from ECS RAM role. accessKeyId: ${accessKeyId ? `${accessKeyId.substring(0, 8)}...` : 'empty'}, accessKeySecret: ${accessKeySecret ? '***' : 'empty'}`);
  }
  if (!securityToken) {
    throw new Error('Failed to get securityToken from ECS RAM role. STS token is required for temporary credentials.');
  }

  const ossConfig = {
    region: OSS_REGION,
    bucket: OSS_BUCKET,
    accessKeyId,
    accessKeySecret,
    stsToken: securityToken,
    endpoint: OSS_ENDPOINT || undefined,
    internal: OSS_INTERNAL === 'true',
    secure: OSS_SECURE !== 'false'
  };

  // STS token refresh
  ossConfig.refreshSTSTokenInterval = Number.parseInt(process.env.OSS_REFRESH_STS_TOKEN_INTERVAL || `${10 * 60 * 1000}`, 10);
  ossConfig.refreshSTSToken = async () => {
    const c = await credentialClient.getCredential();
    const ak = String(c?.accessKeyId || c?.AccessKeyId || '');
    const sk = String(c?.accessKeySecret || c?.AccessKeySecret || '');
    const stRaw = c?.securityToken || c?.SecurityToken;
    const st = stRaw ? String(stRaw) : null;
    if (!ak || !sk || !st) throw new Error('Failed to refresh STS token: credential is incomplete');
    return { accessKeyId: ak, accessKeySecret: sk, stsToken: st };
  };

  console.log('[OSS][kb] 使用ECS RAM角色认证方式（通过 getCredential() 获取STS Token）');
  if (OSS_RAM_ROLE) console.log(`[OSS][kb] RAM角色名称: ${OSS_RAM_ROLE}`);
  if (credentialsConfig.disableIMDSv1 !== false) console.log('[OSS][kb] 启用加固模式（IMDSv2）');

  ossClient = new OSS(ossConfig);
  return ossClient;
};

const buildOssUrl = (objectKey, putResultUrl) => {
  if (OSS_PUBLIC_BASE) return `${OSS_PUBLIC_BASE.replace(/\/$/, '')}/${objectKey}`;
  if (USE_BACKEND_OSS_PROXY) {
    const key = encodeURIComponent(String(objectKey || '').replace(/^\//, ''));
    return `/api/oss/kb?key=${key}`;
  }
  if (putResultUrl) return putResultUrl;
  return objectKey;
};

const buildOssObjectKey = (filename) => {
  const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '/'); // yyyy/mm/dd
  return `${OSS_PREFIX.replace(/\/?$/, '/')}${datePrefix}/${filename}`;
};

const buildTempOssObjectKey = (filename) => {
  const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
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

