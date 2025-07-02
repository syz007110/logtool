const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const Log = sequelize.define('logs', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  filename: { type: DataTypes.STRING(255), allowNull: false },
  original_path: { type: DataTypes.STRING(255) },
  uploader_id: { type: DataTypes.INTEGER },
  upload_time: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  size: { type: DataTypes.BIGINT },
  status: { type: DataTypes.STRING(50), defaultValue: 'uploaded' },
  decrypted_path: { type: DataTypes.STRING(255) }
}, {
  timestamps: false
});

module.exports = Log; 