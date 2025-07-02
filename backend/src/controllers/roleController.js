const Role = require('../models/role');

// 查询角色列表
const getRoles = async (req, res) => {
  try {
    const roles = await Role.findAll();
    res.json({ roles });
  } catch (err) {
    res.status(500).json({ message: '查询失败', error: err.message });
  }
};

// 新建角色
const createRole = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ message: '角色名不能为空' });
    const exist = await Role.findOne({ where: { name } });
    if (exist) return res.status(409).json({ message: '角色已存在' });
    const role = await Role.create({ name, description });
    res.status(201).json({ message: '创建成功', role });
  } catch (err) {
    res.status(500).json({ message: '创建失败', error: err.message });
  }
};

// 修改角色
const updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    const role = await Role.findByPk(id);
    if (!role) return res.status(404).json({ message: '未找到角色' });
    await role.update({ name, description });
    res.json({ message: '更新成功', role });
  } catch (err) {
    res.status(500).json({ message: '更新失败', error: err.message });
  }
};

// 删除角色
const deleteRole = async (req, res) => {
  try {
    const { id } = req.params;
    const role = await Role.findByPk(id);
    if (!role) return res.status(404).json({ message: '未找到角色' });
    await role.destroy();
    res.json({ message: '删除成功' });
  } catch (err) {
    res.status(500).json({ message: '删除失败', error: err.message });
  }
};

module.exports = {
  getRoles,
  createRole,
  updateRole,
  deleteRole
}; 