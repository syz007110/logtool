const { DataTypes } = require('sequelize');
const { postgresqlSequelize } = require('../config/postgresql');

/**
 * KB 文件类型配置 - PostgreSQL
 * 表：kb_file_types
 */
const KbFileType = postgresqlSequelize.define('KbFileType', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  code: {
    type: DataTypes.STRING(64),
    allowNull: false,
    unique: true,
    comment: '类型标识（XX标识）'
  },
  name_zh: {
    type: DataTypes.STRING(128),
    allowNull: false,
    comment: '中文名称'
  },
  name_en: {
    type: DataTypes.STRING(128),
    allowNull: false,
    comment: '英文名称'
  },
  sort_order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '排序顺序'
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: '是否启用'
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
  tableName: 'kb_file_types',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['enabled'] },
    { fields: ['sort_order'] },
    { fields: ['code'], unique: true }
  ]
});

module.exports = KbFileType;

