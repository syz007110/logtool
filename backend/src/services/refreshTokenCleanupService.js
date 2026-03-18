const { Op } = require('sequelize');
const RefreshToken = require('../models/refresh_token');
const { ensureRefreshTokenTable } = require('./authSessionService');

function parseIntOr(val, fallback) {
  const n = Number.parseInt(String(val ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function boolEnvTrue(name) {
  return String(process.env[name] || '').toLowerCase() === 'true';
}

async function cleanupRefreshTokens({ log }) {
  await ensureRefreshTokenTable();

  const now = new Date();
  const revokedRetentionDays = Math.max(1, parseIntOr(process.env.REFRESH_TOKEN_REVOKED_RETENTION_DAYS, 30));
  const revokedCutoff = new Date(Date.now() - revokedRetentionDays * 24 * 60 * 60 * 1000);

  const expiredDeleted = await RefreshToken.destroy({
    where: {
      expires_at: { [Op.lt]: now }
    }
  });

  const revokedDeleted = await RefreshToken.destroy({
    where: {
      revoked_at: {
        [Op.not]: null,
        [Op.lt]: revokedCutoff
      }
    }
  });

  if ((expiredDeleted + revokedDeleted) > 0) {
    log(`[refresh-token-cleaner] deleted: expired=${expiredDeleted}, revoked=${revokedDeleted}`);
  }
}

function startRefreshTokenCleanupJob() {
  if (boolEnvTrue('REFRESH_TOKEN_CLEANUP_DISABLED')) {
    return { stop: () => {}, runOnce: () => Promise.resolve() };
  }

  const intervalMin = Math.max(1, parseIntOr(process.env.REFRESH_TOKEN_CLEANUP_INTERVAL_MIN, 60));
  const startupDelaySec = Math.max(1, parseIntOr(process.env.REFRESH_TOKEN_CLEANUP_STARTUP_DELAY_SEC, 45));
  const intervalMs = intervalMin * 60 * 1000;
  const startupDelayMs = startupDelaySec * 1000;

  let running = false;
  const log = (msg) => console.log(msg);

  const runOnce = async () => {
    if (running) return;
    running = true;
    try {
      await cleanupRefreshTokens({ log });
    } catch (e) {
      log(`[refresh-token-cleaner] cleanup failed: ${e.message || e}`);
    } finally {
      running = false;
    }
  };

  const bootTimer = setTimeout(() => {
    runOnce();
  }, startupDelayMs);

  const timer = setInterval(() => {
    runOnce();
  }, intervalMs);
  timer.unref?.();

  log(`[refresh-token-cleaner] started: intervalMin=${intervalMin}, revokedRetentionDays=${Math.max(1, parseIntOr(process.env.REFRESH_TOKEN_REVOKED_RETENTION_DAYS, 30))}`);

  return {
    stop: () => {
      clearTimeout(bootTimer);
      clearInterval(timer);
    },
    runOnce
  };
}

module.exports = {
  startRefreshTokenCleanupJob
};
