const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const RefreshToken = require('../models/refresh_token');

const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || process.env.JWT_EXPIRES_IN || '12h';
const REFRESH_TOKEN_TTL = process.env.REFRESH_TOKEN_TTL || '7d';
const REFRESH_TOKEN_REMEMBER_TTL = process.env.REFRESH_TOKEN_REMEMBER_TTL || '30d';

let ensureTablePromise = null;

function parseDurationToMs(raw, fallbackMs) {
  if (!raw) return fallbackMs;
  const str = String(raw).trim();
  const m = str.match(/^(\d+)\s*(ms|s|m|h|d)$/i);
  if (!m) return fallbackMs;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (!Number.isFinite(n) || n <= 0) return fallbackMs;
  if (unit === 'ms') return n;
  if (unit === 's') return n * 1000;
  if (unit === 'm') return n * 60 * 1000;
  if (unit === 'h') return n * 60 * 60 * 1000;
  if (unit === 'd') return n * 24 * 60 * 60 * 1000;
  return fallbackMs;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

function createRawRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

function parseRememberMe(input) {
  if (typeof input === 'boolean') return input;
  if (typeof input === 'number') return input === 1;
  const text = String(input || '').trim().toLowerCase();
  return text === '1' || text === 'true' || text === 'yes' || text === 'on';
}

function getRefreshTtlMs(rememberMe) {
  const ttl = rememberMe ? REFRESH_TOKEN_REMEMBER_TTL : REFRESH_TOKEN_TTL;
  return parseDurationToMs(ttl, rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000);
}

async function ensureRefreshTokenTable() {
  if (!ensureTablePromise) {
    ensureTablePromise = RefreshToken.sync({ alter: false }).catch((error) => {
      ensureTablePromise = null;
      throw error;
    });
  }
  return ensureTablePromise;
}

async function saveRefreshTokenRecord({ userId, rawToken, rememberMe, deviceInfo, ipAddress }) {
  await ensureRefreshTokenTable();
  const now = Date.now();
  const ttlMs = getRefreshTtlMs(rememberMe);
  const expiresAt = new Date(now + ttlMs);
  const rec = await RefreshToken.create({
    user_id: userId,
    token_hash: hashToken(rawToken),
    remember_me: !!rememberMe,
    expires_at: expiresAt,
    device_info: deviceInfo || null,
    ip_address: ipAddress || null
  });
  return { record: rec, expiresAt, ttlMs };
}

function signAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

async function issueTokenPair({ userId, username, rememberMe, deviceInfo, ipAddress }) {
  const accessToken = signAccessToken({ id: userId, username });
  const rawRefreshToken = createRawRefreshToken();
  const { record, expiresAt, ttlMs } = await saveRefreshTokenRecord({
    userId,
    rawToken: rawRefreshToken,
    rememberMe,
    deviceInfo,
    ipAddress
  });
  return {
    accessToken,
    refreshToken: rawRefreshToken,
    refreshTokenExpiresAt: expiresAt,
    refreshTokenMaxAgeMs: ttlMs,
    refreshTokenId: record.id
  };
}

async function findValidRefreshToken(rawToken) {
  await ensureRefreshTokenTable();
  if (!rawToken) return null;
  const now = new Date();
  const tokenHash = hashToken(rawToken);
  return RefreshToken.findOne({
    where: {
      token_hash: tokenHash,
      revoked_at: { [Op.is]: null },
      expires_at: { [Op.gt]: now }
    }
  });
}

async function revokeRefreshTokenByRaw(rawToken) {
  if (!rawToken) return 0;
  await ensureRefreshTokenTable();
  const tokenHash = hashToken(rawToken);
  const [count] = await RefreshToken.update(
    { revoked_at: new Date() },
    { where: { token_hash: tokenHash, revoked_at: { [Op.is]: null } } }
  );
  return count || 0;
}

async function rotateRefreshToken({ rawToken, userId, username, rememberMe, deviceInfo, ipAddress }) {
  const old = await findValidRefreshToken(rawToken);
  if (!old) return null;
  const pair = await issueTokenPair({ userId, username, rememberMe, deviceInfo, ipAddress });
  await old.update({
    revoked_at: new Date(),
    replaced_by: pair.refreshTokenId
  });
  return pair;
}

module.exports = {
  ACCESS_TOKEN_TTL,
  parseRememberMe,
  ensureRefreshTokenTable,
  issueTokenPair,
  findValidRefreshToken,
  revokeRefreshTokenByRaw,
  rotateRefreshToken
};
