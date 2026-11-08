const test = require('node:test');
const assert = require('node:assert/strict');
const { getAuthConfiguration } = require('./authConfiguration');
const { getAuthConfig } = require('../config/auth');
const { getDingtalkConfig } = require('../config/dingtalk');

test('local login defaults to disabled and DingTalk needs an explicit enterprise id', () => {
  const config = getAuthConfiguration({});
  assert.equal(config.localLoginEnabled, false);
  assert.equal(config.dingtalkEnabled, false);
  assert.equal(config.dingtalkCorpId, null);
  assert.equal(config.accessTokenTtl, '15m');
});

test('authentication configuration reads only explicit deployment values', () => {
  const config = getAuthConfiguration({ AUTH_LOCAL_LOGIN_ENABLED: 'true', DINGTALK_CORP_ID: 'ding-corp', ACCESS_TOKEN_TTL: '10m', REFRESH_TOKEN_TTL: '2d', REFRESH_TOKEN_REMEMBER_TTL: '14d' });
  assert.equal(config.localLoginEnabled, true);
  assert.equal(config.dingtalkEnabled, true);
  assert.equal(config.dingtalkCorpId, 'ding-corp');
  assert.equal(config.accessTokenTtl, '10m');
  assert.equal(config.refreshTokenTtl, '2d');
  assert.equal(config.refreshTokenRememberTtl, '14d');
});

test('auth environment settings are centralized with safe defaults', () => {
  const config = getAuthConfig({
    AUTH_LOCAL_LOGIN_ENABLED: 'true',
    AUTH_LOGIN_LOCK_THRESHOLD: '8',
    AUTH_COOKIE_SAMESITE: 'strict',
    REFRESH_TOKEN_CLEANUP_DISABLED: 'true'
  });

  assert.equal(config.localLoginEnabled, true);
  assert.equal(config.loginLockThreshold, 8);
  assert.equal(config.cookieSameSite, 'strict');
  assert.equal(config.refreshTokenCleanupDisabled, true);
  assert.equal(config.accessTokenTtl, '15m');
});

test('DingTalk legacy web variable names remain readable during deployment migration', () => {
  const config = getDingtalkConfig({
    DINGTALK_APP_ID: 'legacy-web-app',
    DINGTALK_WEB_APP_SECRET: 'legacy-secret',
    DINGTALK_LOGIN_REDIRECT: 'https://logtool.example.com/auth/callback'
  });

  assert.equal(config.webClientId, 'legacy-web-app');
  assert.equal(config.webClientSecret, 'legacy-secret');
  assert.equal(config.webRedirectUri, 'https://logtool.example.com/auth/callback');
});
