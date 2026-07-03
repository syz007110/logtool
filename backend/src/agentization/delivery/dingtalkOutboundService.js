const https = require('https');

function postJson(url, body, headers = {}) {
  const payload = JSON.stringify(body || {});
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (!data) return resolve({});
        try {
          return resolve(JSON.parse(data));
        } catch (error) {
          return resolve({ raw: data, parseError: String(error?.message || error) });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function buildTextMessageBody(text) {
  const content = String(text || '').trim() || '已收到消息';
  return { msgtype: 'text', text: { content } };
}

function resolveRobotCredentials() {
  const clientId = String(process.env.DINGTALK_STREAM_CLIENT_ID || process.env.DINGTALK_APP_KEY || '').trim();
  const clientSecret = String(
    process.env.DINGTALK_STREAM_CLIENT_SECRET || process.env.DINGTALK_APP_SECRET || ''
  ).trim();
  return { clientId, clientSecret };
}

let accessTokenCache = { token: '', expiresAt: 0 };

async function getRobotAccessToken() {
  const now = Date.now();
  if (accessTokenCache.token && accessTokenCache.expiresAt > now + 30_000) {
    return accessTokenCache.token;
  }
  const { clientId, clientSecret } = resolveRobotCredentials();
  if (!clientId || !clientSecret) {
    throw new Error('dingtalk robot credentials missing');
  }
  const resp = await postJson('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
    appKey: clientId,
    appSecret: clientSecret
  });
  const token = String(resp?.accessToken || '').trim();
  if (!token) {
    throw new Error(`dingtalk accessToken missing: ${JSON.stringify(resp)}`);
  }
  const ttlMs = Number(resp?.expireIn || resp?.expiresIn || 7200) * 1000;
  accessTokenCache = {
    token,
    expiresAt: now + (Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 7200_000)
  };
  return token;
}

function isReplyWebhookValid(channel) {
  const url = String(channel?.replyWebhook || '').trim();
  if (!url) return false;
  const expiredAt = Number(channel?.replyWebhookExpiredAt);
  if (!Number.isFinite(expiredAt) || expiredAt <= 0) return true;
  return Date.now() < expiredAt;
}

async function sendViaSessionWebhook(channel, body) {
  const url = String(channel?.replyWebhook || '').trim();
  if (!url) {
    throw new Error('dingtalk sessionWebhook is required');
  }
  const accessToken = await getRobotAccessToken();
  return postJson(url, body, accessToken ? { 'x-acs-dingtalk-access-token': accessToken } : {});
}

async function sendViaOpenApi(request, body) {
  const channel = request?.channel && typeof request.channel === 'object' ? request.channel : {};
  const user = request?.user && typeof request.user === 'object' ? request.user : {};
  const robotCode = String(channel.robotCode || '').trim();
  if (!robotCode) {
    throw new Error('dingtalk robotCode is required for open API delivery');
  }
  const accessToken = await getRobotAccessToken();
  const headers = { 'x-acs-dingtalk-access-token': accessToken };
  const msgKey = 'sampleText';
  const msgParam = JSON.stringify({ content: String(body?.text?.content || '').trim() || '已收到消息' });
  const conversationType = String(channel.conversationType || 'single').trim().toLowerCase();

  if (conversationType === 'group') {
    const openConversationId = String(channel.conversationId || '').trim();
    if (!openConversationId) {
      throw new Error('dingtalk openConversationId is required for group delivery');
    }
    return postJson('https://api.dingtalk.com/v1.0/robot/groupMessages/send', {
      robotCode,
      openConversationId,
      msgKey,
      msgParam
    }, headers);
  }

  const userIds = [
    String(user.platformUserId || '').trim(),
    String(user.id || '').trim()
  ].filter(Boolean);
  const uniqueUserIds = Array.from(new Set(userIds));
  if (uniqueUserIds.length === 0) {
    throw new Error('dingtalk userIds are required for single chat delivery');
  }
  return postJson('https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend', {
    robotCode,
    userIds: uniqueUserIds,
    msgKey,
    msgParam
  }, headers);
}

async function deliverDingtalkTextMessage(request, text) {
  const channel = request?.channel && typeof request.channel === 'object' ? request.channel : {};
  const body = buildTextMessageBody(text);
  if (isReplyWebhookValid(channel)) {
    try {
      return { channel: 'session_webhook', response: await sendViaSessionWebhook(channel, body) };
    } catch (error) {
      const fallback = await sendViaOpenApi(request, body);
      return {
        channel: 'open_api',
        response: fallback,
        webhookError: String(error?.message || error)
      };
    }
  }
  const response = await sendViaOpenApi(request, body);
  return { channel: 'open_api', response };
}

module.exports = {
  buildTextMessageBody,
  deliverDingtalkTextMessage,
  getRobotAccessToken,
  isReplyWebhookValid,
  postJson,
  sendViaOpenApi,
  sendViaSessionWebhook
};
