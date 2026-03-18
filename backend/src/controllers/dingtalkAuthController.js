const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const User = require('../models/user')
const UserRole = require('../models/user_role')
const Role = require('../models/role')
const Permission = require('../models/permission')
const { Op } = require('sequelize')
const { exchangeUser } = require('../services/dingtalkService')
const { parseRememberMe, issueTokenPair } = require('../services/authSessionService')

const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || 'rt'
const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME || 'csrf_token'

function getRefreshCookieOptions(maxAgeMs) {
  const secure = String(process.env.AUTH_COOKIE_SECURE || '').trim().toLowerCase() === 'true' || process.env.NODE_ENV === 'production'
  const sameSiteRaw = String(process.env.AUTH_COOKIE_SAMESITE || 'lax').trim().toLowerCase()
  const sameSite = ['lax', 'strict', 'none'].includes(sameSiteRaw) ? sameSiteRaw : 'lax'
  return {
    httpOnly: true,
    secure,
    sameSite,
    path: '/api/auth',
    maxAge: maxAgeMs
  }
}

function getDeviceInfo(req) {
  const ua = String(req.headers?.['user-agent'] || '').trim()
  return ua ? ua.slice(0, 255) : null
}

function getCsrfCookieOptions(maxAgeMs) {
  const secure = String(process.env.AUTH_COOKIE_SECURE || '').trim().toLowerCase() === 'true' || process.env.NODE_ENV === 'production'
  const sameSiteRaw = String(process.env.AUTH_COOKIE_SAMESITE || 'lax').trim().toLowerCase()
  const sameSite = ['lax', 'strict', 'none'].includes(sameSiteRaw) ? sameSiteRaw : 'lax'
  return {
    httpOnly: false,
    secure,
    sameSite,
    path: '/',
    maxAge: maxAgeMs
  }
}

async function getUserPrimaryRole (userId) {
  const userRole = await UserRole.findOne({ where: { user_id: userId } })
  if (!userRole) return { roleName: null, roleId: null }
  const role = await Role.findByPk(userRole.role_id)
  return { roleName: role ? role.name : null, roleId: role ? role.id : null }
}

async function getUserPermissions (userId) {
  const userRoles = await UserRole.findAll({ where: { user_id: userId } })
  const roleIds = userRoles.map(ur => ur.role_id).filter(Boolean)
  if (roleIds.length === 0) return []
  const perms = await Permission.findAll({
    include: [{ model: Role, as: 'roles', where: { id: { [Op.in]: roleIds } }, attributes: [] }],
    attributes: ['name']
  })
  return perms.map(p => p.name)
}

async function ensureDefaultRole (userId) {
  const exists = await UserRole.findOne({ where: { user_id: userId } })
  if (exists) return
  await UserRole.create({
    user_id: userId,
    role_id: 3,
    assigned_by: userId,
    notes: 'DingTalk login auto-assign'
  })
}

const loginWithDingTalk = async (req, res) => {
  try {
    const { authCode, rememberMe } = req.body
    if (!authCode) {
      return res.status(400).json({ message: req.t('auth.invalidCredentials') })
    }
    const info = await exchangeUser(authCode)
    if (!info.unionId) {
      return res.status(400).json({ message: 'unionId missing in DingTalk response' })
    }
    let user = await User.findOne({ where: { dingtalk_unionid: info.unionId } })
    if (!user) {
      const username = `dd_${info.userId || info.unionId}`
      const password_hash = await bcrypt.hash(`dd_${info.unionId}_${Date.now()}`, 10)
      user = await User.create({
        username,
        password_hash,
        email: null,
        dingtalk_unionid: info.unionId,
        dingtalk_userid: info.userId,
        dingtalk_mobile: info.mobile,
        dingtalk_nick: info.nick
      })
      await ensureDefaultRole(user.id)
    } else {
      // 更新缓存信息
      user.dingtalk_userid = info.userId
      user.dingtalk_mobile = info.mobile
      user.dingtalk_nick = info.nick
      await user.save()
      await ensureDefaultRole(user.id)
    }

    const { roleName, roleId } = await getUserPrimaryRole(user.id)
    const permissions = await getUserPermissions(user.id)
    const remember = parseRememberMe(rememberMe)
    const pair = await issueTokenPair({
      userId: user.id,
      username: user.username,
      rememberMe: remember,
      deviceInfo: getDeviceInfo(req),
      ipAddress: req.ip || null
    })
    res.cookie(REFRESH_COOKIE_NAME, pair.refreshToken, getRefreshCookieOptions(pair.refreshTokenMaxAgeMs))
    res.cookie(CSRF_COOKIE_NAME, crypto.randomBytes(24).toString('base64url'), getCsrfCookieOptions(pair.refreshTokenMaxAgeMs))

    res.json({
      message: req.t('auth.loginSuccess') || 'OK',
      token: pair.accessToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: roleName,
        role_id: roleId,
        permissions
      }
    })
  } catch (err) {
    // Log detailed error to help diagnose DingTalk login issues (e.g., errcode 11021)
    console.error('DingTalk login failed:', err)
    res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message })
  }
}

module.exports = {
  loginWithDingTalk
}
