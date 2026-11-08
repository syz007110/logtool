const crypto = require('crypto');
const { cacheManager } = require('../config/cache');
const { AuthError } = require('./authErrors');
const { getAuthConfig } = require('../config/auth');

const authConfig = getAuthConfig();
const CAPTCHA_THRESHOLD = authConfig.loginCaptchaThreshold;
const LOCK_THRESHOLD = authConfig.loginLockThreshold;
const LOCK_TTL_SECONDS = authConfig.loginLockTtlSeconds;
const RATE_LIMIT_PER_MINUTE = authConfig.loginRateLimitPerMinute;

function normalizedUsername(username) {
  return String(username || '').normalize('NFKC').trim().toLocaleLowerCase('en-US');
}
function hashed(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function assertAvailable() {
  if (!cacheManager.isConnected || !cacheManager.cacheConfig?.enabled || !cacheManager.client) {
    throw new AuthError('AUTH_GUARD_UNAVAILABLE', 503, '登录保护服务暂不可用');
  }
}
function failureKey(username) { return `auth:local-login:fail:${hashed(normalizedUsername(username))}`; }
function ipKey(ip) { return `auth:local-login:ip:${hashed(ip || '')}:${Math.floor(Date.now() / 60000)}`; }

async function getFailure(username) {
  assertAvailable();
  const raw = await cacheManager.client.get(failureKey(username));
  const count = Number(raw || 0);
  const ttl = count >= LOCK_THRESHOLD ? Math.max(0, await cacheManager.client.ttl(failureKey(username))) : 0;
  return { count: Number.isFinite(count) ? count : 0, locked: count >= LOCK_THRESHOLD, retryAfter: ttl };
}
async function assertCanAttempt({ username, ip }) {
  assertAvailable();
  const client = cacheManager.client;
  const key = ipKey(ip);
  const count = await client.incr(key);
  if (count === 1) await client.expire(key, 120);
  if (count > RATE_LIMIT_PER_MINUTE) throw new AuthError('LOCAL_LOGIN_RATE_LIMITED', 429, '请求过于频繁');
  const failure = await getFailure(username);
  if (failure.locked) throw new AuthError('LOGIN_LOCKED', 423, '登录尝试次数过多，请稍后再试', { retryAfter: failure.retryAfter || LOCK_TTL_SECONDS });
  return { captchaRequired: failure.count >= CAPTCHA_THRESHOLD, failure };
}
async function recordFailure(username) {
  assertAvailable();
  const key = failureKey(username);
  const count = await cacheManager.client.incr(key);
  if (count === 1) await cacheManager.client.expire(key, LOCK_TTL_SECONDS);
  const retryAfter = count >= LOCK_THRESHOLD ? Math.max(0, await cacheManager.client.ttl(key)) : 0;
  return { count, locked: count >= LOCK_THRESHOLD, retryAfter };
}
async function clearFailures(username) { assertAvailable(); await cacheManager.client.del(failureKey(username)); }

module.exports = { CAPTCHA_THRESHOLD, LOCK_THRESHOLD, LOCK_TTL_SECONDS, RATE_LIMIT_PER_MINUTE, normalizedUsername, assertCanAttempt, recordFailure, clearFailures };
