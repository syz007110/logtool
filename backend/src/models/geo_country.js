const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const GeoCountry = sequelize.define('geo_country', {
  country_code: { type: DataTypes.STRING(16), primaryKey: true },
  country_name: { type: DataTypes.STRING(100), allowNull: false },
  country_name_en: { type: DataTypes.STRING(100) },
  status: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  timestamps: false
});

module.exports = GeoCountry;
