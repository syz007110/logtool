const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const RolePermission = sequelize.define('role_permissions', {
  role_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false,
    references: { model: 'roles', key: 'id' }
  },
  permission_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false,
    references: { model: 'permissions', key: 'id' }
  },
  created_at: { type: DataTypes.DATE(3), allowNull: false }
}, {
  timestamps: false,
  tableName: 'role_permissions',
  comment: '角色-权限 关联表'
});

module.exports = RolePermission;
