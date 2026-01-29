const { DataTypes } = require('sequelize');
const { postgresqlSequelize } = require('../config/postgresql');

/**
 * KB 文档-文件类型关联 - PostgreSQL
 * 表：kb_document_file_types
 */
const KbDocumentFileType = postgresqlSequelize.define('KbDocumentFileType', {
  doc_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    primaryKey: true,
    comment: 'kb_documents.id'
  },
  file_type_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    primaryKey: true,
    comment: 'kb_file_types.id'
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'kb_document_file_types',
  timestamps: false,
  indexes: [
    { fields: ['doc_id'] },
    { fields: ['file_type_id'] }
  ]
});

module.exports = KbDocumentFileType;

