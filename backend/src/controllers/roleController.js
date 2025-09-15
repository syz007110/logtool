const Role = require('../models/role');
const Permission = require('../models/permission');
const RolePermission = require('../models/role_permission');

// 查询角色列表（包含权限）
const getRoles = async (req, res) => {
  try {
    const roles = await Role.findAll({
      include: [{ model: Permission, as: 'permissions', attributes: ['name'] }]
    });
    const data = roles.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      permissions: (r.permissions || []).map(p => p.name)
    }));
    res.json({ roles: data });
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
      const perms = await Permission.findAll({ where: { name: { [Permission.sequelize.Op.in]: permissions } } });
      const permIds = perms.map(p => p.id);
      if (permIds.length > 0) {
        const rows = permIds.map(pid => ({ role_id: role.id, permission_id: pid }));
        await RolePermission.bulkCreate(rows, { transaction: t, ignoreDuplicates: true });
      }
    }

    await t.commit();
    res.status(201).json({ message: '创建成功', role: { id: role.id, name: role.name, description: role.description, permissions: permissions || [] } });
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

    await role.update({ name, description }, { transaction: t });

    if (Array.isArray(permissions)) {
      await RolePermission.destroy({ where: { role_id: role.id }, transaction: t });
      if (permissions.length > 0) {
        const perms = await Permission.findAll({ where: { name: { [Permission.sequelize.Op.in]: permissions } } });
        const rows = perms.map(p => ({ role_id: role.id, permission_id: p.id }));
        if (rows.length > 0) {
          await RolePermission.bulkCreate(rows, { transaction: t });
        }
      }
    }

    await t.commit();
    res.json({ message: '更新成功', role: { id: role.id, name: role.name, description: role.description, permissions: permissions || undefined } });
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

    await RolePermission.destroy({ where: { role_id: role.id }, transaction: t });
    await role.destroy({ transaction: t });

    await t.commit();
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