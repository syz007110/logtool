const User = require('./user');
const Role = require('./role');
const UserRole = require('./user_role');
const ErrorCode = require('./error_code');
const I18nErrorCode = require('./i18n_error_code');
const Log = require('./log');
const LogEntry = require('./log_entry');
const I18nText = require('./i18n_text');
const OperationLog = require('./operation_log');
const Device = require('./device');

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

  // Log 与 LogEntry 的关联
  Log.hasMany(LogEntry, {
    foreignKey: 'log_id',
    as: 'LogEntries'
  });

  LogEntry.belongsTo(Log, {
    foreignKey: 'log_id',
    as: 'Log'
  });

  // Device 与 Log 的关联（通过 device_id 文本字段进行非外键关联）
  // 我们保留 Log.device_id 为字符串，但提供便捷查询：Device.hasMany(Log, { sourceKey: 'device_id', foreignKey: 'device_id' })
  Device.hasMany(Log, {
    sourceKey: 'device_id',
    foreignKey: 'device_id',
    as: 'logs'
  });
  Log.belongsTo(Device, {
    targetKey: 'device_id',
    foreignKey: 'device_id',
    as: 'Device'
  });

  // ErrorCode 和 I18nErrorCode 的一对多关联
  ErrorCode.hasMany(I18nErrorCode, {
    foreignKey: 'error_code_id',
    as: 'i18nContents'
  });

  I18nErrorCode.belongsTo(ErrorCode, {
    foreignKey: 'error_code_id',
    as: 'errorCode'
  });

  // OperationLog 和 User 的关联
  OperationLog.belongsTo(User, {
    foreignKey: 'user_id',
    as: 'User'
  });

  User.hasMany(OperationLog, {
    foreignKey: 'user_id',
    as: 'operationLogs'
  });

  console.log('✅ 模型关联定义完成');
}

module.exports = { defineAssociations }; 