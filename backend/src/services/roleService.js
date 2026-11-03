const { Op } = require('sequelize');
const { sequelize } = require('../models');
const Role = require('../models/role');
const Permission = require('../models/permission');
const RolePermission = require('../models/role_permission');
const UserRole = require('../models/user_role');
const { auditService } = require('./auditService');
const { RbacError } = require('./rbacErrors');

const CODE = /^[a-z][a-z0-9_:-]{1,63}$/;
function now() { return new Date(); }
function validateCode(code) { if (!CODE.test(String(code || ''))) throw new RbacError('INVALID_ROLE_CODE', 400, '角色代码格式无效'); }
async function resolvePermissions(permissionCodes, transaction) {
  const codes = [...new Set((permissionCodes || []).map(String))];
  const rows = await Permission.findAll({ where: { code: { [Op.in]: codes } }, transaction });
  if (rows.length !== codes.length) throw new RbacError('INVALID_PERMISSION_CODE', 422, '包含不存在的权限代码');
  return rows;
}
async function replacePermissions(role, permissionCodes, transaction) {
  if (role.is_super_admin) throw new RbacError('SUPER_ADMIN_PERMISSIONS_IMMUTABLE', 422, '超级管理员权限不可修改');
  const permissions = await resolvePermissions(permissionCodes, transaction);
  await RolePermission.destroy({ where: { role_id: role.id }, transaction });
  if (permissions.length) await RolePermission.bulkCreate(permissions.map((p) => ({ role_id: role.id, permission_id: p.id, created_at: now() })), { transaction });
}
function serialize(role, permissions = []) { return { id: role.id, code: role.code, nameZh: role.name_zh, nameEn: role.name_en, isSystem: !!role.is_system, isSuperAdmin: !!role.is_super_admin, scopeType: role.scope_type, scopeId: role.scope_id, permissionCodes: permissions.map((p) => p.code).sort() }; }
async function get(roleId, { transaction } = {}) {
  const role = await Role.findByPk(roleId, { transaction, include: [{ model: Permission, as: 'permissions', attributes: ['code'], through: { attributes: [] } }] });
  if (!role) throw new RbacError('ROLE_NOT_FOUND', 404, '角色不存在');
  return serialize(role, role.permissions);
}
async function list({ page = 1, limit = 20 } = {}) {
  const result = await Role.findAndCountAll({ limit, offset: (page - 1) * limit, order: [['created_at', 'DESC']], include: [{ model: Permission, as: 'permissions', attributes: ['code'], through: { attributes: [] } }] });
  return { total: result.count, roles: result.rows.map((r) => serialize(r, r.permissions)) };
}
async function create(command, req) {
  validateCode(command.code);
  return sequelize.transaction(async (transaction) => {
    if (await Role.findOne({ where: { code: command.code }, transaction })) throw new RbacError('ROLE_CODE_EXISTS', 409, '角色代码已存在');
    const role = await Role.create({ code: command.code, name_zh: command.nameZh, name_en: command.nameEn, is_system: false, is_super_admin: false, scope_type: 'platform', scope_id: 0, created_at: now(), updated_at: now() }, { transaction });
    await replacePermissions(role, command.permissionCodes || [], transaction);
    await auditService.record(req, { eventCode: 'RBAC.ROLE_CREATED', outcome: 'SUCCESS', target: { type: 'ROLE', id: role.id }, details: { roleCode: role.code } }, { transaction });
    return get(role.id, { transaction });
  });
}
async function update(roleId, command, req) {
  return sequelize.transaction(async (transaction) => {
    const role = await Role.findByPk(roleId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!role) throw new RbacError('ROLE_NOT_FOUND', 404, '角色不存在');
    if (role.is_system && (command.nameZh !== undefined || command.nameEn !== undefined)) throw new RbacError('SYSTEM_ROLE_FIELDS_IMMUTABLE', 422, '系统角色信息不可修改');
    if (command.nameZh !== undefined || command.nameEn !== undefined) {
      await role.update({ name_zh: command.nameZh ?? role.name_zh, name_en: command.nameEn ?? role.name_en, updated_at: now() }, { transaction });
      await auditService.record(req, { eventCode: 'RBAC.ROLE_UPDATED', outcome: 'SUCCESS', target: { type: 'ROLE', id: role.id }, details: { roleCode: role.code } }, { transaction });
    }
    if (command.permissionCodes !== undefined) {
      const beforePermissions = await RolePermission.findAll({
        where: { role_id: role.id },
        attributes: [],
        include: [{ model: Permission, as: 'permission', attributes: ['code'] }],
        transaction
      });
      const beforeCodes = beforePermissions.map((link) => link.permission.code).sort();
      await replacePermissions(role, command.permissionCodes, transaction);
      await auditService.record(req, { eventCode: 'RBAC.ROLE_PERMISSIONS_UPDATED', outcome: 'SUCCESS', target: { type: 'ROLE', id: role.id }, details: { before: { permissionCodes: beforeCodes }, after: { permissionCodes: [...new Set(command.permissionCodes.map(String))].sort() } } }, { transaction });
    }
    return get(role.id, { transaction });
  });
}
async function remove(roleId, req) {
  return sequelize.transaction(async (transaction) => {
    const role = await Role.findByPk(roleId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!role) throw new RbacError('ROLE_NOT_FOUND', 404, '角色不存在');
    if (role.is_system) throw new RbacError('SYSTEM_ROLE_DELETE_FORBIDDEN', 422, '系统角色不可删除');
    if (await UserRole.count({ where: { role_id: role.id }, transaction, lock: transaction.LOCK.UPDATE })) throw new RbacError('ROLE_ASSIGNED_TO_USERS', 409, '角色仍被用户使用');
    await role.destroy({ transaction });
    await auditService.record(req, { eventCode: 'RBAC.ROLE_DELETED', outcome: 'SUCCESS', target: { type: 'ROLE', id: role.id }, details: { roleCode: role.code } }, { transaction });
  });
}
module.exports = { create, get, list, remove, update };
