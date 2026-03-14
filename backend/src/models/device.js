const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

// 设备信息表
// 字段：
// - device_id: 设备编号（唯一）
// - device_model: 设备型号
// - device_key: 设备密钥（systeminfo中的MAC地址）
// - hospital_id: 标准医院ID（可选，主数据绑定）
// - hospital_code: 医院编码（稳定唯一键，冗余存储）
// - hospital: 历史兼容字段，不再作为真实归属字段维护
// - created_at: 创建时间
// - updated_at: 更新时间
const Device = sequelize.define('devices', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  device_id: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  device_model: { type: DataTypes.STRING(100) },
  device_key: { type: DataTypes.STRING(100) },
  hospital_id: { type: DataTypes.INTEGER },
  hospital_code: { type: DataTypes.STRING(100) },
  hospital: { type: DataTypes.STRING(255) },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  timestamps: false
});

module.exports = Device;


