const { DataTypes } = require('sequelize');
const { postgresqlSequelize } = require('../config/postgresql');

const SurgeryExportPending = postgresqlSequelize.define('SurgeryExportPending', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  surgery_id: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    comment: '待确认手术ID（与surgeries.surgery_id一致）'
  },
  existing_postgresql_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '当前数据库已存在的surgeries.id'
  },
  new_data: {
    type: DataTypes.JSONB,
    allowNull: false,
    comment: '最新待确认的新手术数据（原始提交数据）'
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '创建待办的用户ID（MySQL users.id）'
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
  tableName: 'surgery_export_pending',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, fields: ['surgery_id'] },
    { fields: ['existing_postgresql_id'] },
    { fields: ['updated_at'] }
  ]
});

module.exports = SurgeryExportPending;
