const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const HospitalMaster = sequelize.define('hospital_master', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  hospital_code: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  hospital_name_std: { type: DataTypes.STRING(255), allowNull: false },
  country_code: { type: DataTypes.STRING(16), allowNull: false },
  region_code: { type: DataTypes.STRING(64) },
  status: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  source_system: { type: DataTypes.STRING(64) },
  source_key: { type: DataTypes.STRING(128) },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  timestamps: false
});

module.exports = HospitalMaster;
