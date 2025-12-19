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

// 使用官方推荐方式：通过 await credentialClient.getCredential() 获取完整 STS Token
// 底层实现：Credentials工具自动获取ECS实例绑定的RAM角色，调用ECS元数据服务（Meta Data Server）换取STS Token
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

  // 使用官方推荐的 Config 方式初始化凭证
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

  // 关键：使用 await getCredential() 获取完整的 STS Token（包括 accessKeyId, accessKeySecret, securityToken）
  // 这确保从 ECS 元数据服务获取到有效的临时凭证
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

  // STS Token 是必需的（ECS RAM 角色返回的是临时凭证）
  if (!securityToken) {
    throw new Error('Failed to get securityToken from ECS RAM role. STS token is required for temporary credentials.');
  }

  const ossConfig = {
    region: OSS_REGION,
    bucket: OSS_BUCKET,
    accessKeyId,
    accessKeySecret,
    stsToken: securityToken, // 使用 RAM 角色时，stsToken 是必需的
    endpoint: OSS_ENDPOINT || undefined,
    internal: OSS_INTERNAL === 'true',
    secure: OSS_SECURE !== 'false'
  };

  // STS token 会过期：为 ali-oss 配置 refreshSTSToken，避免运行一段时间后上传/下载出现 403
  // 说明：@alicloud/credentials 会从 ECS 元数据服务获取并可刷新临时凭证，但我们需要把刷新能力交给 ali-oss
  // ali-oss 会按 refreshSTSTokenInterval 触发 refreshSTSToken 来更新 accessKeyId/Secret/stsToken
  ossConfig.refreshSTSTokenInterval = Number.parseInt(process.env.OSS_REFRESH_STS_TOKEN_INTERVAL || `${10 * 60 * 1000}`, 10); // default 10min
  ossConfig.refreshSTSToken = async () => {
    try {
      // 使用 getCredential() 刷新凭证
      const c = await credentialClient.getCredential();
      const ak = String(c?.accessKeyId || c?.AccessKeyId || '');
      const sk = String(c?.accessKeySecret || c?.AccessKeySecret || '');
      const stRaw = c?.securityToken || c?.SecurityToken;
      const st = stRaw ? String(stRaw) : null;
      
      if (!ak || !sk || !st) {
        throw new Error('Failed to refresh STS token: credential is incomplete');
      }
      
      return { accessKeyId: ak, accessKeySecret: sk, stsToken: st };
    } catch (e) {
      // refresh 失败时让 ali-oss 抛错，便于定位 IMDS/RAM role 问题
      throw e;
    }
  };

  console.log('[OSS] 使用ECS RAM角色认证方式（通过 getCredential() 获取STS Token）');
  if (OSS_RAM_ROLE) {
    console.log(`[OSS] RAM角色名称: ${OSS_RAM_ROLE}`);
  } else {
    console.log('[OSS] 自动检测ECS实例关联的RAM角色');
  }
  if (credentialsConfig.disableIMDSv1 !== false) {
    console.log('[OSS] 启用加固模式（IMDSv2）');
  }

  ossClient = new OSS(ossConfig);
  return ossClient;
};

const buildOssUrl = (objectKey, putResultUrl) => {
  if (OSS_PUBLIC_BASE) return `${OSS_PUBLIC_BASE.replace(/\/$/, '')}/${objectKey}`;
  // 没有配置公网基础URL时，不要返回 putResultUrl（可能是 *-internal 内网域名，浏览器无法访问）
  // 统一走后端代理：浏览器 -> Nginx(/api) -> 后端 -> OSS(内网/STS)
  const key = encodeURIComponent(String(objectKey || '').replace(/^\//, ''));
  return `/api/oss/fault-cases?key=${key}`;
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


