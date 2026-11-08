const bcrypt = require('bcryptjs');
const User = require('../models/user');
const { validatePasswordStrength } = require('../utils/passwordStrength');
const { AuthError } = require('./authErrors');

async function setLocalPassword(userId, rawPassword, { transaction, UserModel = User } = {}) {
  const user = await UserModel.findByPk(userId, { transaction, lock: transaction?.LOCK.UPDATE });
  if (!user) throw new AuthError('UNAUTHORIZED', 401, '未登录');
  const result = validatePasswordStrength(String(rawPassword || ''), user.username);
  if (!result.valid) throw new AuthError('PASSWORD_POLICY_VIOLATION', 400, '新密码不符合安全要求');
  await user.update({ password_hash: await bcrypt.hash(rawPassword, 12), must_change_password: false }, { transaction });
  return user;
}

module.exports = { setLocalPassword };
