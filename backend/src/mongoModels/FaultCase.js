const mongoose = require('mongoose');

const AttachmentSchema = new mongoose.Schema({
  url: { type: String, required: true },
  storage: { type: String, enum: ['local', 'oss'], required: true },
  filename: { type: String },
  original_name: { type: String },
  object_key: { type: String },
  mime_type: { type: String },
  size_bytes: { type: Number }
}, { _id: false });

const ReviewSchema = new mongoose.Schema({
  state: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
  submitted_at: { type: Date },
  reviewed_at: { type: Date },
  reviewed_by: { type: Number },
  comment: { type: String }
}, { _id: false });

const FaultCaseSchema = new mongoose.Schema({
  // 基础信息字段
  source: { type: String, enum: ['jira', 'manual'], default: 'manual' }, // 数据源：jira 或 手动输入
  jira_key: { type: String }, // JIRA 工单关键字，仅当 source=jira 时使用
  module: { type: String, default: '' }, // 模块/部件分类

  // 内容字段
  title: { type: String, required: true }, // 主要题目
  symptom: { type: String, default: '' }, // 故障现象描述
  possible_causes: { type: String, default: '' }, // 可能故障原因
  solution: { type: String, default: '' }, // 解决方案
  remark: { type: String, default: '' }, // 备注：工程师经验积累

  // 附件字段
  attachments: {
    type: [AttachmentSchema],
    default: [],
    validate: {
      validator: function(v) {
        return v.length <= 10;
      },
      message: '附件数量不能超过10个'
    }
  }, // 附件列表，最多10个

  // 关联字段
  related_error_code_ids: { type: [Number], default: [] }, // 关联的 MySQL error_codes ID
  equipment_model: { type: [String], default: [] }, // 设备型号，支持多选

  // 搜索辅助字段
  keywords: { type: [String], default: [] }, // 关键词标签

  // 未来扩展字段
  embedding: { type: [Number], default: undefined }, // 向量数据

  // 工作流字段
  status: { type: String, default: '' }, // 工作流状态，对应 fault_case_statuses 表的 status_key

  // 审计字段
  created_by: { type: Number, required: true }, // 创建者用户 ID（MySQL users 表）
  updated_by: { type: Number, required: true } // 更新者用户 ID（MySQL users 表）
}, {
  timestamps: true, // 自动管理 createdAt / updatedAt
  collection: 'fault_cases'
});

FaultCaseSchema.index({ status: 1, updatedAt: -1 });
FaultCaseSchema.index({ title: 'text', symptom: 'text', possible_causes: 'text', solution: 'text', remark: 'text', keywords: 'text' });
FaultCaseSchema.index({ related_error_code_ids: 1 });
FaultCaseSchema.index({ created_by: 1, updatedAt: -1 });
FaultCaseSchema.index({ source: 1, jira_key: 1 });
FaultCaseSchema.index(
  { jira_key: 1 },
  {
    unique: true,
    partialFilterExpression: { jira_key: { $type: 'string' } }
  }
);

module.exports = mongoose.models.FaultCase || mongoose.model('FaultCase', FaultCaseSchema);


