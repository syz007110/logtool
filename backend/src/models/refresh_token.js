const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const RefreshToken = sequelize.define('refresh_tokens', {
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  token_hash: { type: DataTypes.STRING(128), allowNull: false, unique: true },
  remember_me: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  revoked_at: { type: DataTypes.DATE, allowNull: true },
  replaced_by: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  device_info: { type: DataTypes.STRING(255), allowNull: true },
  ip_address: { type: DataTypes.STRING(64), allowNull: true },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  timestamps: false
});

module.exports = RefreshToken;
