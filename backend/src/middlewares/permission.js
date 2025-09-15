const { Op } = require('sequelize');
const User = require('../models/user');
const UserRole = require('../models/user_role');
const Role = require('../models/role');
const Permission = require('../models/permission');
const RolePermission = require('../models/role_permission');
const legacyRoles = require('../config/roles');

function normalizeRoleName(name) {
  const n = (name || '').toString().trim().toLowerCase();
  if (n === 'admin' || n === '管理员') return 'admin';
  if (n === 'expert' || n === '专家' || n === '专家用户' || n === '工程师') return 'expert';
  if (n === 'user' || n === '普通用户' || n === '用户' || n === '成员') return 'user';
  return n || name;
}

async function loadUserRoles(userId) {
  return UserRole.findAll({
    where: { user_id: userId },
    include: [{ model: Role, as: 'Role', attributes: ['id', 'name'] }]
  });
}

async function userHasDbPermission(userId, requiredPermission) {
  const userRoles = await loadUserRoles(userId);
  if (!userRoles || userRoles.length === 0) return false;

  // admin bypass
  if (userRoles.some(ur => normalizeRoleName(ur.Role?.name) === 'admin')) return true;

  const roleIds = userRoles.map(ur => ur.role_id).filter(Boolean);
  if (roleIds.length === 0) return false;

  const rp = await RolePermission.findOne({
    where: { role_id: { [Op.in]: roleIds } },
    include: [{ model: Permission, as: 'permission', where: { name: requiredPermission }, attributes: ['id'] }]
  });
  if (rp) return true;

  return false;
}

// 权限检查中间件（数据库为准，找不到时回退到旧配置）
const checkPermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ message: '用户信息缺失，请重新登录' });
      }

      const userId = req.user.id;

      // 先查数据库
      if (await userHasDbPermission(userId, requiredPermission)) {
        return next();
      }

      // 回退：旧配置（避免未初始化数据库权限时全部403）
      try {
        const userRoles = await loadUserRoles(userId);
        if (legacyRoles.hasPermission(userRoles, requiredPermission)) {
          return next();
        }
      } catch (_) {}

      return res.status(403).json({ message: '权限不足', requiredPermission });
    } catch (error) {
      console.error('权限检查错误:', error);
      return res.status(500).json({ message: '权限检查失败', error: error.message });
    }
  };
};

// 资源所有者检查中间件
const checkResourceOwnership = (resourceModel, resourceIdField = 'id') => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ message: '用户信息缺失，请重新登录' });
      }
      const userId = req.user.id;
      const resourceId = req.params[resourceIdField];
      const resource = await resourceModel.findByPk(resourceId);
      if (!resource) return res.status(404).json({ message: '资源不存在' });

      if (resource.user_id === userId) return next();

      const userRoles = await loadUserRoles(userId);
      if (userRoles.some(ur => normalizeRoleName(ur.Role?.name) === 'admin')) return next();

      // 允许具有用户更新权限者作为管理员处理
      if (await userHasDbPermission(userId, 'user:update')) return next();

      return res.status(403).json({ message: '只能操作自己的资源' });
    } catch (error) {
      console.error('资源所有权检查错误:', error);
      return res.status(500).json({ message: '权限检查失败' });
    }
  };
};

// 日志权限检查中间件
const checkLogPermission = (action) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ message: '用户信息缺失，请重新登录' });
      }
      const userId = req.user.id;

      const userRoles = await loadUserRoles(userId);
      if (userRoles.some(ur => normalizeRoleName(ur.Role?.name) === 'admin')) return next();

      // read_all
      if (action === 'read_all' && await userHasDbPermission(userId, 'log:read_all')) return next();
      if (action === 'read_own' && await userHasDbPermission(userId, 'log:read_own')) return next();

      if (action === 'delete') {
        if (await userHasDbPermission(userId, 'log:delete')) return next();
        if (await userHasDbPermission(userId, 'log:delete_own')) {
          if (req.path === '/batch') return next();
          const logId = req.params.id;
          if (logId) {
            const Log = require('../models/log');
            const log = await Log.findByPk(logId);
            if (log && log.uploader_id === userId) return next();
          }
        }
      }

      if (await userHasDbPermission(userId, `log:${action}`)) return next();

      // 回退到旧配置
      try {
        if (legacyRoles.hasPermission(userRoles, `log:${action}`)) return next();
      } catch (_) {}

      return res.status(403).json({ message: '日志操作权限不足', requiredAction: action });
    } catch (error) {
      console.error('日志权限检查错误:', error);
      return res.status(500).json({ message: '权限检查失败' });
    }
  };
};

module.exports = {
  checkPermission,
  checkResourceOwnership,
  checkLogPermission
}; 