const User = require('./user');
const Role = require('./role');
const UserRole = require('./user_role');
const ErrorCode = require('./error_code');
const Log = require('./log');
const I18nText = require('./i18n_text');
const OperationLog = require('./operation_log');

// 定义模型关联关系
function defineAssociations() {
  // User 和 Role 的多对多关联
  User.belongsToMany(Role, {
    through: UserRole,
    foreignKey: 'user_id',
    otherKey: 'role_id',
    as: 'roles'
  });

  Role.belongsToMany(User, {
    through: UserRole,
    foreignKey: 'role_id',
    otherKey: 'user_id',
    as: 'users'
  });

  // UserRole 和 Role 的一对多关联
  UserRole.belongsTo(Role, {
    foreignKey: 'role_id',
    as: 'Role'
  });

  Role.hasMany(UserRole, {
    foreignKey: 'role_id',
    as: 'UserRoles'
  });

  // UserRole 和 User 的一对多关联
  UserRole.belongsTo(User, {
    foreignKey: 'user_id',
    as: 'User'
  });

  User.hasMany(UserRole, {
    foreignKey: 'user_id',
    as: 'UserRoles'
  });

  // UserRole 和 assigned_by 用户的关联
  UserRole.belongsTo(User, {
    foreignKey: 'assigned_by',
    as: 'assignedBy'
  });

  User.hasMany(UserRole, {
    foreignKey: 'assigned_by',
    as: 'assignedUserRoles'
  });

  // Log 和 User 的关联
  Log.belongsTo(User, {
    foreignKey: 'uploader_id',
    as: 'uploader'
  });

  User.hasMany(Log, {
    foreignKey: 'uploader_id',
    as: 'logs'
  });

  // 目前不做关联，后续可扩展

  console.log('✅ 模型关联定义完成');
}

module.exports = { defineAssociations }; 