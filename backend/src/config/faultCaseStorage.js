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

  // 使用官方推荐的 Config 方式初始化凭证（可避免部分版本下类型不一致问题）
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

  const cred = new Credential.default(credentialsConfig);
  // ali-oss 内部会对 accessKeyId/accessKeySecret 调用 .trim()，这里强制转成字符串避免 opts.accessKeyId.trim is not a function
  const accessKeyId = String(cred.getAccessKeyId() || '');
  const accessKeySecret = String(cred.getAccessKeySecret() || '');
  const securityToken = cred.getSecurityToken() ? String(cred.getSecurityToken()) : null;

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

  // STS token 会过期：为 ali-oss 配置 refreshSTSToken，避免运行一段时间后上传/下载出现 403
  // 说明：@alicloud/credentials 会从 ECS 元数据服务获取并可刷新临时凭证，但我们需要把刷新能力交给 ali-oss
  // ali-oss 会按 refreshSTSTokenInterval 触发 refreshSTSToken 来更新 accessKeyId/Secret/stsToken
  ossConfig.refreshSTSTokenInterval = Number.parseInt(process.env.OSS_REFRESH_STS_TOKEN_INTERVAL || `${10 * 60 * 1000}`, 10); // default 10min
  ossConfig.refreshSTSToken = async () => {
    try {
      // @alicloud/credentials 版本差异：优先使用 getCredential()（如果存在）
      if (typeof cred.getCredential === 'function') {
        const c = await cred.getCredential();
        const ak = String(c?.accessKeyId || c?.AccessKeyId || cred.getAccessKeyId() || '');
        const sk = String(c?.accessKeySecret || c?.AccessKeySecret || cred.getAccessKeySecret() || '');
        const stRaw = c?.securityToken || c?.SecurityToken || cred.getSecurityToken();
        const st = stRaw ? String(stRaw) : null;
        return { accessKeyId: ak, accessKeySecret: sk, stsToken: st };
      }
      // fallback：直接读取当前内存中的临时凭证
      return {
        accessKeyId: String(cred.getAccessKeyId() || ''),
        accessKeySecret: String(cred.getAccessKeySecret() || ''),
        stsToken: cred.getSecurityToken() ? String(cred.getSecurityToken()) : null
      };
    } catch (e) {
      // refresh 失败时让 ali-oss 抛错，便于定位 IMDS/RAM role 问题
      throw e;
    }
  };

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


