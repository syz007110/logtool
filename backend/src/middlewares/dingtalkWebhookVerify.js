const crypto = require('crypto');

function parseBool(value, fallback = true) {
  const s = String(value == null ? '' : value).trim().toLowerCase();
  if (!s) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return fallback;
}

function parseWindowMs(value, fallback = 3 * 60 * 1000) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function readTimestamp(req) {
  const qTs = String(req?.query?.timestamp || '').trim();
  if (qTs) return qTs;
  return String(req?.headers?.['x-dingtalk-timestamp'] || '').trim();
}

function readSign(req) {
  const qSign = String(req?.query?.sign || '').trim();
  if (qSign) return qSign;
  return String(req?.headers?.['x-dingtalk-sign'] || '').trim();
}

function computeSign(secret, timestamp) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}\n${secret}`, 'utf8')
    .digest('base64');
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function createDingtalkWebhookVerify(options = {}) {
  const env = options.env || process.env;
  const logger = options.logger || console;
  const now = typeof options.now === 'function' ? options.now : () => Date.now();

  return function dingtalkWebhookVerify(req, res, next) {
    const enabled = parseBool(env.DINGTALK_BOT_VERIFY_ENABLED, true);
    if (!enabled) return next();

    const secret = String(env.DINGTALK_BOT_WEBHOOK_SECRET || '').trim();
    if (!secret) {
      logger.warn('[dingtalk-webhook-verify] missing DINGTALK_BOT_WEBHOOK_SECRET while verify is enabled');
      return res.status(401).json({ message: 'dingtalk webhook verify failed' });
    }

    const timestamp = readTimestamp(req);
    const sign = readSign(req);
    if (!timestamp || !sign) {
      return res.status(401).json({ message: 'dingtalk webhook verify failed' });
    }

    const tsNum = Number(timestamp);
    if (!Number.isFinite(tsNum) || tsNum <= 0) {
      return res.status(401).json({ message: 'dingtalk webhook verify failed' });
    }

    const maxSkewMs = parseWindowMs(env.DINGTALK_BOT_VERIFY_MAX_SKEW_MS, 3 * 60 * 1000);
    if (Math.abs(now() - tsNum) > maxSkewMs) {
      return res.status(401).json({ message: 'dingtalk webhook verify failed' });
    }

    const expected = computeSign(secret, timestamp);
    if (!safeEqual(sign, expected)) {
      return res.status(401).json({ message: 'dingtalk webhook verify failed' });
    }

    return next();
  };
}

module.exports = {
  createDingtalkWebhookVerify
};

