const User = require('../models/user');
const Role = require('../models/role');
const UserRole = require('../models/user_role');
const bcrypt = require('bcryptjs');
const { logOperation } = require('../utils/operationLogger');

// 查询用户列表
const getUsers = async (req, res) => {
  try {
    // 查询所有用户及其角色
    const users = await User.findAll({
      attributes: ['id', 'username', 'email', 'is_active', 'created_at'],
      include: [
        {
          model: UserRole,
          as: 'UserRoles',
          attributes: ['role_id'],
          required: false,
          include: [
            {
              model: Role,
              as: 'Role',
              attributes: ['name']
            }
          ]
        }
      ]
    });
    // 整理返回格式，合并角色
    const result = users.map(u => ({
      id: u.id,
      username: u.username,
      email: u.email,
      is_active: u.is_active,
      created_at: u.created_at,
      role: u.UserRoles && u.UserRoles.length > 0 && u.UserRoles[0].Role ? u.UserRoles[0].Role.name : null
    }));
    res.json({ users: result, total: result.length });
  } catch (err) {
    res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

// 新建用户
const createUser = async (req, res) => {
  try {
    const { username, password, email, roles = [] } = req.body;
    if (!username || !password) return res.status(400).json({ message: req.t('user.requiredUsernamePassword') });
    const exist = await User.findOne({ where: { username } });
    if (exist) return res.status(409).json({ message: req.t('user.usernameExists') });
    const password_hash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, password_hash, email });
    // 分配角色
    for (const roleId of roles) {
      await UserRole.create({ user_id: user.id, role_id: roleId });
    }
    // 记录操作日志
    try {
      await logOperation({
        operation: req.t('user.operations.create'),
        description: req.t('user.operations.createDescription', { username }),
        user_id: req.user?.id,
        username: req.user?.username,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        details: { username, email, roles }
      });
    } catch (logErr) {
      console.error(req.t('user.operations.logFailed'), logErr);
    }
    res.status(201).json({ message: req.t('shared.created'), user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

// 修改用户信息
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, is_active, roles, password, oldPassword } = req.body;
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ message: req.t('shared.notFound') });
    
    const isUpdatingSelf = req.user.id === parseInt(id);
    const updateData = {};
    
    // 邮箱修改：所有用户都可以修改自己的邮箱
    if (email !== undefined) {
      updateData.email = email;
    }
    
    // 状态和角色修改：只有管理员可以修改（权限已在中间件中检查）
    if (!isUpdatingSelf || (is_active !== undefined || roles !== undefined)) {
      if (is_active !== undefined) {
        updateData.is_active = is_active;
      }
      if (Array.isArray(roles)) {
        await UserRole.destroy({ where: { user_id: id } });
        for (const roleId of roles) {
          await UserRole.create({ user_id: id, role_id: roleId });
        }
      }
    }
    
    // 更新基本信息（邮箱、状态）
    if (Object.keys(updateData).length > 0) {
      await user.update(updateData);
    }
    
    // 密码修改逻辑
    if (password) {
      if (!oldPassword) {
        return res.status(400).json({ message: req.t('user.oldPasswordRequired') });
      }
      const isMatch = await bcrypt.compare(oldPassword, user.password_hash);
      if (!isMatch) {
        return res.status(400).json({ message: req.t('user.oldPasswordIncorrect') });
      }
      const password_hash = await bcrypt.hash(password, 10);
      await user.update({ password_hash });
    }
    // 记录操作日志
    try {
      await logOperation({
        operation: req.t('user.operations.update'),
        description: req.t('user.operations.updateDescription', { username: user.username }),
        user_id: req.user?.id,
        username: req.user?.username,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        details: { id, email, is_active, roles }
      });
    } catch (logErr) {
      console.error(req.t('user.operations.logFailed'), logErr);
    }
    res.json({ message: req.t('shared.updated') });
  } catch (err) {
    res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

// 删除用户
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ message: req.t('shared.notFound') });
    await user.destroy();
    // 记录操作日志
    try {
      await logOperation({
        operation: req.t('user.operations.delete'),
        description: req.t('user.operations.deleteDescription', { username: user.username }),
        user_id: req.user?.id,
        username: req.user?.username,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        details: { id, username: user.username }
      });
    } catch (logErr) {
      console.error(req.t('user.operations.logFailed'), logErr);
    }
    res.json({ message: req.t('shared.deleted') });
  } catch (err) {
    res.status(500).json({ message: req.t('shared.deleteFailed'), error: err.message });
  }
};

// 查询用户角色
const getUserRoles = async (req, res) => {
  try {
    const { id } = req.params;
    const roles = await UserRole.findAll({ where: { user_id: id } });
    res.json({ roles });
  } catch (err) {
    res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

module.exports = {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  getUserRoles
}; 