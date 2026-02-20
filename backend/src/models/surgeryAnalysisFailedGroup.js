const { DataTypes } = require('sequelize');
const { postgresqlSequelize } = require('../config/postgresql');

const SurgeryAnalysisFailedGroup = postgresqlSequelize.define('SurgeryAnalysisFailedGroup', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  device_id: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: '设备编号'
  },
  failed_log_ids: {
    type: DataTypes.ARRAY(DataTypes.INTEGER),
    allowNull: false,
    defaultValue: [],
    comment: '失败日志ID集合（用于分组去重）'
  },
  failed_log_ids_key: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'failed_log_ids签名（排序后拼接）'
  },
  source_group_log_ids: {
    type: DataTypes.ARRAY(DataTypes.INTEGER),
    allowNull: false,
    defaultValue: [],
    comment: '原始分析分组log_ids（重试用）'
  },
  failed_log_details: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
    comment: '失败详情数组（logId + reason）'
  },
  last_task_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: '最近一次关联任务ID'
  },
  updated_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '最近一次更新用户ID'
  },
  fail_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    comment: '同签名失败累计次数'
  },
  first_failed_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  last_failed_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
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
  tableName: 'surgery_analysis_failed_groups',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, fields: ['device_id', 'failed_log_ids_key'] },
    { fields: ['device_id', 'last_failed_at'] },
    { fields: ['last_failed_at'] }
  ]
});

let ensureTablePromise = null;
async function ensureTable() {
  if (!ensureTablePromise) {
    ensureTablePromise = SurgeryAnalysisFailedGroup.sync({ alter: false }).catch((error) => {
      ensureTablePromise = null;
      throw error;
    });
  }
  return ensureTablePromise;
}

SurgeryAnalysisFailedGroup.ensureTable = ensureTable;

module.exports = SurgeryAnalysisFailedGroup;
