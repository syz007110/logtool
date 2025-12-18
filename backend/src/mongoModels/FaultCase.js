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
  // Base (default zh-CN content)
  title: { type: String, required: true }, // 主要题目
  symptom: { type: String, default: '' }, // 描述现象
  possible_causes: { type: String, default: '' }, // 故障原因
  troubleshooting_steps: { type: String, default: '' }, // 排查流程步骤（SOP）
  experience: { type: String, default: '' }, // 工程师经验积累

  // Attachments (PDF/images etc.) - 上限10个附件
  attachments: {
    type: [AttachmentSchema],
    default: [],
    validate: {
      validator: function(v) {
        return v.length <= 10;
      },
      message: '附件数量不能超过10个'
    }
  },

  // Relations
  related_error_code_ids: { type: [Number], default: [] }, // 关联已有 MySQL 的error_codes，支持一对多
  device_id: { type: String, default: '' }, // 关联的devices的device_id

  // Search helpers
  keywords: { type: [String], default: [] }, // 关键词

  // Future
  embedding: { type: [Number], default: undefined }, // 未来用于向量数据库（Qdrant/Milvus/PGVector）

  // Workflow
  is_published: { type: Boolean, default: false }, // 草稿(false)/已发布(true)

  review: { type: ReviewSchema, default: () => ({ state: 'none' }) }, // ReviewSchema

  // Audit
  created_by: { type: Number, required: true }, // 创建者用户 ID（mysql中的 user表的id）
  updated_by: { type: Number, required: true }, // 更新者用户ID（mysql中的 user表的id）
  updated_at_user: { type: Date, default: null } // 用户手动指定的更新时间（用于展示排序）
}, {
  timestamps: true, // 自动管理 createdAt / updatedAt
  collection: 'fault_cases'
});

FaultCaseSchema.index({ is_published: 1, updatedAt: -1 });
FaultCaseSchema.index({ title: 'text', symptom: 'text', possible_causes: 'text', troubleshooting_steps: 'text', experience: 'text', keywords: 'text' });
FaultCaseSchema.index({ related_error_code_ids: 1 });
FaultCaseSchema.index({ created_by: 1, updatedAt: -1 });
FaultCaseSchema.index({ 'review.state': 1, updatedAt: -1 });

module.exports = mongoose.models.FaultCase || mongoose.model('FaultCase', FaultCaseSchema);


