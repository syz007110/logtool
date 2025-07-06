const { hasPermission } = require('../config/roles');
const User = require('../models/user');
const UserRole = require('../models/user_role');
const Role = require('../models/role');

// 权限检查中间件
const checkPermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      // 检查用户信息是否存在
      if (!req.user) {
        console.error('权限检查错误: req.user 不存在');
        return res.status(401).json({ message: '用户信息缺失，请重新登录' });
      }
      
      const userId = req.user.id; // 从JWT中获取用户ID
      
      if (!userId) {
        console.error('权限检查错误: req.user.id 不存在', req.user);
        return res.status(401).json({ message: '用户ID缺失，请重新登录' });
      }
      
      console.log('权限检查调试信息:', {
        userId,
        requiredPermission,
        userInfo: req.user
      });
      
      // 获取用户的角色
      const userRoles = await UserRole.findAll({
        where: { user_id: userId },
        include: [{
          model: Role,
          as: 'Role',
          attributes: ['id', 'name']
        }]
      });
      
      console.log('权限检查调试信息:', {
        userId,
        requiredPermission,
        userRoles: userRoles.map(ur => ur.Role ? { id: ur.Role.id, name: ur.Role.name } : ur)
      });
      
      // 检查权限
      if (hasPermission(userRoles, requiredPermission)) {
        next();
      } else {
        res.status(403).json({ 
          message: '权限不足',
          requiredPermission,
          userRoles: userRoles.map(ur => ur.Role ? ur.Role.name : '未知角色'),
          debug: {
            userId,
            userRoleCount: userRoles.length
          }
        });
      }
    } catch (error) {
      console.error('权限检查错误:', error);
      res.status(500).json({ message: '权限检查失败', error: error.message });
    }
  };
};

// 资源所有者检查中间件（用于检查用户是否只能操作自己的资源）
const checkResourceOwnership = (resourceModel, resourceIdField = 'id') => {
  return async (req, res, next) => {
    try {
      // 检查用户信息是否存在
      if (!req.user || !req.user.id) {
        console.error('资源所有权检查错误: req.user 或 req.user.id 不存在');
        return res.status(401).json({ message: '用户信息缺失，请重新登录' });
      }
      
      const userId = req.user.id;
      const resourceId = req.params[resourceIdField];
      
      // 查找资源
      const resource = await resourceModel.findByPk(resourceId);
      
      if (!resource) {
        return res.status(404).json({ message: '资源不存在' });
      }
      
      // 检查是否是资源所有者
      if (resource.user_id === userId) {
        next();
      } else {
        // 检查是否有管理员权限
        const userRoles = await UserRole.findAll({
          where: { user_id: userId },
          include: [{
            model: Role,
            as: 'Role',
            attributes: ['id', 'name']
          }]
        });
        
        if (hasPermission(userRoles, 'user:update')) {
          next(); // 管理员可以操作任何资源
        } else {
          res.status(403).json({ message: '只能操作自己的资源' });
        }
      }
    } catch (error) {
      console.error('资源所有权检查错误:', error);
      res.status(500).json({ message: '权限检查失败' });
    }
  };
};

// 日志权限检查中间件（特殊处理，因为普通用户只能查看自己的日志）
const checkLogPermission = (action) => {
  return async (req, res, next) => {
    try {
      // 检查用户信息是否存在
      if (!req.user || !req.user.id) {
        console.error('日志权限检查错误: req.user 或 req.user.id 不存在');
        return res.status(401).json({ message: '用户信息缺失，请重新登录' });
      }
      
      const userId = req.user.id;
      
      // 获取用户角色
      const userRoles = await UserRole.findAll({
        where: { user_id: userId },
        include: [{
          model: Role,
          as: 'Role',
          attributes: ['id', 'name']
        }]
      });
      
      // 检查是否有查看所有日志的权限
      if (action === 'read_all' && hasPermission(userRoles, 'log:read_all')) {
        next();
        return;
      }
      
      // 检查是否有查看自己日志的权限
      if (action === 'read_own' && hasPermission(userRoles, 'log:read_own')) {
        next();
        return;
      }
      
      // 检查其他日志相关权限
      if (hasPermission(userRoles, `log:${action}`)) {
        next();
        return;
      }
      
      res.status(403).json({ 
        message: '日志操作权限不足',
        requiredAction: action,
        userRoles: userRoles.map(ur => ur.Role.name)
      });
      
    } catch (error) {
      console.error('日志权限检查错误:', error);
      res.status(500).json({ message: '权限检查失败' });
    }
  };
};

module.exports = {
  checkPermission,
  checkResourceOwnership,
  checkLogPermission
}; 