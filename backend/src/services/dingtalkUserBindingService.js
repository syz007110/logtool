const { ulid } = require('ulid');
const User = require('../models/user');
const { assignDefaultRole } = require('./userRoleService');
const { AuthError } = require('./authErrors');
const { getAuthConfiguration } = require('./authConfiguration');

function normalize(value) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizeIdentity(identity = {}) {
  return { corpId: normalize(identity.corpId), userId: normalize(identity.userId), unionId: normalize(identity.unionId), nick: normalize(identity.nick) || '' };
}

async function resolveOrCreateDingtalkUser(input, { transaction, expectedCorpId, UserModel = User } = {}) {
  const identity = normalizeIdentity(input);
  if (!identity.corpId || !identity.userId || !identity.unionId) throw new AuthError('DINGTALK_AUTH_FAILED', 400, '钉钉登录失败');
  if (!expectedCorpId || identity.corpId !== expectedCorpId) throw new AuthError('DINGTALK_CORP_FORBIDDEN', 403, '钉钉登录失败');

  const byCorpUser = await UserModel.findOne({ where: { dingtalk_corp_id: identity.corpId, dingtalk_userid: identity.userId }, transaction, lock: transaction?.LOCK.UPDATE });
  const byUnion = await UserModel.findOne({ where: { dingtalk_unionid: identity.unionId }, transaction, lock: transaction?.LOCK.UPDATE });
  if (byCorpUser && byUnion && byCorpUser.id !== byUnion.id) throw new AuthError('DINGTALK_AUTH_FAILED', 400, '钉钉登录失败');

  let user = byCorpUser || byUnion;
  let created = false;
  if (!user) {
    user = await UserModel.create({
      username: `dd_${ulid()}`,
      password_hash: null,
      is_active: true,
      local_login_enabled: false,
      dingtalk_corp_id: identity.corpId,
      dingtalk_userid: identity.userId,
      dingtalk_unionid: identity.unionId,
      dingtalk_nick: identity.nick || null,
      dingtalk_bound_at: new Date()
    }, { transaction });
    await assignDefaultRole(user.id, { transaction });
    created = true;
  } else {
    if (user.dingtalk_corp_id !== identity.corpId || user.dingtalk_userid !== identity.userId || user.dingtalk_unionid !== identity.unionId) throw new AuthError('DINGTALK_AUTH_FAILED', 400, '钉钉登录失败');
    if (identity.nick && user.dingtalk_nick !== identity.nick) await user.update({ dingtalk_nick: identity.nick }, { transaction });
  }
  return { user, created, identity };
}

// Compatibility entry point for non-login DingTalk adapters. It intentionally
// uses the same strict enterprise identity rules; payloads without a verified
// unionId are not silently matched by mobile number or bare userId.
async function resolveOrBindDingtalkUser(input, options = {}) {
  return resolveOrCreateDingtalkUser(input, {
    ...options,
    expectedCorpId: options.expectedCorpId || getAuthConfiguration().dingtalkCorpId
  });
}

module.exports = { normalizeIdentity, resolveOrCreateDingtalkUser, resolveOrBindDingtalkUser };
