const { Op } = require('sequelize');
const User = require('../models/user');
const UserRole = require('../models/user_role');
const Role = require('../models/role');
const Permission = require('../models/permission');

async function getAuthorization(userId, { transaction } = {}) {
  const user = await User.findByPk(userId, { transaction, attributes: ['id', 'is_active'] });
  if (!user || !user.is_active) return { roles: [], isSuperAdmin: false, permissions: [] };
  const memberships = await UserRole.findAll({
    where: { user_id: userId }, transaction,
    include: [{ model: Role, as: 'Role', attributes: ['id', 'code', 'is_super_admin'] }]
  });
  const roles = memberships.map((row) => row.Role).filter(Boolean);
  const isSuperAdmin = roles.some((role) => role.is_super_admin);
  if (isSuperAdmin) return { roles: roles.map((role) => role.code), isSuperAdmin: true, permissions: [] };
  const roleIds = roles.map((role) => role.id);
  if (!roleIds.length) return { roles: [], isSuperAdmin: false, permissions: [] };
  const permissions = await Permission.findAll({
    attributes: ['code'], transaction,
    include: [{ model: Role, as: 'roles', attributes: [], where: { id: { [Op.in]: roleIds } }, through: { attributes: [] } }]
  });
  return { roles: roles.map((role) => role.code), isSuperAdmin: false, permissions: [...new Set(permissions.map((p) => p.code))].sort() };
}

async function hasPermission(userId, permission, options) {
  const authorization = await getAuthorization(userId, options);
  return authorization.isSuperAdmin || authorization.permissions.includes(permission);
}

module.exports = { getAuthorization, hasPermission };
