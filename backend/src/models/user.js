const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const User = sequelize.define('users', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  username: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  password_hash: { type: DataTypes.STRING(255), allowNull: true },
  email: { type: DataTypes.STRING(100) },
  dingtalk_unionid: { type: DataTypes.STRING(128), unique: true, allowNull: true },
  dingtalk_corp_id: { type: DataTypes.STRING(128), allowNull: true },
  dingtalk_userid: { type: DataTypes.STRING(128), allowNull: true },
  dingtalk_bound_at: { type: DataTypes.DATE, allowNull: true },
  local_login_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  dingtalk_mobile: { type: DataTypes.STRING(32), allowNull: true },
  dingtalk_nick: { type: DataTypes.STRING(100), allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  must_change_password: { type: DataTypes.BOOLEAN, defaultValue: false },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  timestamps: false
});

module.exports = User;
