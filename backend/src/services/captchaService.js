const crypto = require('crypto');
const svgCaptcha = require('svg-captcha');
const { cacheManager } = require('../config/cache');
const { AuthError } = require('./authErrors');

const PREFIX = 'auth:captcha:';
const TTL_SECONDS = 300;

function assertAvailable() {
  if (!cacheManager.isConnected || !cacheManager.cacheConfig?.enabled || !cacheManager.client) throw new AuthError('AUTH_GUARD_UNAVAILABLE', 503, '登录保护服务暂不可用');
}
async function createCaptcha() {
  assertAvailable();
  const captcha = svgCaptcha.create({ size: 4, ignoreChars: '0oO1ilI' });
  const captchaId = crypto.randomBytes(16).toString('hex');
  await cacheManager.client.setEx(`${PREFIX}${captchaId}`, TTL_SECONDS, captcha.text.toLowerCase());
  return { captchaId, svg: captcha.data };
}
async function verifyCaptcha(captchaId, captchaCode) {
  assertAvailable();
  if (!captchaId || !captchaCode) return false;
  const key = `${PREFIX}${String(captchaId)}`;
  const expected = await cacheManager.client.get(key);
  await cacheManager.client.del(key);
  return Boolean(expected) && String(expected).toLowerCase() === String(captchaCode).trim().toLowerCase();
}

module.exports = { createCaptcha, verifyCaptcha };
