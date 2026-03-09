const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

// 主表仅保留结构化字段；可多语言文本字段统一放在 i18n_error_codes（包含 zh）
const ErrorCode = sequelize.define('error_codes', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  subsystem: { type: DataTypes.STRING(100) },
  code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  is_axis_error: { type: DataTypes.BOOLEAN, defaultValue: false },
  is_arm_error: { type: DataTypes.BOOLEAN, defaultValue: false },
  solution: { type: DataTypes.TEXT },
  for_expert: { type: DataTypes.BOOLEAN, defaultValue: true },
  for_novice: { type: DataTypes.BOOLEAN, defaultValue: true },
  related_log: { type: DataTypes.BOOLEAN, defaultValue: false },
  level: { type: DataTypes.STRING(50) },
  category: { type: DataTypes.STRING(100) }
}, {
  timestamps: false
});

ErrorCode.sequelize = sequelize;
ErrorCode.Op = require('sequelize').Op;

module.exports = ErrorCode; 