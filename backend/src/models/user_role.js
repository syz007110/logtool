const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const UserRole = sequelize.define('user_roles', {
  user_id: { 
    type: DataTypes.INTEGER, 
    primaryKey: true,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  role_id: { 
    type: DataTypes.INTEGER, 
    primaryKey: true,
    allowNull: false,
    references: {
      model: 'roles',
      key: 'id'
    }
  },
  created_at: { type: DataTypes.DATE(3), allowNull: false }
}, {
  timestamps: false,
  tableName: 'user_roles',
  comment: '用户-角色关联表'
});

module.exports = UserRole; 
