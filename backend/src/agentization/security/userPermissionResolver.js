const { Op } = require('sequelize');
const UserRole = require('../../models/user_role');
const Role = require('../../models/role');
const Permission = require('../../models/permission');
const legacyRoles = require('../../config/roles');

function normalizeUserId(raw) {
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n;
  return null;
}

async function loadUserRoles(userId) {
  return UserRole.findAll({
    where: { user_id: userId },
    include: [{ model: Role, as: 'Role', attributes: ['id', 'name'] }]
  });
}

function hasAdminRole(userRoles = []) {
  return userRoles.some((row) => String(row?.Role?.name || '').trim().toLowerCase() === 'admin');
}

async function loadDbPermissionsByRoleIds(roleIds) {
  if (!Array.isArray(roleIds) || roleIds.length === 0) return [];
  const perms = await Permission.findAll({
    include: [{ model: Role, as: 'roles', where: { id: { [Op.in]: roleIds } }, attributes: [] }],
    attributes: ['name']
  });
  return perms.map((p) => String(p?.name || '').trim()).filter(Boolean);
}

async function resolveUserPermissions(user) {
  const userId = normalizeUserId(user?.id);
  if (!userId) return [];

  const userRoles = await loadUserRoles(userId);
  if (!userRoles || userRoles.length === 0) return [];

  if (hasAdminRole(userRoles)) {
    return Array.from(new Set(legacyRoles.getUserPermissions(userRoles)));
  }

  const roleIds = userRoles.map((x) => Number(x?.role_id || 0)).filter((x) => Number.isFinite(x) && x > 0);
  const dbPermissions = await loadDbPermissionsByRoleIds(roleIds);
  if (dbPermissions.length > 0) return Array.from(new Set(dbPermissions));

  return Array.from(new Set(legacyRoles.getUserPermissions(userRoles)));
}

module.exports = {
  resolveUserPermissions
};
