const crypto = require('crypto');
const { exchangeUser } = require('../services/dingtalkService');
const { resolveOrBindDingtalkUser } = require('../services/dingtalkUserBindingService');
const { parseRememberMe, issueTokenPair } = require('../services/authSessionService');
const { getAuthorization } = require('../services/authorizationService');
const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || 'rt';
const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME || 'csrf_token';
function options(maxAge) { return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/auth', maxAge }; }
const loginWithDingTalk = async (req, res) => { try { const { authCode, rememberMe } = req.body; if (!authCode) return res.status(400).json({ message: req.t('auth.invalidCredentials') }); const info = await exchangeUser(authCode); const resolved = await resolveOrBindDingtalkUser(info); if (!resolved?.user) return res.status(400).json({ message: 'failed to resolve DingTalk user' }); const user = resolved.user; const pair = await issueTokenPair({ userId: user.id, username: user.username, rememberMe: parseRememberMe(rememberMe), deviceInfo: String(req.headers?.['user-agent'] || '').slice(0, 255), ipAddress: req.ip || null }); res.cookie(REFRESH_COOKIE_NAME, pair.refreshToken, options(pair.refreshTokenMaxAgeMs)); res.cookie(CSRF_COOKIE_NAME, crypto.randomBytes(24).toString('base64url'), { ...options(pair.refreshTokenMaxAgeMs), httpOnly: false, path: '/' }); res.json({ message: req.t('auth.loginSuccess') || 'OK', token: pair.accessToken, user: { id: user.id, username: user.username, email: user.email, authorization: await getAuthorization(user.id) } }); } catch (error) { res.status(500).json({ message: req.t('shared.operationFailed'), error: error.message }); } };
module.exports = { loginWithDingTalk };
