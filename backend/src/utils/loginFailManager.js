const { cacheManager } = require('../config/cache');

const PREFIX = 'login_fail:';
const LOCK_TTL = 900; // 15 分钟（秒）
const LOCK_THRESHOLD = 5;
const CAPTCHA_THRESHOLD = 3;

function key(username) {
  return PREFIX + String(username || '').trim().toLowerCase();
}

/** 是否可用（Redis 已连接且启用） */
function available() {
  return cacheManager.isConnected && cacheManager.cacheConfig?.enabled;
}

/**
 * 获取失败信息
 * @param {string} username
 * @returns {Promise<{ count: number, locked: boolean } | null>} null 表示未启用/无记录
 */
async function getFail(username) {
  if (!available()) return null;
  try {
    const k = key(username);
    const v = await cacheManager.get(k);
    if (!v || typeof v.count !== 'number') return null;
    const count = Math.max(0, Math.floor(v.count));
    return { count, locked: count >= LOCK_THRESHOLD };
  } catch (e) {
    console.warn('[loginFailManager] getFail error:', e?.message);
    return null;
  }
}

/**
 * 记录一次失败，并更新计数与 TTL
 * @param {string} username
 */
async function recordFail(username) {
  if (!available()) return;
  try {
    const k = key(username);
    const v = await cacheManager.get(k);
    const count = (v && typeof v.count === 'number' ? Math.max(0, Math.floor(v.count)) : 0) + 1;
    await cacheManager.set(k, { count }, LOCK_TTL);
  } catch (e) {
    console.warn('[loginFailManager] recordFail error:', e?.message);
  }
}

/**
 * 清除失败记录（登录成功时调用）
 * @param {string} username
 */
async function clearFail(username) {
  if (!available()) return;
  try {
    await cacheManager.del(key(username));
  } catch (e) {
    console.warn('[loginFailManager] clearFail error:', e?.message);
  }
}

module.exports = {
  LOCK_TTL,
  LOCK_THRESHOLD,
  CAPTCHA_THRESHOLD,
  available,
  getFail,
  recordFail,
  clearFail
};
