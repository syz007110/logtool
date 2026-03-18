const crypto = require('crypto');
const User = require('../models/user');
const UserRole = require('../models/user_role');
const Role = require('../models/role');
const Permission = require('../models/permission');
const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const svgCaptcha = require('svg-captcha');
const { validatePasswordStrength } = require('../utils/passwordStrength');
const loginFail = require('../utils/loginFailManager');
const { cacheManager } = require('../config/cache');
const {
  parseRememberMe,
  issueTokenPair,
  findValidRefreshToken,
  revokeRefreshTokenByRaw,
  rotateRefreshToken
} = require('../services/authSessionService');

const CAPTCHA_PREFIX = 'captcha:';
const CAPTCHA_TTL = 300;
const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || 'rt';
const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME || 'csrf_token';

function parseCookieHeader(cookieHeader) {
  const out = {};
  const raw = String(cookieHeader || '');
  if (!raw) return out;
  const pairs = raw.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(val);
  }
  return out;
}

function getRefreshCookieOptions(maxAgeMs) {
  const secure = String(process.env.AUTH_COOKIE_SECURE || '').trim().toLowerCase() === 'true' || process.env.NODE_ENV === 'production';
  const sameSiteRaw = String(process.env.AUTH_COOKIE_SAMESITE || 'lax').trim().toLowerCase();
  const sameSite = ['lax', 'strict', 'none'].includes(sameSiteRaw) ? sameSiteRaw : 'lax';
  return {
    httpOnly: true,
    secure,
    sameSite,
    path: '/api/auth',
    maxAge: maxAgeMs
  };
}

function getCsrfCookieOptions(maxAgeMs) {
  const secure = String(process.env.AUTH_COOKIE_SECURE || '').trim().toLowerCase() === 'true' || process.env.NODE_ENV === 'production';
  const sameSiteRaw = String(process.env.AUTH_COOKIE_SAMESITE || 'lax').trim().toLowerCase();
  const sameSite = ['lax', 'strict', 'none'].includes(sameSiteRaw) ? sameSiteRaw : 'lax';
  return {
    httpOnly: false,
    secure,
    sameSite,
    path: '/',
    maxAge: maxAgeMs
  };
}

function getRefreshTokenFromReq(req) {
  if (req.cookies && req.cookies[REFRESH_COOKIE_NAME]) {
    return String(req.cookies[REFRESH_COOKIE_NAME] || '').trim();
  }
  const parsed = parseCookieHeader(req.headers?.cookie);
  return String(parsed[REFRESH_COOKIE_NAME] || '').trim();
}

function clearRefreshCookie(res) {
  const opts = getRefreshCookieOptions(0);
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: opts.httpOnly,
    secure: opts.secure,
    sameSite: opts.sameSite,
    path: opts.path
  });
}

function clearCsrfCookie(res) {
  const opts = getCsrfCookieOptions(0);
  res.clearCookie(CSRF_COOKIE_NAME, {
    httpOnly: opts.httpOnly,
    secure: opts.secure,
    sameSite: opts.sameSite,
    path: opts.path
  });
}

function issueCsrfCookie(res, maxAgeMs) {
  const csrfToken = crypto.randomBytes(24).toString('base64url');
  res.cookie(CSRF_COOKIE_NAME, csrfToken, getCsrfCookieOptions(maxAgeMs));
  return csrfToken;
}

function getCsrfTokenFromReq(req) {
  if (req.cookies && req.cookies[CSRF_COOKIE_NAME]) {
    return String(req.cookies[CSRF_COOKIE_NAME] || '').trim();
  }
  const parsed = parseCookieHeader(req.headers?.cookie);
  return String(parsed[CSRF_COOKIE_NAME] || '').trim();
}

function isCsrfValid(req) {
  const fromHeader = String(req.headers?.['x-csrf-token'] || '').trim();
  const fromCookie = getCsrfTokenFromReq(req);
  return !!fromHeader && !!fromCookie && fromHeader === fromCookie;
}

function getDeviceInfo(req) {
  const ua = String(req.headers?.['user-agent'] || '').trim();
  return ua ? ua.slice(0, 255) : null;
}

const register = async (req, res) => {
  try {
    const { username, password, email, roles } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: req.t('user.requiredUsernamePassword') });
    }
    const pw = validatePasswordStrength(password, username);
    if (!pw.valid) {
      return res.status(400).json({ message: req.t('user.' + pw.message) });
    }
    const exist = await User.findOne({ where: { username } });
    if (exist) {
      return res.status(409).json({ message: req.t('user.usernameExists') });
    }
    const password_hash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, password_hash, email });

    if (roles && Array.isArray(roles) && roles.length > 0) {
      for (const roleId of roles) {
        await UserRole.create({
          user_id: user.id,
          role_id: roleId,
          assigned_by: user.id,
          notes: '注册时分配'
        });
      }
    } else {
      await UserRole.create({
        user_id: user.id,
        role_id: 3,
        assigned_by: user.id,
        notes: '注册时默认分配普通用户权限'
      });
    }

    res.status(201).json({ message: req.t('shared.created'), user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

async function getUserPrimaryRole(userId) {
  const userRole = await UserRole.findOne({ where: { user_id: userId } });
  if (!userRole) return { roleName: null, roleId: null };
  const role = await Role.findByPk(userRole.role_id);
  return { roleName: role ? role.name : null, roleId: role ? role.id : null };
}

async function getUserPermissions(userId) {
  const userRoles = await UserRole.findAll({ where: { user_id: userId } });
  const roleIds = userRoles.map(ur => ur.role_id).filter(Boolean);
  if (roleIds.length === 0) return [];
  const perms = await Permission.findAll({
    include: [{ model: Role, as: 'roles', where: { id: { [Op.in]: roleIds } }, attributes: [] }],
    attributes: ['name']
  });
  return perms.map(p => p.name);
}

const getCaptcha = async (req, res) => {
  try {
    if (!loginFail.available()) {
      return res.status(503).json({ message: 'captcha unavailable' });
    }
    const id = crypto.randomBytes(16).toString('hex');
    const c = svgCaptcha.create({ size: 4, ignoreChars: '0oO1ilI' });
    await cacheManager.set(CAPTCHA_PREFIX + id, { text: c.text }, CAPTCHA_TTL);
    res.json({ id, svg: c.data });
  } catch (err) {
    res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

async function verifyCaptcha(id, code) {
  if (!id || !code || !loginFail.available()) return { ok: false };
  try {
    const k = CAPTCHA_PREFIX + id;
    const v = await cacheManager.get(k);
    if (!v || !v.text) return { ok: false };
    const match = String(code).trim().toLowerCase() === String(v.text).trim().toLowerCase();
    await cacheManager.del(k);
    return { ok: !!match };
  } catch (e) {
    return { ok: false };
  }
}

const login = async (req, res) => {
  try {
    const { username, password, captchaId, captchaCode, rememberMe } = req.body;
    const user = await User.findOne({ where: { username } });
    const un = (username || '').trim();

    if (loginFail.available()) {
      const fi = await loginFail.getFail(un);
      if (fi && fi.locked) {
        res.set('Retry-After', String(loginFail.LOCK_TTL));
        return res.status(423).json({
          message: req.t('auth.loginLocked', { minutes: Math.ceil(loginFail.LOCK_TTL / 60) }),
          retryAfter: loginFail.LOCK_TTL
        });
      }
      if (fi && fi.count >= loginFail.CAPTCHA_THRESHOLD) {
        if (!captchaId || !captchaCode) {
          return res.status(400).json({ message: req.t('auth.captchaRequired'), requireCaptcha: true, failCount: fi.count });
        }
        const v = await verifyCaptcha(captchaId, captchaCode);
        if (!v.ok) {
          return res.status(400).json({ message: req.t('auth.captchaInvalid'), requireCaptcha: true, failCount: fi.count });
        }
      }
    }

    if (!user) {
      if (loginFail.available()) await loginFail.recordFail(un);
      const fi2 = await loginFail.getFail(un);
      const payload = { message: req.t('auth.invalidCredentials') };
      if (fi2 && fi2.count >= loginFail.CAPTCHA_THRESHOLD) {
        payload.requireCaptcha = true;
        payload.failCount = fi2.count;
      }
      return res.status(401).json(payload);
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      if (loginFail.available()) await loginFail.recordFail(un);
      const fi2 = await loginFail.getFail(un);
      const payload = { message: req.t('auth.invalidCredentials') };
      if (fi2 && fi2.count >= loginFail.CAPTCHA_THRESHOLD) {
        payload.requireCaptcha = true;
        payload.failCount = fi2.count;
      }
      return res.status(401).json(payload);
    }

    if (loginFail.available()) await loginFail.clearFail(un);
    const pwCheck = validatePasswordStrength(password, user.username);
    if (!pwCheck.valid) {
      user.must_change_password = true;
      await user.save();
    }
    const { roleName, roleId } = await getUserPrimaryRole(user.id);
    const permissions = await getUserPermissions(user.id);
    const remember = parseRememberMe(rememberMe);
    const pair = await issueTokenPair({
      userId: user.id,
      username: user.username,
      rememberMe: remember,
      deviceInfo: getDeviceInfo(req),
      ipAddress: req.ip || null
    });
    res.cookie(REFRESH_COOKIE_NAME, pair.refreshToken, getRefreshCookieOptions(pair.refreshTokenMaxAgeMs));
    issueCsrfCookie(res, pair.refreshTokenMaxAgeMs);
    const mustChangePassword = !!user.must_change_password;
    res.json({
      message: req.t('auth.loginSuccess') || 'OK',
      token: pair.accessToken,
      mustChangePassword,
      user: { id: user.id, username: user.username, email: user.email, role: roleName, role_id: roleId, permissions, mustChangePassword }
    });
  } catch (err) {
    res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

const refresh = async (req, res) => {
  try {
    if (!isCsrfValid(req)) {
      return res.status(403).json({ message: req.t('auth.insufficientPermissions') });
    }
    const rawRefreshToken = getRefreshTokenFromReq(req);
    if (!rawRefreshToken) {
      return res.status(401).json({ message: req.t('auth.unauthenticated') });
    }
    const old = await findValidRefreshToken(rawRefreshToken);
    if (!old) {
      clearRefreshCookie(res);
      return res.status(401).json({ message: req.t('auth.tokenExpired') });
    }
    const user = await User.findByPk(old.user_id);
    if (!user || user.is_active === false) {
      clearRefreshCookie(res);
      return res.status(401).json({ message: req.t('auth.unauthenticated') });
    }

    const remember = !!old.remember_me;
    const pair = await rotateRefreshToken({
      rawToken: rawRefreshToken,
      userId: user.id,
      username: user.username,
      rememberMe: remember,
      deviceInfo: getDeviceInfo(req),
      ipAddress: req.ip || null
    });
    if (!pair) {
      clearRefreshCookie(res);
      return res.status(401).json({ message: req.t('auth.tokenExpired') });
    }
    res.cookie(REFRESH_COOKIE_NAME, pair.refreshToken, getRefreshCookieOptions(pair.refreshTokenMaxAgeMs));
    issueCsrfCookie(res, pair.refreshTokenMaxAgeMs);
    res.json({ token: pair.accessToken });
  } catch (err) {
    res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

const logout = async (req, res) => {
  try {
    if (!isCsrfValid(req)) {
      return res.status(403).json({ message: req.t('auth.insufficientPermissions') });
    }
    const rawRefreshToken = getRefreshTokenFromReq(req);
    if (rawRefreshToken) {
      await revokeRefreshTokenByRaw(rawRefreshToken);
    }
    clearRefreshCookie(res);
    clearCsrfCookie(res);
    res.json({ message: req.t('shared.operationSuccess') || 'OK' });
  } catch (err) {
    res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

const me = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: req.t('auth.unauthenticated') });
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: req.t('shared.notFound') });
    const { roleName, roleId } = await getUserPrimaryRole(userId);
    const permissions = await getUserPermissions(userId);
    const mustChangePassword = !!user.must_change_password;
    res.json({ user: { id: user.id, username: user.username, email: user.email, role: roleName, role_id: roleId, permissions, mustChangePassword } });
  } catch (err) {
    res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

module.exports = { register, login, me, getCaptcha, refresh, logout };
