const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { 
  getLogs, 
  getLogsByDevice,
  uploadLog, 
  parseLog, 
  downloadLog, 
  deleteLog, 
  batchDeleteLogs,
  batchDownloadLogs,
  getLogEntries,
  getBatchLogEntries,
  getLogStatistics,
  autoFillDeviceId,
  autoFillKey,
  analyzeSurgeryData,
  getSearchTemplates,
  importSearchTemplates,
  exportBatchLogEntriesCSV,
  reparseLog,
  batchReparseLogs,
  getQueueStatus,
  getVisualizationData,
  cleanupStuckLogs,
  getStuckLogsStats
} = require('../controllers/logController');
const auth = require('../middlewares/auth');
const { checkPermission, checkLogPermission } = require('../middlewares/permission');
const { createRateLimitersWithFallback } = require('../config/rateLimit');

// 创建速率限制器（带降级机制）
const rateLimiters = createRateLimitersWithFallback();

// 应用批量搜索速率限制（可通过环境变量禁用）
router.get('/entries/batch', auth, checkLogPermission('read_all'), rateLimiters.batchSearch, getBatchLogEntries);

// 获取日志统计信息（用于计数功能）
router.get('/entries/statistics', auth, checkLogPermission('read_all'), getLogStatistics);

// 获取可视化数据（专门用于图表生成）
router.get('/entries/visualization', auth, checkLogPermission('read_all'), getVisualizationData);

const UPLOAD_DIR = path.join(__dirname, '../../uploads/logs');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// 日志列表 - 根据用户角色决定查看权限
router.get('/', auth, checkLogPermission('read_all'), getLogs);

// 获取按设备分组的日志列表
router.get('/by-device', auth, checkLogPermission('read_all'), getLogsByDevice);

// 获取队列状态
router.get('/queue/status', auth, checkPermission('log:read_own'), getQueueStatus);

// 自动填充API - 必须放在带参数的路由之前
router.get('/auto-fill/device-id', auth, checkPermission('log:read_own'), autoFillDeviceId);
router.get('/auto-fill/key', auth, checkPermission('log:read_own'), autoFillKey);

// 上传日志 - 所有用户都可以上传
router.post('/upload', auth, checkPermission('log:upload'), upload.array('file', 50), uploadLog); // 最多50个文件

// 批量删除日志 - 必须放在带参数的路由之前
router.delete('/batch', auth, checkLogPermission('delete'), batchDeleteLogs);

// 批量下载日志 - 必须放在带参数的路由之前
router.post('/batch/download', auth, checkLogPermission('download'), batchDownloadLogs);

// 批量重新解析（仅管理员）
router.post('/batch/reparse', auth, checkPermission('log:reparse'), batchReparseLogs);

// 带参数的路由 - 必须放在具体路径之后
router.post('/:id/parse', auth, checkPermission('log:parse'), parseLog);
// 单个重新解析（仅管理员）
router.post('/:id/reparse', auth, checkPermission('log:reparse'), reparseLog);
router.get('/:id/download', auth, checkPermission('log:download'), downloadLog);
router.delete('/:id', auth, checkLogPermission('delete'), deleteLog);
// 获取日志明细 - 根据用户角色决定查看权限
router.get('/:id/entries', auth, checkLogPermission('read_all'), getLogEntries);

// 批量导出日志明细 CSV（服务端流式导出）
router.get('/entries/export', auth, checkLogPermission('read_all'), exportBatchLogEntriesCSV);

// 手术统计分析
router.get('/:logId/surgery-analysis', auth, checkLogPermission('read_all'), analyzeSurgeryData);

// 搜索模板
router.get('/search-templates', auth, checkLogPermission('read_all'), getSearchTemplates);
router.post('/search-templates/import', auth, checkLogPermission('read_all'), importSearchTemplates);

// 清理卡死日志
router.post('/cleanup-stuck', auth, checkPermission('log:admin'), cleanupStuckLogs);

// 获取卡死日志统计
router.get('/stuck-stats', auth, checkPermission('log:admin'), getStuckLogsStats);

// 已移除：自然语言 -> 高级筛选表达式

module.exports = router; 