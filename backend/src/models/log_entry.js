const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const LogEntry = sequelize.define('log_entries', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  log_id: { type: DataTypes.INTEGER, allowNull: false },
  timestamp: { type: DataTypes.DATE },
  error_code: { type: DataTypes.STRING(50) },
  // 规范化列（MySQL 生成列，供查询优化使用）
  subsystem_char: { type: DataTypes.CHAR(1) },
  code4: { type: DataTypes.CHAR(6) },
  param1: { type: DataTypes.STRING(100) },
  param2: { type: DataTypes.STRING(100) },
  param3: { type: DataTypes.STRING(100) },
  param4: { type: DataTypes.STRING(100) },
  explanation: { type: DataTypes.TEXT }
}, {
  timestamps: false
});

module.exports = LogEntry; 