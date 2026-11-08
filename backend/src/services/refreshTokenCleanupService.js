const { Op } = require('sequelize');
const RefreshToken = require('../models/refresh_token');
const { getAuthConfig } = require('../config/auth');

async function cleanupRefreshTokens({ log }) {
  const authConfig = getAuthConfig();
  const now = new Date();
  const revokedRetentionDays = authConfig.refreshTokenRevokedRetentionDays;
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
  const authConfig = getAuthConfig();
  if (authConfig.refreshTokenCleanupDisabled) {
    return { stop: () => {}, runOnce: () => Promise.resolve() };
  }

  const intervalMin = authConfig.refreshTokenCleanupIntervalMinutes;
  const startupDelaySec = authConfig.refreshTokenCleanupStartupDelaySeconds;
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

  log(`[refresh-token-cleaner] started: intervalMin=${intervalMin}, revokedRetentionDays=${authConfig.refreshTokenRevokedRetentionDays}`);

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
