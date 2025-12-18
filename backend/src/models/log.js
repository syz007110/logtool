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
  remark: { type: DataTypes.TEXT },
  file_time_token: { type: DataTypes.CHAR(12) },
  file_year: { type: DataTypes.SMALLINT },
  file_month: { type: DataTypes.TINYINT },
  file_day: { type: DataTypes.TINYINT },
  file_hour: { type: DataTypes.TINYINT },
  file_minute: { type: DataTypes.TINYINT },
  version: { type: DataTypes.INTEGER, defaultValue: 1, allowNull: false, comment: '日志版本号' }
}, {
  timestamps: false
});

module.exports = Log; 