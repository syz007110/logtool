const OperationLog = require('../models/operation_log');
const { Op } = require('sequelize');

// 查询操作日志，支持分页和日期过滤
const getOperationLogs = async (req, res) => {
  try {
    const { page = 1, limit = 20, date } = req.query;
    const where = {};
    if (date) {
      // 过滤某一天的日志
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      where.time = { [Op.gte]: start, [Op.lt]: end };
    }
    const { count, rows } = await OperationLog.findAndCountAll({
      where,
      order: [['time', 'DESC']],
      offset: (page - 1) * limit,
      limit: parseInt(limit)
    });
    res.json({ total: count, logs: rows });
  } catch (err) {
    res.status(500).json({ message: '查询操作日志失败', error: err.message });
  }
};

module.exports = { getOperationLogs }; 