const fs = require('fs');
const path = require('path');
const { STORAGE } = require('./storageMode');

const LOCAL_DIR = process.env.AGENT_ASSET_LOCAL_DIR || path.resolve(__dirname, '../../uploads/agent-assets');
const TMP_DIR = path.resolve(LOCAL_DIR, 'tmp');
const LOCAL_PUBLIC_BASE = (process.env.AGENT_ASSET_PUBLIC_BASE || '/static/agent-assets').replace(/\/$/, '');

const MAX_FILES = Number.parseInt(process.env.AGENT_ASSET_MAX_FILES || '10', 10);
const MAX_FILE_SIZE = Number.parseInt(process.env.AGENT_ASSET_MAX_SIZE || `${20 * 1024 * 1024}`, 10);
const TMP_TTL_HOURS = Number.parseInt(process.env.TMP_CLEANUP_TTL_HOURS || process.env.AGENT_ASSET_TMP_TTL_HOURS || '24', 10);

const ALLOWED_MIMES = (process.env.AGENT_ASSET_ALLOWED_MIMES ||
  'image/jpeg,image/png,image/gif,image/webp,image/bmp,' +
  'application/pdf,application/zip,application/x-zip-compressed,' +
  'application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,' +
  'application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,' +
  'text/plain,application/octet-stream')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const OSS_PREFIX = process.env.AGENT_ASSET_OSS_PREFIX || 'agent-assets/';
const TMP_PREFIX = process.env.AGENT_ASSET_TMP_PREFIX || 'agent-assets/tmp/';
const OSS_PUBLIC_BASE = process.env.AGENT_ASSET_OSS_BASE_URL || '';
const USE_BACKEND_OSS_PROXY = String(process.env.AGENT_ASSET_OSS_USE_PROXY || process.env.OSS_USE_BACKEND_PROXY || 'true').toLowerCase() === 'true';

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
  const c = await credentialClient.getCredential();
  const accessKeyId = String(c?.accessKeyId || c?.AccessKeyId || '');
  const accessKeySecret = String(c?.accessKeySecret || c?.AccessKeySecret || '');
  const stsToken = c?.securityToken || c?.SecurityToken ? String(c?.securityToken || c?.SecurityToken) : '';
  if (!accessKeyId || !accessKeySecret || !stsToken) {
    throw new Error('Failed to get valid STS credentials for OSS');
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
    const next = await credentialClient.getCredential();
    const ak = String(next?.accessKeyId || next?.AccessKeyId || '');
    const sk = String(next?.accessKeySecret || next?.AccessKeySecret || '');
    const st = next?.securityToken || next?.SecurityToken ? String(next?.securityToken || next?.SecurityToken) : '';
    if (!ak || !sk || !st) throw new Error('Failed to refresh STS token');
    return { accessKeyId: ak, accessKeySecret: sk, stsToken: st };
  };

  ossClient = new OSS(ossConfig);
  return ossClient;
};

const buildOssUrl = (objectKey, putResultUrl) => {
  if (OSS_PUBLIC_BASE) return `${OSS_PUBLIC_BASE.replace(/\/$/, '')}/${objectKey}`;
  if (USE_BACKEND_OSS_PROXY) {
    const key = encodeURIComponent(String(objectKey || '').replace(/^\//, ''));
    return `/api/oss/agent-assets?key=${key}`;
  }
  if (putResultUrl) return putResultUrl;
  return objectKey;
};

const buildOssObjectKey = (filename) => {
  const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
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
  TMP_TTL_HOURS,
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
