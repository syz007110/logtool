const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const OperationLog = sequelize.define('operation_logs', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  operation: { type: DataTypes.STRING(100), allowNull: false },
  description: { type: DataTypes.TEXT },
  user_id: { type: DataTypes.INTEGER },
  username: { type: DataTypes.STRING(100) },
  time: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  status: { type: DataTypes.STRING(50), defaultValue: 'success' },
  ip: { type: DataTypes.STRING(50) },
  user_agent: { type: DataTypes.STRING(255) },
  details: { type: DataTypes.JSON }
}, {
  timestamps: false
});

module.exports = OperationLog; 