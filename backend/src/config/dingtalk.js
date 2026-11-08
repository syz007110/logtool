function getDingtalkConfig(env = process.env) {
  return Object.freeze({
    corpId: String(env.DINGTALK_CORP_ID || '').trim() || null,
    appKey: String(env.DINGTALK_APP_KEY || '').trim() || null,
    appSecret: String(env.DINGTALK_APP_SECRET || '').trim() || null,
    // 旧变量保留为部署迁移期兼容项；新部署只应使用 DINGTALK_WEB_*。
    webClientId: String(env.DINGTALK_WEB_CLIENT_ID || env.DINGTALK_APP_ID || '').trim() || null,
    webClientSecret: String(env.DINGTALK_WEB_CLIENT_SECRET || env.DINGTALK_WEB_APP_SECRET || '').trim() || null,
    webRedirectUri: String(env.DINGTALK_WEB_REDIRECT_URI || env.DINGTALK_LOGIN_REDIRECT || '').trim() || null,
    qrSessionTtlSeconds: Number.parseInt(String(env.DINGTALK_QR_SESSION_TTL_SECONDS || '300'), 10) || 300
  });
}

module.exports = { getDingtalkConfig };
