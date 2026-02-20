const { DataTypes } = require('sequelize');
const { postgresqlSequelize } = require('../config/postgresql');

const SurgeryAnalysisTaskMeta = postgresqlSequelize.define('SurgeryAnalysisTaskMeta', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true
  },
  queue_job_id: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  request_id: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  device_id: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  source_log_ids: {
    type: DataTypes.ARRAY(DataTypes.INTEGER),
    allowNull: false,
    defaultValue: []
  },
  display_surgery_id: {
    type: DataTypes.STRING(80),
    allowNull: true
  },
  status: {
    type: DataTypes.STRING(32),
    allowNull: false,
    defaultValue: 'queued'
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  started_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true
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
  tableName: 'surgery_analysis_task_meta',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, fields: ['queue_job_id'] },
    { fields: ['device_id', 'status'] },
    { fields: ['request_id'] },
    { fields: ['updated_at'] }
  ]
});

let ensureTablePromise = null;
async function ensureTable() {
  if (!ensureTablePromise) {
    ensureTablePromise = SurgeryAnalysisTaskMeta.sync({ alter: false }).catch((error) => {
      ensureTablePromise = null;
      throw error;
    });
  }
  return ensureTablePromise;
}

SurgeryAnalysisTaskMeta.ensureTable = ensureTable;

module.exports = SurgeryAnalysisTaskMeta;
