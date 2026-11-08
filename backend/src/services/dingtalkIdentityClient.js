const https = require('https');
const { URL } = require('url');
const { AuthError } = require('./authErrors');
const { getDingtalkConfig } = require('../config/dingtalk');

const DINGTALK_HOSTS = new Set(['oapi.dingtalk.com']);
const REQUEST_TIMEOUT_MS = 8000;

function requestJson(urlString, { method = 'GET', body } = {}) {
  const url = new URL(urlString);
  if (url.protocol !== 'https:' || !DINGTALK_HOSTS.has(url.hostname)) throw new AuthError('DINGTALK_AUTH_FAILED', 400, '钉钉登录失败');
  const payload = body == null ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, timeout: REQUEST_TIMEOUT_MS, headers: payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : undefined }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (part) => { text += part; });
      res.on('end', () => {
        try {
          if (res.statusCode < 200 || res.statusCode >= 300) throw new Error('unexpected status');
          resolve(JSON.parse(text));
        } catch (_) { reject(new AuthError('DINGTALK_AUTH_FAILED', 400, '钉钉登录失败')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => reject(new AuthError('DINGTALK_AUTH_FAILED', 400, '钉钉登录失败')));
    if (payload) req.write(payload);
    req.end();
  });
}

async function getInternalAccessToken({ appKey, appSecret }) {
  if (!appKey || !appSecret) throw new AuthError('DINGTALK_AUTH_FAILED', 400, '钉钉登录未配置');
  const url = `https://oapi.dingtalk.com/gettoken?appkey=${encodeURIComponent(appKey)}&appsecret=${encodeURIComponent(appSecret)}`;
  const response = await requestJson(url);
  if (response.errcode !== 0 || !response.access_token) throw new AuthError('DINGTALK_AUTH_FAILED', 400, '钉钉登录失败');
  return response.access_token;
}

async function exchangeInternalAuthCode(authCode, config = getDingtalkConfig()) {
  if (!authCode || String(authCode).length > 4096) throw new AuthError('DINGTALK_AUTH_FAILED', 400, '钉钉登录失败');
  const accessToken = await getInternalAccessToken({ appKey: config.appKey, appSecret: config.appSecret });
  const response = await requestJson(`https://oapi.dingtalk.com/topapi/v2/user/getuserinfo?access_token=${encodeURIComponent(accessToken)}`, { method: 'POST', body: { code: String(authCode) } });
  const result = response.result || {};
  if (response.errcode !== 0 || !result.userid || !(result.unionid || result.unionId) || !(result.corp_id || result.corpId)) throw new AuthError('DINGTALK_AUTH_FAILED', 400, '钉钉登录失败');
  return { corpId: result.corp_id || result.corpId, userId: result.userid || result.userId, unionId: result.unionid || result.unionId, nick: result.name || result.nick || '' };
}

function createDingtalkIdentityClient({ exchangeInternalCode = exchangeInternalAuthCode } = {}) { return { exchangeInternalCode }; }

module.exports = { createDingtalkIdentityClient, exchangeInternalAuthCode };
