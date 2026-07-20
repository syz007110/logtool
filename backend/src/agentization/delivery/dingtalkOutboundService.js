const https = require('https');

function isSuccessfulHttpStatus(status) {
  const code = Number(status || 0);
  return Number.isInteger(code) && code >= 200 && code < 300;
}

function buildDingtalkDeliveryError(response, options = {}) {
  const stage = String(options.stage || 'dingtalk_delivery').trim() || 'dingtalk_delivery';
  const httpStatus = Number(response?._httpStatus || 0) || 0;
  const message = `${stage} failed: HTTP ${httpStatus || 'unknown'}`;
  const error = new Error(message);
  error.code = 'DINGTALK_HTTP_ERROR';
  error.httpStatus = httpStatus;
  error.response = response;
  return error;
}

function assertDingtalkDeliveryResponseSuccess(response, options = {}) {
  const httpStatus = Number(response?._httpStatus || 0) || 0;
  if (!isSuccessfulHttpStatus(httpStatus)) {
    throw buildDingtalkDeliveryError(response, options);
  }
  return response;
}

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
        if (!data) {
          return resolve({
            _httpStatus: Number(res.statusCode) || 0,
            _httpHeaders: res.headers || {}
          });
        }
        try {
          const parsed = JSON.parse(data);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            parsed._httpStatus = Number(res.statusCode) || 0;
            parsed._httpHeaders = res.headers || {};
            return resolve(parsed);
          }
          return resolve({
            value: parsed,
            _httpStatus: Number(res.statusCode) || 0,
            _httpHeaders: res.headers || {}
          });
        } catch (error) {
          return resolve({
            raw: data,
            parseError: String(error?.message || error),
            _httpStatus: Number(res.statusCode) || 0,
            _httpHeaders: res.headers || {}
          });
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

function buildMarkdownTitle(text) {
  const content = String(text || '').trim() || '已收到消息';
  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return String(firstLine || '智能助手回复').slice(0, 64);
}

function buildMarkdownMessageBody(text, title) {
  const content = String(text || '').trim() || '已收到消息';
  const resolvedTitle = String(title || '').trim() || buildMarkdownTitle(content);
  return {
    msgtype: 'markdown',
    markdown: {
      title: resolvedTitle,
      text: content
    }
  };
}

function buildSystemMarkdownText(text, title = '系统提示') {
  const resolvedTitle = String(title || '').trim() || '系统提示';
  const content = String(text || '').trim() || '已收到消息';
  return `**${resolvedTitle}**\n\n${content}`;
}

function buildActionCardMessageBody(text, options = {}) {
  const content = String(text || '').trim() || '已收到消息';
  const title = String(options.title || '').trim() || '系统提示';
  const singleTitle = String(options.singleTitle || '').trim() || '我知道了';
  const singleURL = String(options.singleURL || process.env.DINGTALK_ACTION_CARD_URL || 'https://www.dingtalk.com/').trim();
  return {
    msgtype: 'actionCard',
    actionCard: {
      title,
      text: `### ${title}\n\n> ${content.replace(/\r?\n/g, '\n> ')}`,
      singleTitle,
      singleURL,
      hideAvatar: '0',
      btnOrientation: '0'
    }
  };
}

function buildDingtalkMessageBody(text, options = {}) {
  const messageType = String(options.messageType || 'markdown').trim().toLowerCase();
  if (messageType === 'actioncard' || messageType === 'action_card') {
    return buildActionCardMessageBody(text, options);
  }
  return buildMarkdownMessageBody(text, options.title);
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
  const response = await postJson(url, body, accessToken ? { 'x-acs-dingtalk-access-token': accessToken } : {});
  return assertDingtalkDeliveryResponseSuccess(response, { stage: 'dingtalk_session_webhook' });
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
  const msgtype = String(body?.msgtype || '').trim().toLowerCase();
  const isMarkdown = msgtype === 'markdown';
  const isActionCard = msgtype === 'actioncard';
  const msgKey = isActionCard ? 'sampleActionCard' : (isMarkdown ? 'sampleMarkdown' : 'sampleText');
  const msgParam = isActionCard
    ? JSON.stringify({
      title: String(body?.actionCard?.title || '').trim() || '系统提示',
      text: String(body?.actionCard?.text || '').trim() || '已收到消息',
      singleTitle: String(body?.actionCard?.singleTitle || '').trim() || '我知道了',
      singleURL: String(body?.actionCard?.singleURL || '').trim() || 'https://www.dingtalk.com/',
      btnOrientation: String(body?.actionCard?.btnOrientation || '0'),
      hideAvatar: String(body?.actionCard?.hideAvatar || '0')
    })
    : isMarkdown
    ? JSON.stringify({
      title: String(body?.markdown?.title || '').trim() || '智能助手回复',
      text: String(body?.markdown?.text || '').trim() || '已收到消息'
    })
    : JSON.stringify({ content: String(body?.text?.content || '').trim() || '已收到消息' });
  const conversationType = String(channel.conversationType || 'single').trim().toLowerCase();

  if (conversationType === 'group') {
    const openConversationId = String(channel.conversationId || '').trim();
    if (!openConversationId) {
      throw new Error('dingtalk openConversationId is required for group delivery');
    }
    const response = await postJson('https://api.dingtalk.com/v1.0/robot/groupMessages/send', {
      robotCode,
      openConversationId,
      msgKey,
      msgParam
    }, headers);
    return assertDingtalkDeliveryResponseSuccess(response, { stage: 'dingtalk_openapi_group_send' });
  }

  const userIds = [
    String(user.platformUserId || '').trim(),
    String(user.id || '').trim()
  ].filter(Boolean);
  const uniqueUserIds = Array.from(new Set(userIds));
  if (uniqueUserIds.length === 0) {
    throw new Error('dingtalk userIds are required for single chat delivery');
  }
  const response = await postJson('https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend', {
    robotCode,
    userIds: uniqueUserIds,
    msgKey,
    msgParam
  }, headers);
  return assertDingtalkDeliveryResponseSuccess(response, { stage: 'dingtalk_openapi_single_send' });
}

async function deliverDingtalkTextMessage(request, text, deliveryOptions = {}) {
  const channel = request?.channel && typeof request.channel === 'object' ? request.channel : {};
  const body = buildDingtalkMessageBody(text, deliveryOptions);
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
  buildActionCardMessageBody,
  assertDingtalkDeliveryResponseSuccess,
  buildDingtalkMessageBody,
  buildDingtalkDeliveryError,
  buildMarkdownMessageBody,
  buildSystemMarkdownText,
  buildTextMessageBody,
  deliverDingtalkTextMessage,
  getRobotAccessToken,
  isReplyWebhookValid,
  isSuccessfulHttpStatus,
  postJson,
  sendViaOpenApi,
  sendViaSessionWebhook
};
