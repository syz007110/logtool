const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const errorCodeCache = require('../services/errorCodeCache');
const cacheInitializer = require('../services/cacheInitializer');

// 获取缓存状态
router.get('/status', auth, async (req, res) => {
  try {
    const stats = errorCodeCache.getCacheStats();
    const initStatus = cacheInitializer.getStatus();
    
    res.json({
      success: true,
      data: {
        cache: stats,
        initialization: initStatus,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('获取缓存状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取缓存状态失败',
      error: error.message
    });
  }
});

// 重新加载缓存
router.post('/reload', auth, async (req, res) => {
  try {
    console.log('🔄 手动触发缓存重新加载...');
    
    await errorCodeCache.reloadCache();
    
    const stats = errorCodeCache.getCacheStats();
    
    res.json({
      success: true,
      message: '缓存重新加载成功',
      data: {
        cache: stats,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('重新加载缓存失败:', error);
    res.status(500).json({
      success: false,
      message: '重新加载缓存失败',
      error: error.message
    });
  }
});

// 清空缓存
router.post('/clear', auth, async (req, res) => {
  try {
    console.log('🗑️ 手动清空缓存...');
    
    errorCodeCache.clearCache();
    
    res.json({
      success: true,
      message: '缓存已清空',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('清空缓存失败:', error);
    res.status(500).json({
      success: false,
      message: '清空缓存失败',
      error: error.message
    });
  }
});

// 查找特定故障码（用于测试）
router.get('/errorcode/:subsystem/:code', auth, async (req, res) => {
  try {
    const { subsystem, code } = req.params;
    
    const errorCode = errorCodeCache.findErrorCode(subsystem, code);
    
    if (errorCode) {
      res.json({
        success: true,
        data: errorCode
      });
    } else {
      res.json({
        success: true,
        data: null,
        message: '未找到对应的故障码'
      });
    }
  } catch (error) {
    console.error('查找故障码失败:', error);
    res.status(500).json({
      success: false,
      message: '查找故障码失败',
      error: error.message
    });
  }
});

module.exports = router;
