const { cacheManager } = require('../config/cache');

const REFRESH_TOKEN_REUSE_TTL_SECONDS = 5 * 60;

function keyForRefreshTokenReuse(userId) {
  return `auth:security-event:refresh-token-reuse:${Number(userId)}`;
}

// A cache outage must not suppress a security audit, so failures return true.
async function shouldRecordRefreshTokenReuse(userId, { cache = cacheManager } = {}) {
  if (!Number.isInteger(Number(userId)) || Number(userId) <= 0) return true;
  if (!cache?.isConnected || !cache?.cacheConfig?.enabled || !cache?.client) return true;
  try {
    const result = await cache.client.set(keyForRefreshTokenReuse(userId), '1', { NX: true, EX: REFRESH_TOKEN_REUSE_TTL_SECONDS });
    return result === 'OK';
  } catch (_) {
    return true;
  }
}

module.exports = { REFRESH_TOKEN_REUSE_TTL_SECONDS, keyForRefreshTokenReuse, shouldRecordRefreshTokenReuse };
