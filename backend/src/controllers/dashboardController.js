const LogEntry = require('../models/log_entry');
const Log = require('../models/log');
const User = require('../models/user');

// 获取全局统计数据
const getDashboardStats = async (req, res) => {
  try {
    // 获取故障码条目数量（log_entries表）
    const logEntriesCount = await LogEntry.count();
    
    // 获取日志总数量（logs表）
    const logsCount = await Log.count();
    
    // 获取用户数量（users表）
    const usersCount = await User.count();
    
    res.json({
      success: true,
      data: {
        logEntriesCount,
        logsCount,
        usersCount
      }
    });
  } catch (error) {
    console.error('获取统计数据失败:', error);
    res.status(500).json({
      success: false,
      message: '获取统计数据失败',
      error: error.message
    });
  }
};

module.exports = {
  getDashboardStats
};
