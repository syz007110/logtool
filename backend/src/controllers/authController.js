const crypto = require('crypto');
const User = require('../models/user');
const UserRole = require('../models/user_role');
const Role = require('../models/role');
const Permission = require('../models/permission');
const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const svgCaptcha = require('svg-captcha');
const { validatePasswordStrength } = require('../utils/passwordStrength');
const loginFail = require('../utils/loginFailManager');
const { cacheManager } = require('../config/cache');

const CAPTCHA_PREFIX = 'captcha:';
const CAPTCHA_TTL = 300;

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
    const { username, password, captchaId, captchaCode } = req.body;
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
    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '12h' });
    const mustChangePassword = !!user.must_change_password;
    res.json({
      message: req.t('auth.loginSuccess') || 'OK',
      token,
      mustChangePassword,
      user: { id: user.id, username: user.username, email: user.email, role: roleName, role_id: roleId, permissions, mustChangePassword }
    });
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

module.exports = { register, login, me, getCaptcha };
