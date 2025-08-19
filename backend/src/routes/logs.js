const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { 
  getLogs, 
  uploadLog, 
  parseLog, 
  downloadLog, 
  deleteLog, 
  batchDeleteLogs,
  batchDownloadLogs,
  getLogEntries,
  getBatchLogEntries,
  autoFillDeviceId,
  autoFillKey,
  analyzeSurgeryData,
  getSearchTemplates,
  importSearchTemplates,
  exportBatchLogEntriesCSV,
  reparseLog,
  batchReparseLogs
} = require('../controllers/logController');
const auth = require('../middlewares/auth');
const { checkPermission, checkLogPermission } = require('../middlewares/permission');

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

// 批量获取日志明细（用于分析功能）
router.get('/entries/batch', auth, checkLogPermission('read_all'), getBatchLogEntries);

// 批量导出日志明细 CSV（服务端流式导出）
router.get('/entries/export', auth, checkLogPermission('read_all'), exportBatchLogEntriesCSV);

// 手术统计分析
router.get('/:logId/surgery-analysis', auth, checkLogPermission('read_all'), analyzeSurgeryData);

// 搜索模板
router.get('/search-templates', auth, checkLogPermission('read_all'), getSearchTemplates);
router.post('/search-templates/import', auth, checkLogPermission('read_all'), importSearchTemplates);

// 已移除：自然语言 -> 高级筛选表达式

module.exports = router; 