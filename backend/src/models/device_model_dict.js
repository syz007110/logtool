const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

// 设备型号字典表（用于故障案例 equipment_model 下拉）
// 字段：
// - device_model: 设备型号（唯一）
// - is_active: 是否启用
// - created_at / updated_at: 时间戳
const DeviceModelDict = sequelize.define('device_model_dict', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  device_model: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  timestamps: false
});

module.exports = DeviceModelDict;


