const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const GeoRegion = sequelize.define('geo_region', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  country_code: { type: DataTypes.STRING(16), allowNull: false },
  region_code: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  region_name: { type: DataTypes.STRING(100), allowNull: false },
  region_name_en: { type: DataTypes.STRING(100) },
  parent_region_code: { type: DataTypes.STRING(64) },
  level: { type: DataTypes.STRING(32) },
  status: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  timestamps: false
});

module.exports = GeoRegion;
