const { DataTypes } = require('sequelize');
const { postgresqlSequelize } = require('../config/postgresql');

const SurgeryAnalysisFailedLog = postgresqlSequelize.define('SurgeryAnalysisFailedLog', {
  device_id: {
    type: DataTypes.TEXT,
    allowNull: false,
    primaryKey: true,
    comment: '设备编号'
  },
  failed_log_ids: {
    type: DataTypes.ARRAY(DataTypes.INTEGER),
    allowNull: false,
    defaultValue: [],
    comment: '最近一次分析失败的日志ID集合'
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
    comment: '最近一次写入来源任务ID'
  },
  updated_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '最近一次更新用户ID'
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
  tableName: 'surgery_analysis_failed_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['updated_at'] }
  ]
});

let ensureTablePromise = null;
async function ensureTable() {
  if (!ensureTablePromise) {
    ensureTablePromise = SurgeryAnalysisFailedLog.sync({ alter: false }).catch((error) => {
      ensureTablePromise = null;
      throw error;
    });
  }
  return ensureTablePromise;
}

SurgeryAnalysisFailedLog.ensureTable = ensureTable;

module.exports = SurgeryAnalysisFailedLog;
