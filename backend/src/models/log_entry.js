const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const LogEntry = sequelize.define('log_entries', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  log_id: { type: DataTypes.INTEGER, allowNull: false },
  timestamp: { type: DataTypes.DATE },
  error_code: { type: DataTypes.STRING(50) },
  param1: { type: DataTypes.STRING(100) },
  param2: { type: DataTypes.STRING(100) },
  param3: { type: DataTypes.STRING(100) },
  param4: { type: DataTypes.STRING(100) },
  explanation: { type: DataTypes.TEXT }
}, {
  timestamps: false
});

module.exports = LogEntry; 