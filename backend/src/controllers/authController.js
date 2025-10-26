const User = require('../models/user');
const UserRole = require('../models/user_role');
const Role = require('../models/role');
const Permission = require('../models/permission');
const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const register = async (req, res) => {
  try {
    const { username, password, email, roles } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: '用户名和密码不能为空' });
    }
    const exist = await User.findOne({ where: { username } });
    if (exist) {
      return res.status(409).json({ message: '用户名已存在' });
    }
    const password_hash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, password_hash, email });
    
    // 如果提供了角色，为用户分配角色，否则默认分配普通用户角色
    if (roles && Array.isArray(roles) && roles.length > 0) {
      for (const roleId of roles) {
        await UserRole.create({
          user_id: user.id,
          role_id: roleId,
          assigned_by: user.id, // 自己分配给自己
          notes: '注册时分配'
        });
      }
    } else {
      // 默认分配普通用户角色 (role_id: 3)
      await UserRole.create({
        user_id: user.id,
        role_id: 3, // 普通用户角色ID
        assigned_by: user.id,
        notes: '注册时默认分配普通用户权限'
      });
    }
    
    res.status(201).json({ message: '注册成功', user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    res.status(500).json({ message: '注册失败', error: err.message });
  }
};

async function getUserPrimaryRole(userId) {
  const userRole = await UserRole.findOne({ where: { user_id: userId } });
  if (!userRole) return { roleName: null, roleId: null };
  const role = await Role.findByPk(userRole.role_id);
  return { roleName: role ? role.name : null, roleId: role ? role.id : null };
}

async function getUserPermissions(userId) {
  const userRoles = await UserRole.findAll({ where: { user_id: userId } });
  const roleIds = userRoles.map(ur => ur.role_id).filter(Boolean);
  if (roleIds.length === 0) return [];
  const perms = await Permission.findAll({
    include: [{ model: Role, as: 'roles', where: { id: { [Op.in]: roleIds } }, attributes: [] }],
    attributes: ['name']
  });
  return perms.map(p => p.name);
}

const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ where: { username } });
    if (!user) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }
    // 查询用户角色与权限
    const { roleName, roleId } = await getUserPrimaryRole(user.id);
    const permissions = await getUserPermissions(user.id);
    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '12h' });
    res.json({ message: '登录成功', token, user: { id: user.id, username: user.username, email: user.email, role: roleName, role_id: roleId, permissions } });
  } catch (err) {
    res.status(500).json({ message: '登录失败', error: err.message });
  }
};

const me = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: '未登录' });
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: '用户不存在' });
    const { roleName, roleId } = await getUserPrimaryRole(userId);
    const permissions = await getUserPermissions(userId);
    res.json({ user: { id: user.id, username: user.username, email: user.email, role: roleName, role_id: roleId, permissions } });
  } catch (err) {
    res.status(500).json({ message: '获取用户信息失败', error: err.message });
  }
};

module.exports = { register, login, me };