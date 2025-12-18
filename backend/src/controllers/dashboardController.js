const User = require('../models/user');
const ErrorCode = require('../models/error_code');
const Device = require('../models/device');

// 获取全局统计数据
const getDashboardStats = async (req, res) => {
  try {
    // 并行执行所有 count 查询，大幅提升性能
    const [
      usersCount,
      errorCodesCount,
      devicesCount
    ] = await Promise.all([
      User.count(),
      ErrorCode.count(),
      Device.count()
    ]);
    
    res.json({
      success: true,
      data: {
        usersCount,
        errorCodesCount,
        devicesCount
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
