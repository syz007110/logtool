const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const AuditLog = sequelize.define('audit_logs', {
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  event_id: { type: DataTypes.CHAR(26), allowNull: false, unique: true },
  schema_version: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 1 },
  occurred_at: { type: DataTypes.DATE(3), allowNull: false },
  event_code: { type: DataTypes.STRING(100), allowNull: false },
  category: { type: DataTypes.STRING(32), allowNull: false },
  outcome: { type: DataTypes.STRING(16), allowNull: false },
  reason_code: { type: DataTypes.STRING(100), allowNull: true },
  actor_type: { type: DataTypes.STRING(16), allowNull: false },
  actor_user_id: { type: DataTypes.INTEGER, allowNull: true },
  actor_username: { type: DataTypes.STRING(100), allowNull: true },
  target_type: { type: DataTypes.STRING(32), allowNull: true },
  target_id: { type: DataTypes.STRING(128), allowNull: true },
  request_id: { type: DataTypes.STRING(64), allowNull: true },
  ip: { type: DataTypes.STRING(45), allowNull: true },
  user_agent: { type: DataTypes.TEXT, allowNull: true },
  details: { type: DataTypes.JSON, allowNull: false }
}, {
  tableName: 'audit_logs',
  timestamps: false
});

module.exports = AuditLog;
