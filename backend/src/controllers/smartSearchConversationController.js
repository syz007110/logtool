const mongoose = require('mongoose');
const { connectMongo, isMongoConnected } = require('../config/mongodb');
const SmartSearchConversation = require('../mongoModels/SmartSearchConversation');
const { normalizePagination, MAX_PAGE_SIZE } = require('../constants/pagination');

const MAX_CONVERSATIONS_PER_USER = Number.parseInt(process.env.SMART_SEARCH_CONVERSATION_MAX_PER_USER || '50', 10);
const MAX_QUESTIONS_PER_CONVERSATION = 5;

async function ensureMongoReady() {
  await connectMongo();
  return isMongoConnected();
}

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (mongoose.Types.ObjectId.isValid(id)) return new mongoose.Types.ObjectId(id);
  return null;
}

// 获取用户对话列表
const getConversations = async (req, res) => {
  try {
    if (!(await ensureMongoReady())) {
      return res.status(503).json({ message: 'MongoDB 未连接，对话功能不可用' });
    }

    const { page, limit } = normalizePagination(req.query.page, req.query.limit, MAX_PAGE_SIZE.STANDARD);
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: '未登录' });
    }

    const skip = (page - 1) * limit;
    const conversations = await SmartSearchConversation.find({ user_id: userId })
      .select('_id title messages metadata createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await SmartSearchConversation.countDocuments({ user_id: userId });

    // 格式化返回数据
    const formatted = conversations.map(conv => ({
      id: String(conv._id),
      title: conv.title || '新对话',
      messages: conv.messages || [],
      metadata: conv.metadata || {},
      createdAt: conv.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: conv.updatedAt?.toISOString() || new Date().toISOString()
    }));

    return res.json({
      conversations: formatted,
      total,
      page,
      limit
    });
  } catch (err) {
    console.error('[getConversations] error:', err);
    return res.status(500).json({ message: '获取对话列表失败', error: err.message });
  }
};

// 获取单个对话详情
const getConversation = async (req, res) => {
  try {
    if (!(await ensureMongoReady())) {
      return res.status(503).json({ message: 'MongoDB 未连接，对话功能不可用' });
    }

    const { id } = req.params;
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: '未登录' });
    }

    const convId = toObjectId(id);
    if (!convId) {
      return res.status(400).json({ message: '无效的对话 ID' });
    }

    const conversation = await SmartSearchConversation.findOne({
      _id: convId,
      user_id: userId
    }).lean();

    if (!conversation) {
      return res.status(404).json({ message: '对话不存在' });
    }

    // 格式化返回数据
    const formatted = {
      id: String(conversation._id),
      title: conversation.title || '新对话',
      messages: conversation.messages || [],
      metadata: conversation.metadata || {},
      createdAt: conversation.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: conversation.updatedAt?.toISOString() || new Date().toISOString()
    };

    return res.json({ conversation: formatted });
  } catch (err) {
    console.error('[getConversation] error:', err);
    return res.status(500).json({ message: '获取对话详情失败', error: err.message });
  }
};

// 创建新对话
const createConversation = async (req, res) => {
  try {
    if (!(await ensureMongoReady())) {
      return res.status(503).json({ message: 'MongoDB 未连接，对话功能不可用' });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: '未登录' });
    }

    const { title = '新对话', messages = [], metadata = {} } = req.body || {};

    // 验证消息数量
    const userMessages = messages.filter(m => m && m.role === 'user');
    if (userMessages.length > MAX_QUESTIONS_PER_CONVERSATION) {
      return res.status(400).json({ message: `每个对话最多 ${MAX_QUESTIONS_PER_CONVERSATION} 个问题` });
    }

    // 检查用户对话数量限制
    const userConversationCount = await SmartSearchConversation.countDocuments({ user_id: userId });
    if (userConversationCount >= MAX_CONVERSATIONS_PER_USER) {
      // 删除最旧的对话
      const oldest = await SmartSearchConversation.findOne({ user_id: userId })
        .sort({ createdAt: 1 })
        .select('_id')
        .lean();
      if (oldest) {
        await SmartSearchConversation.deleteOne({ _id: oldest._id });
      }
    }

    const conversation = await SmartSearchConversation.create({
      user_id: userId,
      title: String(title || '新对话').trim().slice(0, 50),
      messages: Array.isArray(messages) ? messages : [],
      metadata: {
        intent: metadata.intent || null,
        totalQueries: userMessages.length,
        lastQueryText: userMessages.length > 0 ? (userMessages[userMessages.length - 1].content || '') : '',
        llmProvider: metadata.llmProvider || null,
        llmModel: metadata.llmModel || null
      },
      created_by: userId,
      updated_by: userId
    });

    const formatted = {
      id: String(conversation._id),
      title: conversation.title,
      messages: conversation.messages,
      metadata: conversation.metadata,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString()
    };

    return res.status(201).json({
      message: '对话创建成功',
      conversation: formatted
    });
  } catch (err) {
    console.error('[createConversation] error:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: '数据验证失败', error: err.message });
    }
    return res.status(500).json({ message: '创建对话失败', error: err.message });
  }
};

// 更新对话（添加消息）
const updateConversation = async (req, res) => {
  try {
    if (!(await ensureMongoReady())) {
      return res.status(503).json({ message: 'MongoDB 未连接，对话功能不可用' });
    }

    const { id } = req.params;
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: '未登录' });
    }

    const convId = toObjectId(id);
    if (!convId) {
      return res.status(400).json({ message: '无效的对话 ID' });
    }

    const conversation = await SmartSearchConversation.findOne({
      _id: convId,
      user_id: userId
    });

    if (!conversation) {
      return res.status(404).json({ message: '对话不存在' });
    }

    const { title, messages, metadata } = req.body || {};

    // 更新标题
    if (title !== undefined) {
      conversation.title = String(title).trim().slice(0, 50);
    }

    // 更新消息列表
    if (Array.isArray(messages)) {
      // 验证消息数量
      const userMessages = messages.filter(m => m && m.role === 'user');
      if (userMessages.length > MAX_QUESTIONS_PER_CONVERSATION) {
        return res.status(400).json({ message: `每个对话最多 ${MAX_QUESTIONS_PER_CONVERSATION} 个问题` });
      }
      conversation.messages = messages;
    }

    // 更新元数据
    if (metadata) {
      const userMessages = (conversation.messages || []).filter(m => m && m.role === 'user');
      conversation.metadata = {
        intent: metadata.intent !== undefined ? metadata.intent : conversation.metadata?.intent,
        totalQueries: userMessages.length,
        lastQueryText: userMessages.length > 0 ? (userMessages[userMessages.length - 1].content || '') : (conversation.metadata?.lastQueryText || ''),
        llmProvider: metadata.llmProvider !== undefined ? metadata.llmProvider : conversation.metadata?.llmProvider,
        llmModel: metadata.llmModel !== undefined ? metadata.llmModel : conversation.metadata?.llmModel
      };
    }

    conversation.updated_by = userId;
    await conversation.save();

    const formatted = {
      id: String(conversation._id),
      title: conversation.title,
      messages: conversation.messages,
      metadata: conversation.metadata,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString()
    };

    return res.json({
      message: '对话更新成功',
      conversation: formatted
    });
  } catch (err) {
    console.error('[updateConversation] error:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: '数据验证失败', error: err.message });
    }
    return res.status(500).json({ message: '更新对话失败', error: err.message });
  }
};

// 删除对话
const deleteConversation = async (req, res) => {
  try {
    if (!(await ensureMongoReady())) {
      return res.status(503).json({ message: 'MongoDB 未连接，对话功能不可用' });
    }

    const { id } = req.params;
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: '未登录' });
    }

    const convId = toObjectId(id);
    if (!convId) {
      return res.status(400).json({ message: '无效的对话 ID' });
    }

    const result = await SmartSearchConversation.deleteOne({
      _id: convId,
      user_id: userId
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: '对话不存在或无权删除' });
    }

    return res.json({ message: '对话删除成功' });
  } catch (err) {
    console.error('[deleteConversation] error:', err);
    return res.status(500).json({ message: '删除对话失败', error: err.message });
  }
};

module.exports = {
  getConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation
};
