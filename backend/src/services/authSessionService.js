const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const RefreshToken = require('../models/refresh_token');
const { getAuthConfig } = require('../config/auth');

const authConfig = getAuthConfig();
const ACCESS_TOKEN_TTL = authConfig.accessTokenTtl;
const REFRESH_TOKEN_TTL = authConfig.refreshTokenTtl;
const REFRESH_TOKEN_REMEMBER_TTL = authConfig.refreshTokenRememberTtl;


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

async function saveRefreshTokenRecord({ userId, rawToken, rememberMe, deviceInfo, ipAddress, transaction }) {
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
  }, transaction ? { transaction } : undefined);
  return { record: rec, expiresAt, ttlMs };
}

function signAccessToken(payload) {
  if (!authConfig.jwtSecret) throw new Error('JWT_SECRET is required');
  return jwt.sign(payload, authConfig.jwtSecret, { expiresIn: ACCESS_TOKEN_TTL });
}

async function issueTokenPair({ userId, username, rememberMe, deviceInfo, ipAddress, transaction, mustChangePassword = false }) {
  const accessToken = signAccessToken({ id: userId, username, mustChangePassword: !!mustChangePassword });
  const rawRefreshToken = createRawRefreshToken();
  const { record, expiresAt, ttlMs } = await saveRefreshTokenRecord({
    userId,
    rawToken: rawRefreshToken,
    rememberMe,
    deviceInfo,
    ipAddress,
    transaction
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
  const tokenHash = hashToken(rawToken);
  const [count] = await RefreshToken.update(
    { revoked_at: new Date() },
    { where: { token_hash: tokenHash, revoked_at: { [Op.is]: null } } }
  );
  return count || 0;
}

async function findRefreshToken(rawToken, { transaction } = {}) {
  if (!rawToken) return null;
  return RefreshToken.findOne({ where: { token_hash: hashToken(rawToken) }, transaction });
}

async function revokeUserSessions(userId, { transaction } = {}) {
  const [count] = await RefreshToken.update({ revoked_at: new Date() }, { where: { user_id: userId, revoked_at: { [Op.is]: null } }, transaction });
  return count || 0;
}

async function rotateRefreshToken({ rawToken, userId, username, rememberMe, deviceInfo, ipAddress, mustChangePassword = false, transaction }) {
  const old = await findValidRefreshToken(rawToken);
  if (!old) return null;
  const pair = await issueTokenPair({ userId, username, rememberMe, deviceInfo, ipAddress, mustChangePassword, transaction });
  await old.update({
    revoked_at: new Date(),
    replaced_by: pair.refreshTokenId
  }, transaction ? { transaction } : undefined);
  return pair;
}

module.exports = {
  ACCESS_TOKEN_TTL,
  parseRememberMe,
  issueTokenPair,
  findValidRefreshToken,
  findRefreshToken,
  revokeRefreshTokenByRaw,
  revokeUserSessions,
  rotateRefreshToken,
  hashToken
};
