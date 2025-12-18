const path = require('path');
const fs = require('fs');
const Feedback = require('../models/feedback');
const FeedbackImage = require('../models/feedback_image');

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

exports.createFeedback = async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const title = (req.body?.title || '').trim();
    const description = (req.body?.description || '').trim();

    if (!title) {
      return res.status(400).json({ message: '标题不能为空' });
    }
    if (title.length > 100) {
      return res.status(400).json({ message: '标题不能超过100字' });
    }

    if (!description) {
      return res.status(400).json({ message: '描述不能为空' });
    }
    if (description.length > 500) {
      return res.status(400).json({ message: '描述不能超过500字' });
    }

    const files = req.files || [];
    if (files.length > 3) {
      return res.status(400).json({ message: '最多上传3张图片' });
    }

    const feedback = await Feedback.create({
      user_id: userId,
      title,
      description,
      status: 'open',
      created_at: new Date(),
      updated_at: new Date()
    });

    const root = path.resolve(__dirname, '../../uploads/feedback');
    const savedImages = [];
    for (const f of files) {
      const relativePath = path.relative(root, f.path).split(path.sep).join('/');
      const url = `/static/feedback/${relativePath}`;
      savedImages.push(await FeedbackImage.create({
        feedback_id: feedback.id,
        url,
        storage_key: f.path,
        size_bytes: f.size,
        created_at: new Date()
      }));
    }

    return res.json({ id: feedback.id, title: feedback.title, status: feedback.status, createdAt: feedback.created_at, images: savedImages.map(i => i.url) });
  } catch (err) {
    console.error('创建反馈失败:', err);
    return res.status(500).json({ message: '创建反馈失败' });
  }
};


// 获取反馈列表（分页、按状态筛选）
exports.listFeedbacks = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || '10', 10), 1), 100);
    const status = (req.query.status || '').trim();

    const where = {};
    if (status && ['open', 'in_progress', 'resolved'].includes(status)) {
      where.status = status;
    }

    const { count, rows } = await Feedback.findAndCountAll({
      where,
      include: [{ model: FeedbackImage, as: 'images', attributes: ['id', 'url'] }],
      order: [['created_at', 'DESC']],
      offset: (page - 1) * pageSize,
      limit: pageSize
    });

    const items = rows.map(fb => ({
      id: fb.id,
      title: fb.title,
      status: fb.status,
      created_at: fb.created_at,
      images: (fb.images || []).map(i => i.url)
    }));

    return res.json({ total: count, items, page, pageSize });
  } catch (err) {
    console.error('获取反馈列表失败:', err);
    return res.status(500).json({ message: '获取反馈列表失败' });
  }
};

// 获取反馈详情
exports.getFeedbackDetail = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const feedback = await Feedback.findByPk(id, {
      include: [{ model: FeedbackImage, as: 'images', attributes: ['id', 'url', 'size_bytes', 'created_at'] }]
    });
    if (!feedback) {
      return res.status(404).json({ message: '反馈不存在' });
    }
    return res.json({
      id: feedback.id,
      title: feedback.title,
      description: feedback.description,
      status: feedback.status,
      created_at: feedback.created_at,
      images: (feedback.images || []).map(i => ({ id: i.id, url: i.url }))
    });
  } catch (err) {
    console.error('获取反馈详情失败:', err);
    return res.status(500).json({ message: '获取反馈详情失败' });
  }
};

// 更新反馈状态
exports.updateFeedbackStatus = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const status = (req.body?.status || '').trim();
    const allowed = ['open', 'in_progress', 'resolved'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: '无效的状态' });
    }
    const feedback = await Feedback.findByPk(id);
    if (!feedback) {
      return res.status(404).json({ message: '反馈不存在' });
    }
    feedback.status = status;
    feedback.updated_at = new Date();
    await feedback.save();
    return res.json({ id: feedback.id, status: feedback.status });
  } catch (err) {
    console.error('更新反馈状态失败:', err);
    return res.status(500).json({ message: '更新反馈状态失败' });
  }
};

