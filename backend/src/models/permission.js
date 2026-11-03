const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const Permission = sequelize.define('permissions', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  code: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  name_zh: { type: DataTypes.STRING(100), allowNull: false },
  name_en: { type: DataTypes.STRING(100), allowNull: false },
  description: { type: DataTypes.STRING(255), allowNull: true },
  group_key: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'other' },
  sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
  created_at: { type: DataTypes.DATE(3), allowNull: false },
  updated_at: { type: DataTypes.DATE(3), allowNull: false }
}, {
  timestamps: false,
  tableName: 'permissions',
  comment: '权限点表'
});

module.exports = Permission;
