const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const auth = require('../middlewares/auth');
const { checkPermission, checkPermissionAny } = require('../middlewares/permission');
const {
  uploadBinary,
  batchUploadBinary,
  getMotionFormat,
  getMotionFormatClassified,
  getDhModelConfig,
  previewParsedData,
  getSeriesByTimeRange,
  downloadCsv,
  batchDownloadCsv,
  batchDownload,
  getTaskStatus,
  getUserTasks,
  downloadTaskResult,
  listMotionDataFiles,
  listMotionDataFilesByDevice,
  getMotionDataTimeFilters,
  downloadMotionDataRaw,
  downloadMotionDataParsed,
  batchDownloadMotionDataRawZip,
  deleteMotionDataFile,
  batchDeleteMotionDataFiles,
} = require('../controllers/motionDataController');

const UPLOAD_DIR = path.join(__dirname, '../../uploads/temp');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + '-' + file.originalname);
  },
});
const upload = multer({ storage });

// ===== 重要：具体路由必须放在参数路由之前，避免被拦截 =====

// Config 只读接口：分析工具需加载分类配置，允许 log:read_all / data_replay:read / data_replay:manage 任一即可
router.get('/config/classified', auth, checkPermissionAny(['data_replay:manage', 'data_replay:read', 'log:read_all']), getMotionFormatClassified);
router.get('/config', auth, checkPermissionAny(['data_replay:manage', 'data_replay:read', 'log:read_all']), getMotionFormat);
router.get('/dh-model', auth, checkPermissionAny(['data_replay:manage', 'data_replay:read', 'log:read_all']), getDhModelConfig);

// Task status and result download - admin only (放在参数路由之前)
router.get('/tasks', auth, checkPermission('data_replay:manage'), getUserTasks);
router.get('/task/:taskId', auth, checkPermission('data_replay:manage'), getTaskStatus);
router.get('/task/:taskId/download', auth, checkPermission('data_replay:manage'), downloadTaskResult);

// Motion data metadata list / manage - admin only
router.get('/files', auth, checkPermission('data_replay:manage'), listMotionDataFiles);
router.get('/files/by-device', auth, checkPermission('data_replay:manage'), listMotionDataFilesByDevice);
router.get('/files/time-filters', auth, checkPermission('data_replay:manage'), getMotionDataTimeFilters);
router.post('/files/batch-delete', auth, checkPermission('data_replay:manage'), batchDeleteMotionDataFiles);
router.post('/files/batch-download/raw', auth, checkPermission('data_replay:manage'), batchDownloadMotionDataRawZip);
router.get('/files/:id/download/raw', auth, checkPermission('data_replay:manage'), downloadMotionDataRaw);
router.get('/files/:id/download/parsed', auth, checkPermission('data_replay:manage'), downloadMotionDataParsed);
router.get('/files/:id/series', auth, checkPermission('data_replay:manage'), getSeriesByTimeRange);
router.delete('/files/:id', auth, checkPermission('data_replay:manage'), deleteMotionDataFile);

// Upload binary - admin only
router.post('/upload', auth, checkPermission('data_replay:manage'), upload.single('file'), uploadBinary);
router.post('/batch-upload', auth, checkPermission('data_replay:manage'), upload.array('files', 5), batchUploadBinary);

// Batch download as ZIP - admin only (支持 CSV 和 JSONL 格式)
router.post('/batch-download', auth, checkPermission('data_replay:manage'), batchDownload);
router.post('/batch-download-csv', auth, checkPermission('data_replay:manage'), batchDownloadCsv);

// ===== 参数路由放在最后，避免拦截具体路由 =====
// Preview parsed data - admin only
router.get('/:id/preview', auth, checkPermission('data_replay:manage'), previewParsedData);
// Download CSV - admin only
router.get('/:id/download-csv', auth, checkPermission('data_replay:manage'), downloadCsv);

module.exports = router;


