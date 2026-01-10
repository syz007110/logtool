const Role = require('../models/role');
const Permission = require('../models/permission');
const RolePermission = require('../models/role_permission');
const UserRole = require('../models/user_role');
const User = require('../models/user');
const { Op } = require('sequelize');
const { logOperation } = require('../utils/operationLogger');
const { normalizePagination, MAX_PAGE_SIZE } = require('../constants/pagination');

// 查询角色列表（包含权限）- 支持分页和搜索
const getRoles = async (req, res) => {
  try {
    const { search = '' } = req.query;
    const { page, limit } = normalizePagination(req.query.page, req.query.limit, MAX_PAGE_SIZE.STANDARD);
    const where = {};
    
    // 搜索条件
    if (search) {
      const like = { [Op.like]: `%${search}%` };
      where[Op.or] = [
        { name: like },
        { description: like }
      ];
    }
    
    // 使用 findAndCountAll 实现分页
    const { count: total, rows: roles } = await Role.findAndCountAll({
      where,
      distinct: true, // 修复：使用 distinct 避免多对多关联导致的重复计数
      include: [
        { model: Permission, as: 'permissions', attributes: ['name'], through: { attributes: [] } },
        { model: User, as: 'users', attributes: ['id'], through: { attributes: [] } }
      ],
      offset: (page - 1) * limit,
      limit,
      order: [['id', 'DESC']]
    });
    
    const data = roles.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      userCount: Array.isArray(r.users) ? r.users.length : 0,
      permissions: (r.permissions || []).map(p => p.name)
    }));
    
    res.json({ roles: data, total });
  } catch (err) {
    res.status(500).json({ message: '查询失败', error: err.message });
  }
};

  // 新建角色（可附带权限）
const createRole = async (req, res) => {
  const t = await Role.sequelize.transaction();
  try {
    const { name, description, permissions } = req.body;
    if (!name) return res.status(400).json({ message: '角色名不能为空' });

    const exist = await Role.findOne({ where: { name } });
    if (exist) return res.status(409).json({ message: '角色已存在' });

    const role = await Role.create({ name, description }, { transaction: t });

    if (Array.isArray(permissions) && permissions.length > 0) {
      const normalized = permissions.map(p => String(p).trim());
      const perms = await Permission.findAll({ where: { name: { [Op.in]: normalized } } });
      if (perms.length !== normalized.length) {
        const found = new Set(perms.map(p => p.name));
        const missing = normalized.filter(n => !found.has(n));
        await t.rollback();
        return res.status(400).json({ message: '存在未知权限', missing });
      }
      const rows = perms.map(p => ({ role_id: role.id, permission_id: p.id }));
      if (rows.length > 0) {
        await RolePermission.bulkCreate(rows, { transaction: t, ignoreDuplicates: true });
      }
    }

    await t.commit();
    // 读取最新权限返回
    const savedPerms = await Permission.findAll({
      include: [{ model: Role, as: 'roles', where: { id: role.id }, attributes: [] }],
      attributes: ['name']
    });
    // 操作日志
    try {
      await logOperation({
        operation: '新增角色',
        description: `新增角色: ${role.name}`,
        user_id: req.user?.id,
        username: req.user?.username,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        details: { role_id: role.id, permissions: savedPerms.map(p => p.name) }
      });
    } catch (_) {}

    res.status(201).json({ message: '创建成功', role: { id: role.id, name: role.name, description: role.description, permissions: savedPerms.map(p => p.name) } });
  } catch (err) {
    await t.rollback();
    res.status(500).json({ message: '创建失败', error: err.message });
  }
};

// 修改角色（可更新权限）
const updateRole = async (req, res) => {
  const t = await Role.sequelize.transaction();
  try {
    const { id } = req.params;
    const { name, description, permissions } = req.body;
    const role = await Role.findByPk(id);
    if (!role) return res.status(404).json({ message: '未找到角色' });

    // 管理员角色保护：禁止修改管理员角色名称与权限
    const normalize = (s) => (s || '').toString().trim().toLowerCase();
    const isAdminRole = normalize(role.name) === 'admin' || role.name === '管理员';
    if (isAdminRole) {
      if (name && normalize(name) !== 'admin' && name !== '管理员') {
        return res.status(400).json({ message: '管理员角色名称不可修改' });
      }
      if (Array.isArray(permissions)) {
        return res.status(400).json({ message: '管理员角色权限不可修改' });
      }
    }

    await role.update({ name, description }, { transaction: t });

    if (Array.isArray(permissions)) {
      await RolePermission.destroy({ where: { role_id: role.id }, transaction: t });
      if (permissions.length > 0) {
        const normalized = permissions.map(p => String(p).trim());
        const perms = await Permission.findAll({ where: { name: { [Op.in]: normalized } } });
        if (perms.length !== normalized.length) {
          const found = new Set(perms.map(p => p.name));
          const missing = normalized.filter(n => !found.has(n));
          await t.rollback();
          return res.status(400).json({ message: '存在未知权限', missing });
        }
        const rows = perms.map(p => ({ role_id: role.id, permission_id: p.id }));
        if (rows.length > 0) {
          await RolePermission.bulkCreate(rows, { transaction: t });
        }
      }
    }

    await t.commit();
    // 读取最新权限返回
    const savedPerms = await Permission.findAll({
      include: [{ model: Role, as: 'roles', where: { id: role.id }, attributes: [] }],
      attributes: ['name']
    });
    // 操作日志
    try {
      await logOperation({
        operation: '修改角色',
        description: `修改角色: ${role.name}`,
        user_id: req.user?.id,
        username: req.user?.username,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        details: { role_id: role.id, permissions: savedPerms.map(p => p.name) }
      });
    } catch (_) {}

    res.json({ message: '更新成功', role: { id: role.id, name: role.name, description: role.description, permissions: savedPerms.map(p => p.name) } });
  } catch (err) {
    await t.rollback();
    res.status(500).json({ message: '更新失败', error: err.message });
  }
};

// 删除角色
const deleteRole = async (req, res) => {
  const t = await Role.sequelize.transaction();
  try {
    const { id } = req.params;
    const role = await Role.findByPk(id);
    if (!role) return res.status(404).json({ message: '未找到角色' });

    // 保护内置角色：admin / expert / user 不允许删除
    const name = String(role.name || '').toLowerCase();
    if (name === 'admin' || name === 'expert' || name === 'user') {
      return res.status(400).json({ message: '内置角色不允许删除' });
    }

    // 被用户引用保护：若仍有用户分配该角色则禁止删除（检查所有分配关系，不管 is_active 状态）
    const assignedCount = await UserRole.count({ where: { role_id: role.id } });
    if (assignedCount > 0) {
      return res.status(400).json({ message: `该角色已分配给 ${assignedCount} 个用户，不能删除` });
    }

    await RolePermission.destroy({ where: { role_id: role.id }, transaction: t });
    await role.destroy({ transaction: t });

    await t.commit();

    // 操作日志
    try {
      await logOperation({
        operation: '删除角色',
        description: `删除角色: ${role.name}`,
        user_id: req.user?.id,
        username: req.user?.username,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        details: { role_id: role.id, role_name: role.name }
      });
    } catch (_) {}

    res.json({ message: '删除成功' });
  } catch (err) {
    await t.rollback();
    res.status(500).json({ message: '删除失败', error: err.message });
  }
};

module.exports = {
  getRoles,
  createRole,
  updateRole,
  deleteRole
}; 