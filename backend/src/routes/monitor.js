/**
 * 监控路由
 * 提供目录监控和自动上传的API端点
 */

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');

const {
  getMonitorConfig,
  updateMonitorConfig,
  resetMonitorConfig,
  getMonitorStatus,
  startMonitor,
  stopMonitor,
  addMonitorDirectory,
  removeMonitorDirectory,
  getDeviceIdFormats,
  clearProcessedFiles,
  retryFailedFiles
} = require('../controllers/monitorController');

/**
 * @route GET /api/monitor/config
 * @desc 获取监控配置
 * @access Private (需要认证)
 */
router.get('/config', auth, getMonitorConfig);

/**
 * @route PUT /api/monitor/config
 * @desc 更新监控配置
 * @access Private (需要认证)
 */
router.put('/config', auth, updateMonitorConfig);

/**
 * @route POST /api/monitor/config/reset
 * @desc 重置监控配置为默认值
 * @access Private (需要认证)
 */
router.post('/config/reset', auth, resetMonitorConfig);

/**
 * @route GET /api/monitor/status
 * @desc 获取监控状态
 * @access Private (需要认证)
 */
router.get('/status', auth, getMonitorStatus);

/**
 * @route POST /api/monitor/start
 * @desc 启动监控服务
 * @access Private (需要认证)
 */
router.post('/start', auth, startMonitor);

/**
 * @route POST /api/monitor/stop
 * @desc 停止监控服务
 * @access Private (需要认证)
 */
router.post('/stop', auth, stopMonitor);

/**
 * @route POST /api/monitor/directory/add
 * @desc 添加监控目录
 * @access Private (需要认证)
 */
router.post('/directory/add', auth, addMonitorDirectory);

/**
 * @route POST /api/monitor/directory/remove
 * @desc 移除监控目录
 * @access Private (需要认证)
 */
router.post('/directory/remove', auth, removeMonitorDirectory);

/**
 * @route GET /api/monitor/formats
 * @desc 获取支持的设备编号格式
 * @access Private (需要认证)
 */
router.get('/formats', auth, getDeviceIdFormats);

/**
 * @route POST /api/monitor/files/clear
 * @desc 清理已处理的文件记录
 * @access Private (需要认证)
 */
router.post('/files/clear', auth, clearProcessedFiles);

/**
 * @route POST /api/monitor/files/retry
 * @desc 重试失败的文件
 * @access Private (需要认证)
 */
router.post('/files/retry', auth, retryFailedFiles);

module.exports = router;
