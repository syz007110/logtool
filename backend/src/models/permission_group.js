const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const PermissionGroup = sequelize.define('permission_groups', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  group_key: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  name_zh: { type: DataTypes.STRING(100), allowNull: false },
  name_en: { type: DataTypes.STRING(100), allowNull: false },
  i18n_key: { type: DataTypes.STRING(150), allowNull: false },
  sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, {
  timestamps: false,
  tableName: 'permission_groups',
  comment: '权限分组表'
});

module.exports = PermissionGroup;

