const { booleanEnv, getAuthConfig } = require('../config/auth');
const { getDingtalkConfig } = require('../config/dingtalk');

function getAuthConfiguration(env = process.env) {
  const auth = getAuthConfig(env);
  const dingtalk = getDingtalkConfig(env);
  return Object.freeze({
    localLoginEnabled: auth.localLoginEnabled,
    dingtalkCorpId: dingtalk.corpId,
    dingtalkEnabled: Boolean(dingtalk.corpId),
    accessTokenTtl: auth.accessTokenTtl,
    refreshTokenTtl: auth.refreshTokenTtl,
    refreshTokenRememberTtl: auth.refreshTokenRememberTtl
  });
}

module.exports = { getAuthConfiguration, parseBoolean: booleanEnv };
