const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const DeviceSeriesDict = sequelize.define('device_series_dict', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  series_code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  series_name_zh: { type: DataTypes.STRING(100), allowNull: false },
  series_name_en: { type: DataTypes.STRING(100), allowNull: false },
  sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  timestamps: false
});

module.exports = DeviceSeriesDict;
