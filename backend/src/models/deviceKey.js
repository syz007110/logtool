const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

// 设备密钥表（支持多密钥按时间范围）
// 字段：
// - device_id: 设备编号
// - key_value: 密钥值（MAC地址）
// - valid_from_date: 密钥生效起始日期（包含）
// - valid_to_date: 密钥生效结束日期（不包含，NULL表示永久有效）
// - is_default: 是否为默认密钥（向后兼容）
// - priority: 优先级（数字越大优先级越高，用于时间重叠时选择）
// - description: 密钥描述
// - created_by: 创建者ID（可选）
const DeviceKey = sequelize.define('device_keys', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  device_id: { type: DataTypes.STRING(100), allowNull: false },
  key_value: { type: DataTypes.STRING(100), allowNull: false },
  valid_from_date: { type: DataTypes.DATEONLY, allowNull: false },
  valid_to_date: { type: DataTypes.DATEONLY, allowNull: true },
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

