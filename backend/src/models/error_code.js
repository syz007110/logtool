const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

// 注意：英文内容（short_message/user_hint/operation）已迁移至 i18n_error_codes 表
// 主表仅保留中文字段作为默认语言
const ErrorCode = sequelize.define('error_codes', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  subsystem: { type: DataTypes.STRING(100) },
  code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  is_axis_error: { type: DataTypes.BOOLEAN, defaultValue: false },
  is_arm_error: { type: DataTypes.BOOLEAN, defaultValue: false },
  short_message: { type: DataTypes.TEXT, comment: '精简提示信息（中文/默认）' },
  user_hint: { type: DataTypes.TEXT, comment: '用户提示信息（中文/默认）' },
  operation: { type: DataTypes.TEXT, comment: '操作信息（中文/默认）' },
  // 已废弃字段（已删除）：
  // short_message_en - 迁移至 i18n_error_codes(lang='en')
  // user_hint_en - 迁移至 i18n_error_codes(lang='en')
  // operation_en - 迁移至 i18n_error_codes(lang='en')
  detail: { type: DataTypes.TEXT },
  method: { type: DataTypes.TEXT },
  param1: { type: DataTypes.STRING(100) },
  param2: { type: DataTypes.STRING(100) },
  param3: { type: DataTypes.STRING(100) },
  param4: { type: DataTypes.STRING(100) },
  solution: { type: DataTypes.TEXT },
  for_expert: { type: DataTypes.BOOLEAN, defaultValue: true },
  for_novice: { type: DataTypes.BOOLEAN, defaultValue: true },
  related_log: { type: DataTypes.BOOLEAN, defaultValue: false },
  stop_report: { type: DataTypes.TEXT },
  level: { type: DataTypes.STRING(50) },
  tech_solution: { type: DataTypes.TEXT },
  explanation: { type: DataTypes.TEXT },
  category: { type: DataTypes.STRING(100) }
}, {
  timestamps: false
});

ErrorCode.sequelize = sequelize;
ErrorCode.Op = require('sequelize').Op;

module.exports = ErrorCode; 