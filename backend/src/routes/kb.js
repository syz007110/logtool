const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');
const kbStorage = require('../config/kbStorage');
const {
  kbStatus,
  kbSearch,
  kbCreateIndex,
  kbReindex,
  listKbDocuments,
  uploadKbDocuments,
  deleteKbDocument,
  downloadKbDocument,
  rebuildKbDocument,
  getChunkContent,
  listKbFileTypes,
  createKbFileType,
  updateKbFileType,
  deleteKbFileType
} = require('../controllers/kbController');

// Upload (temp) -> then move/put to OSS
const uploadDir = kbStorage.ensureTempDir();
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '';
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: kbStorage.MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    // mime best-effort; also allow by extension later in controller
    if (kbStorage.ALLOWED_MIMES.length && file.mimetype && !kbStorage.ALLOWED_MIMES.includes(file.mimetype)) {
      const err = new Error('UNSUPPORTED_FILE_TYPE');
      err.code = 'UNSUPPORTED_FILE_TYPE';
      return cb(err);
    }
    return cb(null, true);
  }
});

function requireReindexToken(req, res, next) {
  const expected = String(process.env.KB_REINDEX_TOKEN || '').trim();
  if (!expected) return next(); // not configured -> allow

  const token =
    String(req.headers['x-kb-token'] || '').trim() ||
    String(req.headers['x-reindex-token'] || '').trim() ||
    String(req.query?.token || '').trim();

  if (!token || token !== expected) {
    return res.status(403).json({ ok: false, message: 'Forbidden: invalid KB_REINDEX_TOKEN' });
  }
  return next();
}

// Status / connectivity
router.get('/status', auth, checkPermission('kb:read'), kbStatus);
// Search (snippets only)
router.get('/search', auth, checkPermission('kb:read'), kbSearch);
// Create index manually
router.post('/index/create', auth, checkPermission('kb:rebuild'), requireReindexToken, kbCreateIndex);
// Manual reindex (full index rebuild)
router.post('/reindex', auth, checkPermission('kb:rebuild'), requireReindexToken, kbReindex);

// KB 文件类型（字典配置）
router.get('/file-types', auth, checkPermission('kb:read'), listKbFileTypes);
router.post('/file-types', auth, checkPermission('fault_case_config:manage'), createKbFileType);
router.put('/file-types/:id', auth, checkPermission('fault_case_config:manage'), updateKbFileType);
router.delete('/file-types/:id', auth, checkPermission('fault_case_config:manage'), deleteKbFileType);

// Admin: KB documents
router.get('/documents', auth, checkPermission('kb:read'), listKbDocuments);
router.get('/documents/:id/download', auth, checkPermission('kb:read'), downloadKbDocument);
router.post('/documents/:id/rebuild', auth, checkPermission('kb:rebuild'), rebuildKbDocument);
// Get chunk full content
router.get('/chunks/:docId/:chunkNo', auth, checkPermission('kb:read'), getChunkContent);
router.post(
  '/documents/upload',
  auth,
  checkPermission('kb:upload'),
  (req, res, next) => {
    upload.array('files', kbStorage.MAX_FILES)(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ success: false, message: `单个文件不能超过 ${Math.round(kbStorage.MAX_FILE_SIZE / (1024 * 1024))}MB` });
        }
        if (err.message === 'UNSUPPORTED_FILE_TYPE') {
          return res.status(400).json({ success: false, message: '文件类型不支持' });
        }
        return res.status(400).json({ success: false, message: err.message || '上传失败' });
      }
      return uploadKbDocuments(req, res, next);
    });
  }
);
router.delete('/documents/:id', auth, checkPermission('kb:delete'), deleteKbDocument);

module.exports = router;

