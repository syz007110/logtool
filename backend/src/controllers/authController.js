const crypto = require('crypto');
const { fromHttpRequest } = require('../audit/httpAuditContext');
const { authenticationService } = require('../services/authenticationService');
const { createCaptcha } = require('../services/captchaService');
const { AuthError } = require('../services/authErrors');
const { getAuthConfig } = require('../config/auth');

const authConfig = getAuthConfig();
const REFRESH_COOKIE_NAME = authConfig.refreshCookieName;
const CSRF_COOKIE_NAME = authConfig.csrfCookieName;

function cookieOptions(maxAge) { return { httpOnly: true, secure: authConfig.cookieSecure, sameSite: authConfig.cookieSameSite, path: '/api/auth', maxAge }; }
function csrfCookieOptions(maxAge) { return { httpOnly: false, secure: authConfig.cookieSecure, sameSite: authConfig.cookieSameSite, path: '/', maxAge }; }
function parseCookies(req) { return Object.fromEntries(String(req.headers?.cookie || '').split(';').map((v) => v.trim()).filter(Boolean).map((v) => { const i = v.indexOf('='); return i < 0 ? [] : [v.slice(0, i), decodeURIComponent(v.slice(i + 1))]; }).filter((pair) => pair.length)); }
function refreshToken(req) { return String(req.cookies?.[REFRESH_COOKIE_NAME] || parseCookies(req)[REFRESH_COOKIE_NAME] || '').trim(); }
function csrfValid(req) { const cookies = parseCookies(req); return Boolean(req.headers?.['x-csrf-token']) && String(req.headers['x-csrf-token']) === String(req.cookies?.[CSRF_COOKIE_NAME] || cookies[CSRF_COOKIE_NAME] || ''); }
function clearCookies(res) { res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions(0)); res.clearCookie(CSRF_COOKIE_NAME, csrfCookieOptions(0)); }
function issueCookies(res, result) { res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, cookieOptions(result.refreshTokenMaxAgeMs)); res.cookie(CSRF_COOKIE_NAME, crypto.randomBytes(24).toString('base64url'), csrfCookieOptions(result.refreshTokenMaxAgeMs)); }
function command(req) { return { ...(req.body || {}), ip: req.ip, deviceInfo: String(req.get('user-agent') || '').slice(0, 255) || null }; }
function requireString(value, name, max = 4096) { if (typeof value !== 'string' || !value.trim() || value.length > max) throw new AuthError('INVALID_REQUEST', 400, `${name} 无效`); }
function sendError(res, error, { local = false } = {}) {
  if (!(error instanceof AuthError)) return res.status(500).json({ code: 'INTERNAL_ERROR', message: '操作失败' });
  const masked = local && ['ACCOUNT_INACTIVE', 'LOCAL_LOGIN_NOT_ALLOWED', 'EMERGENCY_LOGIN_FORBIDDEN'].includes(error.code);
  const response = { code: masked ? 'INVALID_CREDENTIALS' : error.code, message: masked ? '用户名或密码错误' : error.message };
  if (['CAPTCHA_REQUIRED', 'CAPTCHA_INVALID'].includes(error.code)) response.requireCaptcha = true;
  if (error.retryAfter) { response.retryAfter = error.retryAfter; res.set('Retry-After', String(error.retryAfter)); }
  return res.status(masked ? 401 : error.status).json(response);
}

async function loginLocal(req, res) { try { requireString(req.body?.username, 'username', 100); requireString(req.body?.password, 'password', 256); const result = await authenticationService.loginLocal(command(req), fromHttpRequest(req)); issueCookies(res, result); res.json({ token: result.token, user: result.user, mustChangePassword: result.mustChangePassword }); } catch (error) { sendError(res, error, { local: true }); } }
async function loginEmergency(req, res) { try { requireString(req.body?.username, 'username', 100); requireString(req.body?.password, 'password', 256); const result = await authenticationService.loginEmergency(command(req), fromHttpRequest(req)); issueCookies(res, result); res.json({ token: result.token, user: result.user, mustChangePassword: result.mustChangePassword }); } catch (error) { sendError(res, error, { local: true }); } }
async function loginDingtalk(req, res) { try { requireString(req.body?.authCode, 'authCode'); const result = await authenticationService.loginDingtalk(command(req), fromHttpRequest(req)); issueCookies(res, result); res.json({ token: result.token, user: result.user, mustChangePassword: result.mustChangePassword }); } catch (error) { sendError(res, error); } }
async function getCaptcha(req, res) { try { res.json(await createCaptcha()); } catch (error) { sendError(res, error); } }
async function getLoginOptions(req, res) { res.json(authenticationService.getLoginOptions()); }
async function refresh(req, res) { try { if (!csrfValid(req)) throw new AuthError('FORBIDDEN', 403, '请求校验失败'); const result = await authenticationService.refresh(refreshToken(req), command(req), fromHttpRequest(req)); issueCookies(res, result); res.json({ token: result.token }); } catch (error) { clearCookies(res); sendError(res, error); } }
async function logout(req, res) { try { if (!csrfValid(req)) throw new AuthError('FORBIDDEN', 403, '请求校验失败'); await authenticationService.logout(refreshToken(req), fromHttpRequest(req)); clearCookies(res); res.status(204).end(); } catch (error) { clearCookies(res); sendError(res, error); } }
async function completeInitialPassword(req, res) { try { requireString(req.body?.password, 'password', 256); const result = await authenticationService.completeInitialPassword(req.user?.id, req.body.password, command(req), fromHttpRequest(req)); issueCookies(res, result); res.json({ token: result.token }); } catch (error) { sendError(res, error); } }
async function me(req, res) { try { res.json({ user: await authenticationService.getAuthenticatedUser(req.user?.id) }); } catch (error) { sendError(res, error); } }
function retired(req, res) { res.status(410).json({ code: 'AUTH_ENDPOINT_RETIRED', message: '该认证接口已下线' }); }

module.exports = { loginLocal, loginEmergency, loginDingtalk, me, getCaptcha, getLoginOptions, refresh, logout, completeInitialPassword, retired };
