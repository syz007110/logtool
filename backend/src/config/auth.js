function booleanEnv(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function positiveInteger(value, fallback) {
  const number = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function getAuthConfig(env = process.env) {
  return Object.freeze({
    jwtSecret: String(env.JWT_SECRET || '').trim() || null,
    localLoginEnabled: booleanEnv(env.AUTH_LOCAL_LOGIN_ENABLED, false),
    accessTokenTtl: String(env.ACCESS_TOKEN_TTL || env.JWT_EXPIRES_IN || '15m'),
    refreshTokenTtl: String(env.REFRESH_TOKEN_TTL || '7d'),
    refreshTokenRememberTtl: String(env.REFRESH_TOKEN_REMEMBER_TTL || '30d'),
    refreshCookieName: String(env.REFRESH_COOKIE_NAME || 'rt'),
    csrfCookieName: String(env.CSRF_COOKIE_NAME || 'csrf_token'),
    cookieSecure: booleanEnv(env.AUTH_COOKIE_SECURE, String(env.NODE_ENV || '').toLowerCase() === 'production'),
    cookieSameSite: ['lax', 'strict', 'none'].includes(String(env.AUTH_COOKIE_SAMESITE || 'lax').toLowerCase()) ? String(env.AUTH_COOKIE_SAMESITE || 'lax').toLowerCase() : 'lax',
    loginRateLimitPerMinute: positiveInteger(env.AUTH_LOGIN_RATE_LIMIT_PER_MINUTE, 20),
    loginCaptchaThreshold: positiveInteger(env.AUTH_LOGIN_CAPTCHA_THRESHOLD, 3),
    loginLockThreshold: positiveInteger(env.AUTH_LOGIN_LOCK_THRESHOLD, 5),
    loginLockTtlSeconds: positiveInteger(env.AUTH_LOGIN_LOCK_TTL_SECONDS, 15 * 60),
    refreshTokenCleanupDisabled: booleanEnv(env.REFRESH_TOKEN_CLEANUP_DISABLED, false),
    refreshTokenCleanupIntervalMinutes: positiveInteger(env.REFRESH_TOKEN_CLEANUP_INTERVAL_MIN, 60),
    refreshTokenCleanupStartupDelaySeconds: positiveInteger(env.REFRESH_TOKEN_CLEANUP_STARTUP_DELAY_SEC, 45),
    refreshTokenRevokedRetentionDays: positiveInteger(env.REFRESH_TOKEN_REVOKED_RETENTION_DAYS, 30)
  });
}

module.exports = { booleanEnv, positiveInteger, getAuthConfig };
