const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const UserRole = sequelize.define('user_roles', {
  user_id: { type: DataTypes.INTEGER, primaryKey: true },
  role_id: { type: DataTypes.INTEGER, primaryKey: true }
}, {
  timestamps: false
});

module.exports = UserRole; 