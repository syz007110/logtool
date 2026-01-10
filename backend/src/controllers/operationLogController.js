const OperationLog = require('../models/operation_log');
const User = require('../models/user');
const { Op } = require('sequelize');
const { normalizePagination, MAX_PAGE_SIZE } = require('../constants/pagination');

// 安全解析 JSON 的辅助函数
function safeJsonParse(value) {
  if (!value) return null;
  
  // 如果已经是对象，直接返回
  if (typeof value === 'object' && value !== null) {
    return value;
  }
  
  // 如果是字符串，尝试解析
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      console.warn('JSON 解析失败:', error.message, '原始值:', value);
      // 如果是 [object Object] 这样的字符串，返回一个错误信息对象
      if (value === '[object Object]') {
        return { error: 'Invalid JSON format', originalValue: value };
      }
      return { rawData: value };
    }
  }
  
  // 其他类型直接返回
  return value;
}

// 查询操作日志，支持分页和日期过滤
const getOperationLogs = async (req, res) => {
  try {
    const { date } = req.query;
    const { page, limit } = normalizePagination(req.query.page, req.query.limit, MAX_PAGE_SIZE.STANDARD);
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
      include: [
        {
          model: User,
          as: 'User',
          attributes: ['id', 'username', 'email']
        }
      ],
      order: [['time', 'DESC']],
      offset: (page - 1) * limit,
      limit
    });

    // 格式化返回数据
    const formattedLogs = rows.map(log => ({
      id: log.id,
      operation: log.operation,
      description: log.description,
      user: log.User ? log.User.username : '未知用户',
      time: log.time,
      status: log.status || 'success',
      ip: log.ip,
      userAgent: log.user_agent,
      details: safeJsonParse(log.details)
    }));

    res.json({ 
      total: count, 
      logs: formattedLogs,
      page,
      limit
    });
  } catch (err) {
    console.error('查询操作日志失败:', err);
    res.status(500).json({ message: '查询操作日志失败', error: err.message });
  }
};

module.exports = { getOperationLogs }; 