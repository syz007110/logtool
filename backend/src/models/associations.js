const User = require('./user');
const Role = require('./role');
const UserRole = require('./user_role');
const ErrorCode = require('./error_code');
const I18nErrorCode = require('./i18n_error_code');
const Log = require('./log');
const I18nText = require('./i18n_text');
const OperationLog = require('./operation_log');
const Device = require('./device');
const DeviceKey = require('./deviceKey');
const Feedback = require('./feedback');
const FeedbackImage = require('./feedback_image');
const Permission = require('./permission');
const RolePermission = require('./role_permission');
const AnalysisCategory = require('./analysis_category');
const ErrorCodeAnalysisCategory = require('./error_code_analysis_category');
const TechSolutionImage = require('./tech_solution_image');
const FaultCaseStatus = require('./fault_case_status');
const FaultCaseStatusMapping = require('./fault_case_status_mapping');
const FaultCaseModule = require('./fault_case_module');
const FaultCaseModuleMapping = require('./fault_case_module_mapping');
const KbDocument = require('./kb_document');
const KbFileType = require('./kb_file_type');
const KbDocumentFileType = require('./kb_document_file_type');

// 防止重复定义关联 - 使用进程级别的检查
const associationsProcessKey = `associations_${process.pid}`;
if (global[associationsProcessKey]) {
  console.log(`[进程 ${process.pid}] 模型关联已定义，跳过重复定义`);
  return;
}

global[associationsProcessKey] = true;
console.log(`[进程 ${process.pid}] 开始定义模型关联...`);

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

  // Role 与 Permission 的多对多关联
  Role.belongsToMany(Permission, {
    through: RolePermission,
    foreignKey: 'role_id',
    otherKey: 'permission_id',
    as: 'permissions'
  });

  Permission.belongsToMany(Role, {
    through: RolePermission,
    foreignKey: 'permission_id',
    otherKey: 'role_id',
    as: 'roles'
  });

  // RolePermission 关联 Role 与 Permission
  RolePermission.belongsTo(Role, { foreignKey: 'role_id', as: 'role' });
  RolePermission.belongsTo(Permission, { foreignKey: 'permission_id', as: 'permission' });
  Role.hasMany(RolePermission, { foreignKey: 'role_id', as: 'rolePermissions' });
  Permission.hasMany(RolePermission, { foreignKey: 'permission_id', as: 'rolePermissions' });

  // Log 和 User 的关联
  Log.belongsTo(User, {
    foreignKey: 'uploader_id',
    as: 'uploader'
  });

  User.hasMany(Log, {
    foreignKey: 'uploader_id',
    as: 'logs'
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

  // Device 与 DeviceKey 的一对多关联
  Device.hasMany(DeviceKey, {
    sourceKey: 'device_id',
    foreignKey: 'device_id',
    as: 'keys'
  });
  DeviceKey.belongsTo(Device, {
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

  // Feedback 与 User 的关联
  Feedback.belongsTo(User, { foreignKey: 'user_id', as: 'User' });
  User.hasMany(Feedback, { foreignKey: 'user_id', as: 'feedbacks' });

  // Feedback 与 FeedbackImage 的关联
  Feedback.hasMany(FeedbackImage, { foreignKey: 'feedback_id', as: 'images' });
  FeedbackImage.belongsTo(Feedback, { foreignKey: 'feedback_id', as: 'feedback' });

  // ErrorCode 与 AnalysisCategory 的多对多关联
  ErrorCode.belongsToMany(AnalysisCategory, {
    through: ErrorCodeAnalysisCategory,
    foreignKey: 'error_code_id',
    otherKey: 'analysis_category_id',
    as: 'analysisCategories'
  });

  AnalysisCategory.belongsToMany(ErrorCode, {
    through: ErrorCodeAnalysisCategory,
    foreignKey: 'analysis_category_id',
    otherKey: 'error_code_id',
    as: 'errorCodes'
  });

  // ErrorCode 与 技术方案图片 的一对多关联
  ErrorCode.hasMany(TechSolutionImage, {
    foreignKey: 'error_code_id',
    as: 'techSolutionImages',
    onDelete: 'CASCADE'
  });
  TechSolutionImage.belongsTo(ErrorCode, {
    foreignKey: 'error_code_id',
    as: 'errorCode'
  });

  // 故障案例状态 与 状态映射 的一对多关联
  FaultCaseStatus.hasMany(FaultCaseStatusMapping, {
    foreignKey: 'status_id',
    as: 'mappings',
    onDelete: 'CASCADE'
  });
  FaultCaseStatusMapping.belongsTo(FaultCaseStatus, {
    foreignKey: 'status_id',
    as: 'status'
  });

  // 故障案例模块 与 模块映射 的一对多关联
  FaultCaseModule.hasMany(FaultCaseModuleMapping, {
    foreignKey: 'module_id',
    as: 'mappings',
    onDelete: 'CASCADE'
  });
  FaultCaseModuleMapping.belongsTo(FaultCaseModule, {
    foreignKey: 'module_id',
    as: 'module'
  });

  // KB 相关关联
  // KbDocument 与 KbDocumentFileType 的一对多关联
  KbDocument.hasMany(KbDocumentFileType, {
    foreignKey: 'doc_id',
    as: 'fileTypes',
    onDelete: 'CASCADE'
  });
  KbDocumentFileType.belongsTo(KbDocument, {
    foreignKey: 'doc_id',
    as: 'document'
  });

  // KbDocumentFileType 与 KbFileType 的一对多关联
  KbDocumentFileType.belongsTo(KbFileType, {
    foreignKey: 'file_type_id',
    as: 'fileType'
  });
  KbFileType.hasMany(KbDocumentFileType, {
    foreignKey: 'file_type_id',
    as: 'documentFileTypes'
  });

  console.log('✅ 模型关联定义完成');
}

module.exports = { defineAssociations }; 