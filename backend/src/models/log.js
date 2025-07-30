const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const Log = sequelize.define('logs', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  filename: { type: DataTypes.STRING(255), allowNull: false },
  original_name: { type: DataTypes.STRING(255) },
  size: { type: DataTypes.INTEGER },
  status: { type: DataTypes.STRING(50), defaultValue: 'uploaded' },
  upload_time: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  parse_time: { type: DataTypes.DATE },
  uploader_id: { type: DataTypes.INTEGER },
  device_id: { type: DataTypes.STRING(100) },
  key_id: { type: DataTypes.STRING(100) },
  decrypted_path: { type: DataTypes.STRING(255) },
  remark: { type: DataTypes.TEXT }
}, {
  timestamps: false
});

module.exports = Log; 