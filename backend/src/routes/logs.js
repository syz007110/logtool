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
  getLogEntries,
  getBatchLogEntries,
  autoFillDeviceId,
  autoFillKey,
  analyzeSurgeryData
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

// 带参数的路由 - 必须放在具体路径之后
router.post('/:id/parse', auth, checkPermission('log:parse'), parseLog);
router.get('/:id/download', auth, checkPermission('log:download'), downloadLog);
router.delete('/:id', auth, checkLogPermission('delete'), deleteLog);

// 批量删除日志
router.delete('/batch', auth, checkLogPermission('delete'), batchDeleteLogs);
// 获取日志明细 - 根据用户角色决定查看权限
router.get('/:id/entries', auth, checkLogPermission('read_all'), getLogEntries);

// 批量获取日志明细（用于分析功能）
router.get('/entries/batch', auth, checkLogPermission('read_all'), getBatchLogEntries);

// 手术统计分析
router.get('/:logId/surgery-analysis', auth, checkLogPermission('read_all'), analyzeSurgeryData);

module.exports = router; 