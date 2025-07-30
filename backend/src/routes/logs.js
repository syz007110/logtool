const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { getLogs, uploadLog, parseLog, downloadLog, deleteLog, getLogEntries } = require('../controllers/logController');
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
// 上传日志 - 所有用户都可以上传
router.post('/upload', auth, checkPermission('log:upload'), upload.array('file', 50), uploadLog); // 最多50个文件
// 解析日志 - 所有用户都可以解析
router.post('/:id/parse', auth, checkPermission('log:parse'), parseLog);
// 下载日志 - 所有用户都可以下载
router.get('/:id/download', auth, checkPermission('log:download'), downloadLog);
// 删除日志 - 根据用户角色决定删除权限
router.delete('/:id', auth, checkLogPermission('delete'), deleteLog);
// 获取日志明细 - 根据用户角色决定查看权限
router.get('/:id/entries', auth, checkLogPermission('read_all'), getLogEntries);

module.exports = router; 