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

      // 故障案例权限
      'fault_case:create',
      'fault_case:read',
      'fault_case:update',
      'fault_case:delete',
      'fault_case:review',
      'fault_case_config:manage',
      
      // 日志管理权限
      'log:upload',
      'log:read_all', // 查看所有用户的日志
      'log:read_own', // 查看自己的日志
      'log:parse',
      'log:reparse',
      'log:download',
      'log:delete',
      
      // 多语言管理权限
      'i18n:create',
      'i18n:read',
      'i18n:update',
      'i18n:delete',

      // 设备管理权限
      'device:create',
      'device:read',
      'device:update',
      'device:delete',
      
      // 历史记录权限
      'history:read_all', // 查看所有历史记录
      'history:export',    // 导出历史记录
      
      // 手术数据权限
      'surgery:analyze',
      'surgery:read',
      'surgery:export',
      'surgery:delete',
      
      // 数据诊断权限
      'data_replay:upload',
      'data_replay:read',
      'data_replay:download'
    ]
  },
  
  EXPERT: {
    id: 2,
    name: 'expert',
    description: '拥有故障码管理权限，可查看所有日志，但不能管理用户，具有手术分析权限',
    permissions: [
      // 故障码管理权限
      'error_code:create',
      'error_code:read',
      'error_code:update',
      'error_code:delete',
      'error_code:export',

      // 故障案例权限（专家可维护草稿并提交审核）
      'fault_case:create',
      'fault_case:read',
      'fault_case:update',
      'fault_case:delete',
      'fault_case_config:manage',
      
      // 日志管理权限
      'log:upload',
      'log:read_all', // 查看所有用户的日志
      'log:read_own', // 查看自己的日志
      'log:parse',
      'log:download',
      'log:delete_own', // 只能删除自己的日志
      
      // 多语言管理权限
      'i18n:create',
      'i18n:read',
      'i18n:update',
      'i18n:delete',

      // 设备管理权限（专家允许管理）
      'device:create',
      'device:read',
      'device:update',
      'device:delete',
      
      // 历史记录权限（专家可以查看自己的历史记录）
      'history:read_own',
      
      // 手术数据权限
      'surgery:analyze',
      'surgery:read',
      'surgery:export',
      'surgery:delete',
      
      // 数据解析（原数据诊断）权限
      'data_replay:upload',
      'data_replay:read',
      'data_replay:download'
    ]
  },
  
  USER: {
    id: 3,
    name: 'user',
    description: '基础权限，可查询故障码、上传日志、查看所有日志但只能删除自己的日志，具有手术分析权限',
    permissions: [
      // 故障码查询权限
      'error_code:read',
      'error_code:export',

      // 故障案例查询权限
      'fault_case:read',
      
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
      'history:read_own',
      
      // 手术数据权限
      'surgery:analyze',
      'surgery:read',
      'surgery:export'
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
      'fault_case:read',
      'log:read_all',
      'log:read_own',
      'i18n:read',
      'history:read_all',
      'history:export',

      // 故障案例审核权限
      'fault_case:review'
    ]
  }
};

// 权限检查函数（仅用于回退）
function hasPermission(userRoles, requiredPermission) {
  if (!userRoles || userRoles.length === 0) {
    return false;
  }
  for (const userRole of userRoles) {
    const role = userRole.Role || userRole;
    if (!role) continue;
    const roleName = (role.name || '').toString().trim().toLowerCase();
    if (roleName === 'admin') {
      return true;
    }
    const roleKey = Object.keys(ROLES).find(key =>
      ROLES[key].id === role.id || ROLES[key].name === role.name
    );
    if (roleKey && ROLES[roleKey].permissions.includes(requiredPermission)) {
      return true;
    }
  }
  return false;
}

function getUserPermissions(userRoles) {
  if (!userRoles || userRoles.length === 0) {
    return [];
  }
  const permissions = new Set();
  for (const userRole of userRoles) {
    const role = userRole.Role || userRole;
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