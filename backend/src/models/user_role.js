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
  assigned_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    },
    comment: '分配角色的用户ID'
  },
  assigned_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    comment: '角色分配时间'
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '角色过期时间'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: '角色是否激活'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '分配备注'
  }
}, {
  timestamps: false,
  tableName: 'user_roles',
  comment: '用户-角色关联表'
});

module.exports = UserRole; 