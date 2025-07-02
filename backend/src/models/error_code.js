const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const ErrorCode = sequelize.define('error_codes', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  subsystem: { type: DataTypes.STRING(100) },
  code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  is_axis_error: { type: DataTypes.BOOLEAN, defaultValue: false },
  is_arm_error: { type: DataTypes.BOOLEAN, defaultValue: false },
  short_message: { type: DataTypes.TEXT },
  short_message_en: { type: DataTypes.TEXT },
  user_hint: { type: DataTypes.TEXT },
  user_hint_en: { type: DataTypes.TEXT },
  operation: { type: DataTypes.TEXT },
  operation_en: { type: DataTypes.TEXT },
  detail: { type: DataTypes.TEXT },
  method: { type: DataTypes.TEXT },
  param1: { type: DataTypes.STRING(100) },
  param2: { type: DataTypes.STRING(100) },
  param3: { type: DataTypes.STRING(100) },
  param4: { type: DataTypes.STRING(100) },
  solution: { type: DataTypes.TEXT },
  for_expert: { type: DataTypes.BOOLEAN, defaultValue: false },
  for_novice: { type: DataTypes.BOOLEAN, defaultValue: false },
  related_log: { type: DataTypes.BOOLEAN, defaultValue: false },
  stop_report: { type: DataTypes.TEXT },
  level: { type: DataTypes.STRING(50) },
  tech_solution: { type: DataTypes.TEXT },
  explanation: { type: DataTypes.TEXT },
  category: { type: DataTypes.STRING(100) }
}, {
  timestamps: false
});

module.exports = ErrorCode; 