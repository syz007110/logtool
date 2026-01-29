const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { 
  getLogs, 
  getLogsByDevice,
  getLogTimeFilters,
  uploadLog, 
  parseLog, 
  downloadLog, 
  deleteLog, 
  batchDeleteLogs,
  batchDownloadLogs,
  getBatchDownloadTaskStatus,
  downloadBatchDownloadResult,
  getLogEntries,
  getBatchLogEntriesClickhouse,
  getLogStatistics,
  autoFillDeviceId,
  autoFillKey,
  analyzeSurgeryData,
  getSearchTemplates,
  importSearchTemplates,
  exportBatchLogEntriesCSV,
  getExportCsvTaskStatus,
  downloadExportCsvResult,
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
router.get('/entries/batch', auth, checkLogPermission('read_all'), rateLimiters.batchSearch, getBatchLogEntriesClickhouse);

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

// 获取时间筛选可选项
router.get('/time-filters', auth, checkLogPermission('read_all'), getLogTimeFilters);

// 获取按设备分组的日志列表
router.get('/by-device', auth, checkLogPermission('read_all'), getLogsByDevice);

// 获取队列状态
router.get('/queue/status', auth, getQueueStatus);

// 自动填充API - 必须放在带参数的路由之前
router.get('/auto-fill/device-id', auth, autoFillDeviceId);
router.get('/auto-fill/key', auth, autoFillKey);

// 上传日志 - 所有用户都可以上传
router.post('/upload', auth, checkPermission('log:upload'), upload.array('file', 50), uploadLog); // 最多50个文件

// 批量删除日志 - 必须放在带参数的路由之前
router.delete('/batch', auth, checkLogPermission('delete'), batchDeleteLogs);

// 批量下载日志 - 必须放在带参数的路由之前
router.post('/batch/download', auth, checkLogPermission('download'), batchDownloadLogs);
// 查询批量下载任务状态
router.get('/batch/download/:taskId/status', auth, checkLogPermission('download'), getBatchDownloadTaskStatus);
// 下载批量下载任务结果
router.get('/batch/download/:taskId/result', auth, checkLogPermission('download'), downloadBatchDownloadResult);

// 批量重新解析（仅管理员）
router.post('/batch/reparse', auth, checkPermission('log:reparse'), batchReparseLogs);

// 带参数的路由 - 必须放在具体路径之后
router.post('/:id/parse', auth, checkPermission('log:upload'), parseLog);
// 单个重新解析（仅管理员）
router.post('/:id/reparse', auth, checkPermission('log:reparse'), reparseLog);
router.get('/:id/download', auth, checkPermission('log:download'), downloadLog);
router.delete('/:id', auth, checkLogPermission('delete'), deleteLog);
// 获取日志明细 - 根据用户角色决定查看权限
router.get('/:id/entries', auth, checkLogPermission('read_all'), getLogEntries);

// 批量导出日志明细 CSV（异步队列模式）
router.get('/entries/export', auth, checkLogPermission('read_all'), exportBatchLogEntriesCSV);
// 查询CSV导出任务状态
router.get('/entries/export/:taskId/status', auth, checkLogPermission('read_all'), getExportCsvTaskStatus);
// 下载CSV导出任务结果
router.get('/entries/export/:taskId/result', auth, checkLogPermission('read_all'), downloadExportCsvResult);

// 手术统计分析
router.get('/:logId/surgery-analysis', auth, checkLogPermission('read_all'), analyzeSurgeryData);

// 搜索模板
router.get('/search-templates', auth, checkLogPermission('read_all'), getSearchTemplates);
router.post('/search-templates/import', auth, checkLogPermission('read_all'), importSearchTemplates);

// 内部维护接口（默认关闭，仅当显式启用时才开放）。不依赖权限系统，避免暴露多余权限键。
if (process.env.ENABLE_LOG_MAINTENANCE === 'true') {
  router.post('/cleanup-stuck', auth, cleanupStuckLogs);
  router.get('/stuck-stats', auth, getStuckLogsStats);
}

// 已移除：自然语言 -> 高级筛选表达式

module.exports = router; 