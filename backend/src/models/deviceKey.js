const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

// 设备密钥表（支持多密钥按时间范围，精确到小时）
const DeviceKey = sequelize.define('device_keys', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  device_id: { type: DataTypes.STRING(100), allowNull: false },
  key_value: { type: DataTypes.STRING(100), allowNull: false },
  valid_from_date: { type: DataTypes.DATE, allowNull: false },
  valid_to_date: { type: DataTypes.DATE, allowNull: true },
  is_default: { type: DataTypes.BOOLEAN, defaultValue: false },
  priority: { type: DataTypes.INTEGER, defaultValue: 0 },
  description: { type: DataTypes.STRING(255) },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  created_by: { type: DataTypes.INTEGER, allowNull: true }
}, {
  timestamps: false,
  indexes: [
    { fields: ['device_id', 'valid_from_date', 'valid_to_date'] },
    { fields: ['device_id'] },
    { fields: ['valid_from_date'] },
    { fields: ['valid_to_date'] },
    { fields: ['is_default'] },
    { fields: ['priority'] }
  ]
});

module.exports = DeviceKey;
