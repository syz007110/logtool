const { sequelize } = require('../models');
const User = require('../models/user');
const Role = require('../models/role');
const UserRole = require('../models/user_role');
const { auditService } = require('./auditService');
const { RbacError } = require('./rbacErrors');

function now() { return new Date(); }
async function lockInvariant(transaction) {
  await sequelize.query('SELECT id FROM rbac_invariant_lock WHERE id = 1 FOR UPDATE', { transaction });
}
async function effectiveRoleCodes(userId, transaction) {
  const rows = await UserRole.findAll({ where: { user_id: userId }, transaction, include: [{ model: Role, as: 'Role', attributes: ['code', 'is_super_admin'] }] });
  return rows.map((row) => row.Role).filter(Boolean);
}
async function activeSuperAdminCount(transaction) {
  const [rows] = await sequelize.query(`SELECT COUNT(DISTINCT u.id) AS total FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id WHERE u.is_active = TRUE AND r.is_super_admin = TRUE`, { transaction });
  return Number(rows[0]?.total || 0);
}
async function assertSuperAdminInvariant(transaction, targetUser, targetRoles, action, auditContext, wasSuperAdmin = false) {
  const targetHasSuper = targetRoles.some((role) => role.is_super_admin);
  if (wasSuperAdmin && targetUser.is_active && !targetHasSuper && await activeSuperAdminCount(transaction) <= 1) {
    // A denied operation rolls its business transaction back; its audit fact is intentionally recorded independently.
    await auditService.record(auditContext, { eventCode: 'RBAC.LAST_SUPER_ADMIN_PROTECTED', outcome: 'DENIED', reasonCode: 'RBAC.LAST_SUPER_ADMIN_PROTECTED', target: { type: 'USER', id: targetUser.id }, details: { context: { attemptedAction: action, remainingActiveSuperAdminCount: 1 } } });
    throw new RbacError('LAST_SUPER_ADMIN_REQUIRED', 422, '系统必须保留至少一名启用的超级管理员');
  }
}
async function replaceUserRoles(userId, roleIds, auditContext) {
  if (!Array.isArray(roleIds) || !roleIds.length) throw new RbacError('USER_REQUIRES_ROLE', 422, '用户必须至少拥有一个角色');
  const uniqueIds = [...new Set(roleIds.map(Number))];
  if (uniqueIds.some((id) => !Number.isInteger(id) || id <= 0)) throw new RbacError('INVALID_ROLE_ASSIGNMENT', 422, '角色标识无效');
  return sequelize.transaction(async (transaction) => {
    await lockInvariant(transaction);
    const user = await User.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user) throw new RbacError('USER_NOT_FOUND', 404, '用户不存在');
    const roles = await Role.findAll({ where: { id: uniqueIds }, transaction, lock: transaction.LOCK.UPDATE });
    if (roles.length !== uniqueIds.length) throw new RbacError('INVALID_ROLE_ASSIGNMENT', 422, '包含不存在的角色');
    const before = await effectiveRoleCodes(user.id, transaction);
    await assertSuperAdminInvariant(transaction, user, roles, 'replace_roles', auditContext, before.some((role) => role.is_super_admin));
    await UserRole.destroy({ where: { user_id: user.id }, transaction });
    await UserRole.bulkCreate(roles.map((role) => ({ user_id: user.id, role_id: role.id, created_at: now() })), { transaction });
    const eventCode = roles.some((role) => role.is_super_admin) || before.some((role) => role.is_super_admin) ? 'RBAC.SUPER_ADMIN_ROLE_REASSIGNED' : 'RBAC.USER_ROLE_REASSIGNED';
    await auditService.record(auditContext, { eventCode, outcome: 'SUCCESS', target: { type: 'USER', id: user.id }, details: { before: { roleCodes: before.map((role) => role.code) }, after: { roleCodes: roles.map((role) => role.code) } } }, { transaction });
    return roles.map((role) => role.code);
  });
}
async function assignDefaultRole(userId, { transaction } = {}) {
  const role = await Role.findOne({ where: { code: 'user' }, transaction });
  if (!role) throw new Error('RBAC user role is not initialized');
  await UserRole.create({ user_id: userId, role_id: role.id, created_at: now() }, { transaction });
}
async function assertCanDeactivateOrDelete(userId, action, auditContext, transaction) {
  await lockInvariant(transaction);
  const user = await User.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!user) throw new RbacError('USER_NOT_FOUND', 404, '用户不存在');
  const before = await effectiveRoleCodes(user.id, transaction);
  await assertSuperAdminInvariant(transaction, user, [], action, auditContext, before.some((role) => role.is_super_admin));
}
module.exports = { assignDefaultRole, assertCanDeactivateOrDelete, replaceUserRoles };
