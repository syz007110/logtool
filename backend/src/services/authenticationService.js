const bcrypt = require('bcryptjs');
const { sequelize } = require('../models');
const User = require('../models/user');
const { getAuthorization } = require('./authorizationService');
const { auditService } = require('./auditService');
const { getAuthConfiguration } = require('./authConfiguration');
const guard = require('./localLoginGuardService');
const { verifyCaptcha } = require('./captchaService');
const { setLocalPassword } = require('./credentialService');
const { createDingtalkIdentityClient } = require('./dingtalkIdentityClient');
const { resolveOrCreateDingtalkUser } = require('./dingtalkUserBindingService');
const sessions = require('./authSessionService');
const { shouldRecordRefreshTokenReuse } = require('./authSecurityEventDeduplicator');
const { AuthError } = require('./authErrors');

function userTarget(user) { return user ? { type: 'USER', id: user.id } : null; }
function anonymousContext(context) { return { ...context, actor: { type: 'ANONYMOUS', userId: null, username: null } }; }
function userContext(context, user) { return { ...context, actor: { type: 'USER', userId: user.id, username: user.username } }; }
function loginResult(user, authorization, pair) {
  const mustChangePassword = !!user.must_change_password;
  return { token: pair.accessToken, refreshToken: pair.refreshToken, refreshTokenMaxAgeMs: pair.refreshTokenMaxAgeMs, mustChangePassword, user: { id: user.id, username: user.username, email: user.email, authorization, mustChangePassword } };
}

function createAuthenticationService({ UserModel = User, transaction = (fn) => sequelize.transaction(fn), authorization = getAuthorization, audit = auditService, configuration = getAuthConfiguration, loginGuard = guard, captchaVerifier = verifyCaptcha, identityClient = createDingtalkIdentityClient(), identityResolver = resolveOrCreateDingtalkUser, sessionService = sessions, credentialService = { setLocalPassword }, shouldRecordTokenReuse = shouldRecordRefreshTokenReuse } = {}) {
  async function recordDenied(context, eventCode, reasonCode, user, details) {
    await audit.record(user ? userContext(context, user) : anonymousContext(context), { eventCode, outcome: 'DENIED', reasonCode, target: userTarget(user), details });
  }

  async function passwordLogin(command, context, { emergency = false } = {}) {
    const username = loginGuard.normalizedUsername(command.username);
    const eventCode = emergency ? 'AUTH.EMERGENCY_LOGIN' : 'AUTH.LOCAL_LOGIN';
    const details = { loginChannel: emergency ? 'emergency' : 'local', captchaRequired: false };
    const config = configuration();
    if (!emergency && !config.localLoginEnabled) {
      await recordDenied(context, eventCode, 'LOCAL_LOGIN_DISABLED', null, details);
      throw new AuthError('LOCAL_LOGIN_DISABLED', 403, '本地登录未启用');
    }
    const check = await loginGuard.assertCanAttempt({ username, ip: command.ip });
    details.captchaRequired = check.captchaRequired;
    if (check.captchaRequired) {
      if (!command.captchaId || !command.captchaCode) throw new AuthError('CAPTCHA_REQUIRED', 400, '请完成验证码验证');
      if (!(await captchaVerifier(command.captchaId, command.captchaCode))) {
        await loginGuard.recordFailure(username);
        await recordDenied(context, eventCode, 'CAPTCHA_INVALID', null, details);
        throw new AuthError('CAPTCHA_INVALID', 400, '验证码错误，请重试');
      }
    }
    const user = await UserModel.findOne({ where: { username } });
    const validPassword = Boolean(user?.password_hash) && await bcrypt.compare(String(command.password || ''), user.password_hash);
    if (!validPassword) {
      const failure = await loginGuard.recordFailure(username);
      await recordDenied(context, eventCode, failure.locked ? 'LOGIN_LOCKED' : 'INVALID_CREDENTIALS', user, details);
      if (failure.locked) throw new AuthError('LOGIN_LOCKED', 423, '登录尝试次数过多，请稍后再试', { retryAfter: failure.retryAfter });
      throw new AuthError('INVALID_CREDENTIALS', 401, '用户名或密码错误');
    }
    if (!user.is_active) {
      await loginGuard.recordFailure(username);
      await recordDenied(context, eventCode, 'ACCOUNT_INACTIVE', user, details);
      throw new AuthError('ACCOUNT_INACTIVE', 401, '用户名或密码错误');
    }
    if (!user.local_login_enabled) {
      await loginGuard.recordFailure(username);
      await recordDenied(context, eventCode, emergency ? 'EMERGENCY_LOGIN_FORBIDDEN' : 'LOCAL_LOGIN_NOT_ALLOWED', user, details);
      throw new AuthError(emergency ? 'EMERGENCY_LOGIN_FORBIDDEN' : 'LOCAL_LOGIN_NOT_ALLOWED', 401, '用户名或密码错误');
    }
    const authorizationResult = await authorization(user.id);
    if (emergency && !authorizationResult.isSuperAdmin) {
      await loginGuard.recordFailure(username);
      await recordDenied(context, eventCode, 'EMERGENCY_LOGIN_FORBIDDEN', user, details);
      throw new AuthError('EMERGENCY_LOGIN_FORBIDDEN', 401, '用户名或密码错误');
    }
    await loginGuard.clearFailures(username);
    return transaction(async (tx) => {
      const pair = await sessionService.issueTokenPair({ userId: user.id, username: user.username, rememberMe: sessionService.parseRememberMe(command.rememberMe), deviceInfo: command.deviceInfo, ipAddress: command.ip, mustChangePassword: !!user.must_change_password, transaction: tx });
      await audit.record(userContext(context, user), { eventCode, outcome: 'SUCCESS', reasonCode: null, target: userTarget(user), details }, { transaction: tx });
      return loginResult(user, authorizationResult, pair);
    });
  }

  async function loginDingtalk(command, context) {
    const config = configuration();
    if (!config.dingtalkEnabled) throw new AuthError('AUTH_CONFIGURATION_INVALID', 503, '钉钉登录未配置');
    let identity;
    try { identity = await identityClient.exchangeInternalCode(command.authCode); } catch (error) {
      if (error instanceof AuthError) { await recordDenied(context, 'AUTH.DINGTALK_LOGIN', error.code === 'DINGTALK_CORP_FORBIDDEN' ? error.code : 'DINGTALK_AUTH_FAILED', null, { loginChannel: 'dingtalk', accountCreated: false }); throw error; }
      await recordDenied(context, 'AUTH.DINGTALK_LOGIN', 'DINGTALK_AUTH_FAILED', null, { loginChannel: 'dingtalk', accountCreated: false });
      throw new AuthError('DINGTALK_AUTH_FAILED', 400, '钉钉登录失败');
    }
    return transaction(async (tx) => {
      const resolved = await identityResolver(identity, { transaction: tx, expectedCorpId: config.dingtalkCorpId });
      if (!resolved.user.is_active) {
        await audit.record(userContext(context, resolved.user), { eventCode: 'AUTH.DINGTALK_LOGIN', outcome: 'DENIED', reasonCode: 'ACCOUNT_INACTIVE', target: userTarget(resolved.user), details: { loginChannel: 'dingtalk', accountCreated: resolved.created } }, { transaction: tx });
        throw new AuthError('ACCOUNT_INACTIVE', 403, '钉钉登录失败');
      }
      const authorizationResult = await authorization(resolved.user.id, { transaction: tx });
      const pair = await sessionService.issueTokenPair({ userId: resolved.user.id, username: resolved.user.username, rememberMe: sessionService.parseRememberMe(command.rememberMe), deviceInfo: command.deviceInfo, ipAddress: command.ip, mustChangePassword: false, transaction: tx });
      await audit.record(userContext(context, resolved.user), { eventCode: 'AUTH.DINGTALK_LOGIN', outcome: 'SUCCESS', reasonCode: null, target: userTarget(resolved.user), details: { loginChannel: 'dingtalk', accountCreated: resolved.created } }, { transaction: tx });
      return loginResult(resolved.user, authorizationResult, pair);
    });
  }

  async function refresh(rawRefreshToken, command, context) {
    const record = await sessionService.findRefreshToken(rawRefreshToken);
    if (!record) throw new AuthError('UNAUTHORIZED', 401, '会话已失效');
    if (record.revoked_at || record.expires_at <= new Date()) {
      if (record.revoked_at && record.replaced_by) {
        const revokedSessionCount = await sessionService.revokeUserSessions(record.user_id);
        const user = await UserModel.findByPk(record.user_id);
        if (user && await shouldRecordTokenReuse(user.id)) await audit.record(userContext(context, user), { eventCode: 'AUTH.REFRESH_TOKEN_REUSE_DETECTED', outcome: 'SUCCESS', reasonCode: null, target: userTarget(user), details: { revokedSessionCount } });
      }
      throw new AuthError('UNAUTHORIZED', 401, '会话已失效');
    }
    return transaction(async (tx) => {
      const user = await UserModel.findByPk(record.user_id, { transaction: tx, lock: tx.LOCK.UPDATE });
      if (!user || !user.is_active) { if (user) await sessionService.revokeUserSessions(user.id, { transaction: tx }); throw new AuthError('ACCOUNT_INACTIVE', 403, '账户不可用'); }
      const pair = await sessionService.rotateRefreshToken({ rawToken: rawRefreshToken, userId: user.id, username: user.username, rememberMe: !!record.remember_me, deviceInfo: command.deviceInfo, ipAddress: command.ip, mustChangePassword: !!user.must_change_password, transaction: tx });
      if (!pair) throw new AuthError('UNAUTHORIZED', 401, '会话已失效');
      return { token: pair.accessToken, refreshToken: pair.refreshToken, refreshTokenMaxAgeMs: pair.refreshTokenMaxAgeMs };
    });
  }

  async function logout(rawRefreshToken, context) {
    const record = await sessionService.findRefreshToken(rawRefreshToken);
    if (!record) return;
    await transaction(async (tx) => {
      await record.update({ revoked_at: new Date() }, { transaction: tx });
      const user = await UserModel.findByPk(record.user_id, { transaction: tx });
      if (user) await audit.record(userContext(context, user), { eventCode: 'AUTH.LOGOUT', outcome: 'SUCCESS', reasonCode: null, target: userTarget(user), details: { sessionRevoked: true } }, { transaction: tx });
    });
  }

  async function completeInitialPassword(userId, password, command, context) {
    return transaction(async (tx) => {
      const user = await UserModel.findByPk(userId, { transaction: tx, lock: tx.LOCK.UPDATE });
      if (!user) throw new AuthError('UNAUTHORIZED', 401, '未登录');
      if (!user.must_change_password) throw new AuthError('PASSWORD_CHANGE_NOT_REQUIRED', 403, '无需修改初始密码');
      try { await credentialService.setLocalPassword(user.id, password, { transaction: tx }); } catch (error) {
        if (error instanceof AuthError && error.code === 'PASSWORD_POLICY_VIOLATION') await audit.record(userContext(context, user), { eventCode: 'AUTH.INITIAL_PASSWORD_CHANGED', outcome: 'DENIED', reasonCode: error.code, target: userTarget(user), details: {} }, { transaction: tx });
        throw error;
      }
      await sessionService.revokeUserSessions(user.id, { transaction: tx });
      const pair = await sessionService.issueTokenPair({ userId: user.id, username: user.username, rememberMe: sessionService.parseRememberMe(command.rememberMe), deviceInfo: command.deviceInfo, ipAddress: command.ip, mustChangePassword: false, transaction: tx });
      await audit.record(userContext(context, user), { eventCode: 'AUTH.INITIAL_PASSWORD_CHANGED', outcome: 'SUCCESS', reasonCode: null, target: userTarget(user), details: {} }, { transaction: tx });
      return { token: pair.accessToken, refreshToken: pair.refreshToken, refreshTokenMaxAgeMs: pair.refreshTokenMaxAgeMs };
    });
  }

  async function getAuthenticatedUser(userId) {
    const user = await UserModel.findByPk(userId);
    if (!user || !user.is_active) throw new AuthError('FORBIDDEN', 403, '账户不可用');
    const authorizationResult = await authorization(user.id);
    return { id: user.id, username: user.username, email: user.email, mustChangePassword: !!user.must_change_password, authorization: authorizationResult };
  }

  return { loginLocal: (command, context) => passwordLogin(command, context), loginEmergency: (command, context) => passwordLogin(command, context, { emergency: true }), loginDingtalk, refresh, logout, completeInitialPassword, getAuthenticatedUser, getLoginOptions: () => { const c = configuration(); return { dingtalkEnabled: c.dingtalkEnabled, localLoginEnabled: c.localLoginEnabled, emergencyLoginEnabled: true }; } };
}

module.exports = { createAuthenticationService, authenticationService: createAuthenticationService() };
