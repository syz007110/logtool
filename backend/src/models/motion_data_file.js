const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

/**
 * 运行数据（motion-data）文件元数据表 - MySQL
 * 表：motion_data_files
 *
 * 注意：init_database.sql 负责建表；这里仅定义 Sequelize Model。
 */
const MotionDataFile = sequelize.define('motion_data_files', {
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },

  device_id: { type: DataTypes.STRING(100), allowNull: false },
  uploader_id: { type: DataTypes.INTEGER, allowNull: true },
  task_id: { type: DataTypes.STRING(64), allowNull: true },

  original_name: { type: DataTypes.STRING(255), allowNull: false },
  file_time_token: { type: DataTypes.CHAR(12), allowNull: true },
  file_time: { type: DataTypes.DATE, allowNull: true },
  size_bytes: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },

  revision: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },

  storage: { type: DataTypes.ENUM('oss', 'local'), allowNull: false, defaultValue: 'oss' },
  raw_object_key: { type: DataTypes.TEXT, allowNull: true },
  parsed_object_key: { type: DataTypes.TEXT, allowNull: true },
  sha256: { type: DataTypes.CHAR(64), allowNull: true },
  etag: { type: DataTypes.TEXT, allowNull: true },

  entry_size_bytes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 924 },
  sample_rate_hz: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
  total_frames: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  ts_first: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  ts_last: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },

  status: {
    type: DataTypes.ENUM('uploading', 'parsing', 'parse_failed', 'completed', 'file_error', 'processing_failed'),
    allowNull: false,
    defaultValue: 'uploading'
  },
  error_message: { type: DataTypes.TEXT, allowNull: true },

  upload_time: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  parse_time: { type: DataTypes.DATE, allowNull: true },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
  timestamps: false
});

module.exports = MotionDataFile;

