const User = require('../models/user');
const Role = require('../models/role');
const UserRole = require('../models/user_role');
const bcrypt = require('bcryptjs');

// 查询用户列表
const getUsers = async (req, res) => {
  try {
    const users = await User.findAll({ attributes: { exclude: ['password_hash'] } });
    res.json({ users });
  } catch (err) {
    res.status(500).json({ message: '查询失败', error: err.message });
  }
};

// 新建用户
const createUser = async (req, res) => {
  try {
    const { username, password, email, roles = [] } = req.body;
    if (!username || !password) return res.status(400).json({ message: '用户名和密码不能为空' });
    const exist = await User.findOne({ where: { username } });
    if (exist) return res.status(409).json({ message: '用户名已存在' });
    const password_hash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, password_hash, email });
    // 分配角色
    for (const roleId of roles) {
      await UserRole.create({ user_id: user.id, role_id: roleId });
    }
    res.status(201).json({ message: '创建成功', user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    res.status(500).json({ message: '创建失败', error: err.message });
  }
};

// 修改用户信息
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, is_active, roles } = req.body;
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ message: '未找到用户' });
    await user.update({ email, is_active });
    if (Array.isArray(roles)) {
      await UserRole.destroy({ where: { user_id: id } });
      for (const roleId of roles) {
        await UserRole.create({ user_id: id, role_id: roleId });
      }
    }
    res.json({ message: '更新成功' });
  } catch (err) {
    res.status(500).json({ message: '更新失败', error: err.message });
  }
};

// 删除用户
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ message: '未找到用户' });
    await user.destroy();
    res.json({ message: '删除成功' });
  } catch (err) {
    res.status(500).json({ message: '删除失败', error: err.message });
  }
};

// 查询用户角色
const getUserRoles = async (req, res) => {
  try {
    const { id } = req.params;
    const roles = await UserRole.findAll({ where: { user_id: id } });
    res.json({ roles });
  } catch (err) {
    res.status(500).json({ message: '查询失败', error: err.message });
  }
};

module.exports = {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  getUserRoles
}; 