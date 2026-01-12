const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true
  },
  type: {
    type: String,
    enum: ['search_result', null],
    default: null
  },
  content: {
    type: String,
    default: ''
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  recommendation: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  createdAt: {
    type: String,
    required: true
  }
}, { _id: false });

const MetadataSchema = new mongoose.Schema({
  intent: {
    type: String,
    enum: ['troubleshoot', 'lookup_fault_code', 'find_case', 'definition', 'how_to_use', 'other'],
    default: null
  },
  totalQueries: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  lastQueryText: {
    type: String,
    default: ''
  },
  llmProvider: {
    type: String,
    default: null
  },
  llmModel: {
    type: String,
    default: null
  }
}, { _id: false });

const SmartSearchConversationSchema = new mongoose.Schema({
  // 用户关联
  user_id: {
    type: Number,
    required: true,
    index: true
  },

  // 对话基本信息
  title: {
    type: String,
    required: true,
    default: '新对话',
    maxlength: 50
  },

  // 消息列表
  messages: {
    type: [MessageSchema],
    default: [],
    validate: {
      validator: function(v) {
        // 每个对话最多 5 个 user 消息
        const userMessages = v.filter(m => m && m.role === 'user');
        return userMessages.length <= 5;
      },
      message: '每个对话最多 5 个问题'
    }
  },

  // 元数据（用于统计分析）
  metadata: {
    type: MetadataSchema,
    default: () => ({})
  },

  // 审计字段
  created_by: {
    type: Number,
    required: true
  },
  updated_by: {
    type: Number,
    required: true
  }
}, {
  timestamps: true, // 自动管理 createdAt / updatedAt
  collection: 'smart_search_conversations'
});

// 索引
SmartSearchConversationSchema.index({ user_id: 1, updatedAt: -1 }); // 用户对话列表查询（主要索引）
SmartSearchConversationSchema.index({ user_id: 1, createdAt: -1 }); // 用户对话创建时间排序
SmartSearchConversationSchema.index({ 'metadata.intent': 1, createdAt: -1 }); // 意图统计分析

// TTL 索引（可选，自动删除180天前的对话）
// 如果需要启用，取消下面的注释并设置环境变量
// const ttlDays = Number.parseInt(process.env.SMART_SEARCH_CONVERSATION_TTL_DAYS || '0', 10);
// if (ttlDays > 0) {
//   SmartSearchConversationSchema.index({ createdAt: 1 }, { expireAfterSeconds: ttlDays * 24 * 60 * 60 });
// }

module.exports = mongoose.models.SmartSearchConversation || mongoose.model('SmartSearchConversation', SmartSearchConversationSchema);
