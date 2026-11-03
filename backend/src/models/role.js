const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const Role = sequelize.define('roles', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  code: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  name_zh: { type: DataTypes.STRING(100), allowNull: false },
  name_en: { type: DataTypes.STRING(100), allowNull: false },
  is_system: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  is_super_admin: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  scope_type: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'platform' },
  scope_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  created_at: { type: DataTypes.DATE(3), allowNull: false },
  updated_at: { type: DataTypes.DATE(3), allowNull: false }
}, {
  timestamps: false,
  tableName: 'roles'
});

module.exports = Role; 
