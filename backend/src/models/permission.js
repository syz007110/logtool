const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const Permission = sequelize.define('permissions', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  description: { type: DataTypes.STRING(255), allowNull: true }
}, {
  timestamps: false,
  tableName: 'permissions',
  comment: '权限点表'
});

module.exports = Permission;
