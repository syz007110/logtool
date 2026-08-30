const bcrypt = require('bcryptjs');

const User = require('../models/user');
const UserRole = require('../models/user_role');

function normalizeValue(value) {
  const text = String(value || '').trim();
  return text || null;
}

function buildNormalizedIdentity(identity = {}) {
  return {
    unionId: normalizeValue(identity.unionId),
    userId: normalizeValue(identity.userId || identity.staffId || identity.senderStaffId || identity.senderId),
    mobile: normalizeValue(identity.mobile),
    nick: normalizeValue(identity.nick || identity.name || identity.senderNick),
    corpId: normalizeValue(identity.corpId || identity.senderCorpId)
  };
}

async function ensureDefaultRole(userId, options = {}) {
  const UserRoleModel = options.UserRoleModel || UserRole;
  const exists = await UserRoleModel.findOne({ where: { user_id: userId } });
  if (exists) return;
  await UserRoleModel.create({
    user_id: userId,
    role_id: 3,
    assigned_by: userId,
    notes: 'DingTalk auto-bind'
  });
}

async function findExistingUser(identity, options = {}) {
  const UserModel = options.UserModel || User;
  if (identity.unionId) {
    const byUnionId = await UserModel.findOne({ where: { dingtalk_unionid: identity.unionId } });
    if (byUnionId) return byUnionId;
  }
  if (identity.userId) {
    const byUserId = await UserModel.findOne({ where: { dingtalk_userid: identity.userId } });
    if (byUserId) return byUserId;
  }
  if (identity.mobile) {
    const byMobile = await UserModel.findOne({ where: { dingtalk_mobile: identity.mobile } });
    if (byMobile) return byMobile;
  }
  return null;
}

function applyIdentityToUser(user, identity) {
  if (identity.unionId && user.dingtalk_unionid !== identity.unionId) {
    user.dingtalk_unionid = identity.unionId;
  }
  if (identity.userId && user.dingtalk_userid !== identity.userId) {
    user.dingtalk_userid = identity.userId;
  }
  if (identity.mobile && user.dingtalk_mobile !== identity.mobile) {
    user.dingtalk_mobile = identity.mobile;
  }
  if (identity.nick && user.dingtalk_nick !== identity.nick) {
    user.dingtalk_nick = identity.nick;
  }
}

async function createDingtalkUser(identity, options = {}) {
  const UserModel = options.UserModel || User;
  const seed = identity.userId || identity.unionId || identity.mobile || `guest_${Date.now()}`;
  const username = `dd_${seed}`;
  const passwordHash = await bcrypt.hash(`dd_${seed}_${Date.now()}`, 10);
  return UserModel.create({
    username,
    password_hash: passwordHash,
    email: null,
    dingtalk_unionid: identity.unionId,
    dingtalk_userid: identity.userId,
    dingtalk_mobile: identity.mobile,
    dingtalk_nick: identity.nick
  });
}

async function resolveOrBindDingtalkUser(identityInput = {}, options = {}) {
  const allowCreate = options.allowCreate !== false;
  const identity = buildNormalizedIdentity(identityInput);
  if (!identity.unionId && !identity.userId && !identity.mobile) {
    return null;
  }

  let user = await findExistingUser(identity, options);
  let created = false;
  if (!user && !allowCreate) {
    return null;
  }
  if (!user) {
    user = await createDingtalkUser(identity, options);
    created = true;
  } else {
    applyIdentityToUser(user, identity);
    await user.save();
  }

  await ensureDefaultRole(user.id, options);
  return {
    user,
    created,
    identity
  };
}

module.exports = {
  buildNormalizedIdentity,
  ensureDefaultRole,
  resolveOrBindDingtalkUser
};
