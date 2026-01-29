const { DataTypes } = require('sequelize');
const { postgresqlSequelize } = require('../config/postgresql');

/**
 * 知识库文档元数据 - PostgreSQL
 * 表：kb_documents
 */
const KbDocument = postgresqlSequelize.define('KbDocument', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },

  // 上传源文件信息
  original_name: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: '原始文件名'
  },
  filename: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '服务端生成的文件名（可为空）'
  },
  ext: {
    type: DataTypes.STRING(16),
    allowNull: true,
    comment: '扩展名（docx/md/txt）'
  },
  mime_type: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'MIME'
  },
  size_bytes: {
    type: DataTypes.BIGINT,
    allowNull: true,
    comment: '字节大小'
  },

  // 存储信息
  storage: {
    type: DataTypes.ENUM('local', 'oss'),
    allowNull: false,
    defaultValue: 'local',
    comment: '存储介质'
  },
  oss_key: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'OSS object key'
  },
  object_key: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '本地存储时的相对路径/文件名'
  },
  etag: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'OSS etag'
  },
  sha256: {
    type: DataTypes.STRING(64),
    allowNull: true,
    comment: '文件 sha256'
  },

  // 业务字段
  uploader_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '上传用户ID（MySQL users.id）'
  },
  upload_time: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: '上传时间'
  },
  status: {
    type: DataTypes.STRING(32),
    allowNull: false,
    defaultValue: 'uploading',
    comment: '状态：uploading/queued/parsing/parse_failed/parsed/file_error/processing_failed/upload_failed/deleting'
  },
  chunk_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '分块数量'
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '失败原因'
  },
  lang: {
    type: DataTypes.STRING(8),
    allowNull: false,
    defaultValue: 'zh',
    comment: '语言(zh/en)'
  },

  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'kb_documents',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['status'] },
    { fields: ['uploader_id'] },
    { fields: ['upload_time'] },
    { fields: ['sha256'] }
  ]
});

module.exports = KbDocument;

