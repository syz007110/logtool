// 角色权限配置
const ROLES = {
  ADMIN: {
    id: 1,
    name: 'admin',
    description: '拥有所有权限，可以管理用户和角色',
    permissions: [
      // 用户管理权限
      'user:create',
      'user:read',
      'user:update',
      'user:delete',
      'user:role:assign',
      
      // 角色管理权限
      'role:create',
      'role:read',
      'role:update',
      'role:delete',
      
      // 故障码管理权限
      'error_code:create',
      'error_code:read',
      'error_code:update',
      'error_code:delete',
      'error_code:export',
      
      // 日志管理权限
      'log:upload',
      'log:read_all', // 查看所有用户的日志
      'log:read_own', // 查看自己的日志
      'log:parse',
      'log:download',
      'log:delete',
      
      // 多语言管理权限
      'i18n:create',
      'i18n:read',
      'i18n:update',
      'i18n:delete',
      
      // 历史记录权限
      'history:read_all', // 查看所有历史记录
      'history:export'    // 导出历史记录
    ]
  },
  
  EXPERT: {
    id: 2,
    name: 'expert',
    description: '拥有故障码管理权限，可查看所有日志，但不能管理用户',
    permissions: [
      // 故障码管理权限
      'error_code:create',
      'error_code:read',
      'error_code:update',
      'error_code:delete',
      'error_code:export',
      
      // 日志管理权限
      'log:upload',
      'log:read_all', // 查看所有用户的日志
      'log:read_own', // 查看自己的日志
      'log:parse',
      'log:download',
      'log:delete_own', // 只能删除自己的日志
      
      // 多语言管理权限
      'i18n:read',
      
      // 历史记录权限（专家可以查看自己的历史记录）
      'history:read_own'
    ]
  },
  
  USER: {
    id: 3,
    name: 'user',
    description: '基础权限，可查询故障码、上传日志、查看所有日志但只能删除自己的日志',
    permissions: [
      // 故障码查询权限
      'error_code:read',
      'error_code:export',
      
      // 日志管理权限
      'log:upload',
      'log:read_all', // 可以查看所有用户的日志
      'log:read_own', // 查看自己的日志
      'log:parse',
      'log:download',
      'log:delete_own', // 只能删除自己的日志
      
      // 多语言查询权限
      'i18n:read',
      
      // 历史记录权限（普通用户只能查看自己的历史记录）
      'history:read_own'
    ]
  },
  
  // 新增角色示例
  AUDITOR: {
    id: 4,
    name: 'auditor',
    description: '审计员，只能查看历史记录和日志，不能进行修改操作',
    permissions: [
      // 只读权限
      'error_code:read',
      'log:read_all',
      'log:read_own',
      'i18n:read',
      'history:read_all',
      'history:export'
    ]
  }
};

// 权限检查函数
function hasPermission(userRoles, requiredPermission) {
  if (!userRoles || userRoles.length === 0) {
    return false;
  }
  
  // 检查每个角色的权限
  for (const userRole of userRoles) {
    const role = userRole.Role || userRole; // 支持直接传入角色对象或关联查询结果
    if (!role) continue;
    
    // 管理员拥有所有权限
    if (role.id === ROLES.ADMIN.id || role.name === '管理员') {
      return true;
    }
    
    // 检查其他角色的权限
    const roleKey = Object.keys(ROLES).find(key => 
      ROLES[key].id === role.id || ROLES[key].name === role.name
    );
    
    if (roleKey && ROLES[roleKey].permissions.includes(requiredPermission)) {
      return true;
    }
  }
  
  return false;
}

// 获取用户所有权限
function getUserPermissions(userRoles) {
  if (!userRoles || userRoles.length === 0) {
    return [];
  }
  
  const permissions = new Set();
  
  for (const userRole of userRoles) {
    const role = userRole.Role || userRole; // 支持直接传入角色对象或关联查询结果
    if (!role) continue;
    
    const roleKey = Object.keys(ROLES).find(key => 
      ROLES[key].id === role.id || ROLES[key].name === role.name
    );
    
    if (roleKey) {
      ROLES[roleKey].permissions.forEach(permission => permissions.add(permission));
    }
  }
  
  return Array.from(permissions);
}

module.exports = {
  ROLES,
  hasPermission,
  getUserPermissions
}; 