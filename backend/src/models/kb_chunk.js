const { DataTypes } = require('sequelize');
const { postgresqlSequelize } = require('../config/postgresql');

/**
 * 知识库分块 - PostgreSQL
 * 表：kb_chunks
 */
const KbChunk = postgresqlSequelize.define('KbChunk', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  doc_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'kb_documents.id'
  },
  chunk_no: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '分块序号（从1开始）'
  },
  heading_path: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '标题路径（A / B / C）'
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: '分块内容'
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
  tableName: 'kb_chunks',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['doc_id'] },
    { fields: ['doc_id', 'chunk_no'], unique: true }
  ]
});

module.exports = KbChunk;

