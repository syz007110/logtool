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
let ossClientPromise = null;

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

const getOssClient = async () => {
  if (STORAGE !== 'oss') return null;
  if (ossClient) return ossClient;
  if (ossClientPromise) return ossClientPromise;
  // 按需加载，避免未配置时报错
  // eslint-disable-next-line global-require
  const OSS = require('ali-oss');
  
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

  // 使用ECS RAM角色认证（仅支持此方式）
  // eslint-disable-next-line global-require
  const Credential = require('@alicloud/credentials');
  
  // 使用官方推荐的 Config 方式初始化凭证（可避免部分版本下类型不一致问题）
  const credentialsConfig = (typeof Credential.Config === 'function')
    ? new Credential.Config({
      type: 'ecs_ram_role',
      // 如果设置了角色名称，使用指定的角色；否则自动获取
      roleName: OSS_RAM_ROLE || undefined,
      // 是否禁用IMDSv1（加固模式）
      // true：强制使用加固模式（IMDSv2）
      // false：系统将首先尝试在加固模式下获取凭据，如果失败则切换到普通模式（IMDSv1）
      disableIMDSv1: OSS_DISABLE_IMDSV1 !== 'false' // 默认true（启用加固模式）
    })
    : {
      type: 'ecs_ram_role',
      roleName: OSS_RAM_ROLE || undefined,
      disableIMDSv1: OSS_DISABLE_IMDSV1 !== 'false'
    };

  ossClientPromise = (async () => {
    const credentialClient = new Credential.default(credentialsConfig);

    // 官方推荐：await getCredential() 取出临时凭证
    if (typeof credentialClient.getCredential !== 'function') {
      throw new Error('credentials client does not support getCredential()');
    }

    // 官方推荐：await getCredential() 获取完整的 STS Token
    // 底层实现：Credentials工具自动获取ECS实例绑定的RAM角色，调用ECS元数据服务（Meta Data Server）换取STS Token
    const c = await credentialClient.getCredential();
    const accessKeyId = String(c?.accessKeyId || c?.AccessKeyId || '');
    const accessKeySecret = String(c?.accessKeySecret || c?.AccessKeySecret || '');
    const securityToken = c?.securityToken || c?.SecurityToken || null;
    const stsToken = securityToken ? String(securityToken) : null;
    
    if (!accessKeyId || !accessKeySecret) {
      throw new Error(`Failed to get valid credentials from ECS RAM role. accessKeyId: ${accessKeyId ? `${accessKeyId.substring(0, 8)}...` : 'empty'}, accessKeySecret: ${accessKeySecret ? '***' : 'empty'}`);
    }
    
    // STS Token 是必需的（ECS RAM 角色返回的是临时凭证）
    if (!stsToken) {
      throw new Error('Failed to get securityToken from ECS RAM role. STS token is required for temporary credentials.');
    }
    
    // 配置OSS客户端
    const ossConfig = {
      region: OSS_REGION,
      bucket: OSS_BUCKET,
      accessKeyId,
      accessKeySecret,
      stsToken: stsToken, // 使用 RAM 角色时，stsToken 是必需的
      endpoint: OSS_ENDPOINT || undefined,
      internal: OSS_INTERNAL === 'true',
      secure: OSS_SECURE !== 'false'
    };

    // STS token 会过期：为 ali-oss 配置 refreshSTSToken，避免运行一段时间后上传/下载出现 403
    ossConfig.refreshSTSTokenInterval = Number.parseInt(process.env.OSS_REFRESH_STS_TOKEN_INTERVAL || `${10 * 60 * 1000}`, 10); // default 10min
    ossConfig.refreshSTSToken = async () => {
      const cc = await credentialClient.getCredential();
      return {
        accessKeyId: String(cc?.accessKeyId || cc?.AccessKeyId || ''),
        accessKeySecret: String(cc?.accessKeySecret || cc?.AccessKeySecret || ''),
        stsToken: cc?.securityToken || cc?.SecurityToken ? String(cc?.securityToken || cc?.SecurityToken) : null
      };
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
  })()
    .finally(() => {
      // 如果初始化失败，允许下次重试
      if (!ossClient) ossClientPromise = null;
    });

  return ossClientPromise;
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

