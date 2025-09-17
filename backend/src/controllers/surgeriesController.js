const { Op, Sequelize } = require('sequelize');
const Surgery = require('../models/surgery');
const LogEntry = require('../models/log_entry');
const Log = require('../models/log');

// 列表：支持 device_id 模糊筛选与分页
exports.listSurgeries = async (req, res) => {
  try {
    const { device_id, page = 1, limit = 20 } = req.query;
    const where = {};
    if (device_id) {
      // 精确匹配包含该设备编号的手术（PostgreSQL ARRAY contains）
      where.device_ids = { [Op.contains]: [String(device_id)] };
    }

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const offset = (pageNum - 1) * limitNum;

    const { rows, count } = await Surgery.findAndCountAll({
      where,
      order: [['start_time', 'DESC']],
      limit: limitNum,
      offset
    });

    res.json({ success: true, data: rows, total: count, page: pageNum, limit: limitNum });
  } catch (error) {
    console.error('listSurgeries error:', error);
    res.status(500).json({ success: false, message: '获取手术数据失败', error: error.message });
  }
};

// 获取单条
exports.getSurgeryById = async (req, res) => {
  try {
    const item = await Surgery.findByPk(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: '未找到手术数据' });
    res.json({ success: true, data: item });
  } catch (error) {
    console.error('getSurgeryById error:', error);
    res.status(500).json({ success: false, message: '获取手术数据失败', error: error.message });
  }
};

// 删除
exports.deleteSurgery = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const item = await Surgery.findByPk(id);
    if (!item) return res.status(404).json({ success: false, message: '未找到手术数据' });
    await item.destroy();
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('deleteSurgery error:', error);
    res.status(500).json({ success: false, message: '删除手术数据失败', error: error.message });
  }
};

// 通过手术记录上的日志条目ID范围提取日志条目
exports.getLogEntriesByRange = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const item = await Surgery.findByPk(id);
    if (!item) return res.status(404).json({ success: false, message: '未找到手术数据' });

    const startId = item.log_entry_start_id;
    const endId = item.log_entry_end_id;
    if (!startId || !endId) {
      return res.status(400).json({ success: false, message: '该手术缺少日志条目范围' });
    }

    const entries = await LogEntry.findAll({
      where: { id: { [Op.between]: [startId, endId] } },
      order: [['timestamp', 'ASC']],
      include: [{ model: Log, as: 'Log', attributes: ['original_name', 'device_id'] }]
    });
    res.json({ success: true, entries });
  } catch (error) {
    console.error('getLogEntriesByRange error:', error);
    res.status(500).json({ success: false, message: '获取日志条目失败', error: error.message });
  }
};


