const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

// 日志备注表
const LogNote = sequelize.define('log_notes', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  log_entry_id: { type: DataTypes.INTEGER, allowNull: false },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  content: { type: DataTypes.STRING(50), allowNull: false },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, allowNull: true },
  created_by: { type: DataTypes.ENUM('admin', 'expert', 'user'), allowNull: false }
}, {
  timestamps: false
});

module.exports = LogNote;


