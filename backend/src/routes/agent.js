const express = require('express');
const { executeAgentTask, getAgentTask } = require('../controllers/agentController');
const { uploadAgentAssets, MAX_FILES, MAX_FILE_SIZE, ALLOWED_MIMES } = require('../controllers/agentAssetController');
const auth = require('../middlewares/auth');
const enrichAgentUser = require('../middlewares/enrichAgentUser');
const { checkPermission } = require('../middlewares/permission');
const { ensureTempDir } = require('../config/agentAssetStorage');
const multer = require('multer');
const path = require('path');

const router = express.Router();

const uploadDir = ensureTempDir();
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
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const mime = String(file?.mimetype || '').trim().toLowerCase()
    const allow = (() => {
      if (!mime) return false
      if (ALLOWED_MIMES.length === 0) return true
      return ALLOWED_MIMES.some((rule) => {
        const r = String(rule || '').trim().toLowerCase()
        if (!r) return false
        if (r === '*/*') return true
        if (r.endsWith('/*')) {
          const prefix = r.slice(0, -1)
          return mime.startsWith(prefix)
        }
        return mime === r
      })
    })()
    if (!allow) {
      const err = new Error('UNSUPPORTED_FILE_TYPE');
      err.code = 'UNSUPPORTED_FILE_TYPE';
      return cb(err);
    }
    return cb(null, true);
  }
});

router.post(
  '/assets/upload',
  auth,
  checkPermission('smart_search:use'),
  (req, res, next) => {
    upload.array('files', MAX_FILES)(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ message: `单个附件不能超过 ${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB` });
        }
        if (err.message === 'UNSUPPORTED_FILE_TYPE') {
          return res.status(400).json({ message: '文件类型不支持' });
        }
        return res.status(400).json({ message: err.message || '上传失败' });
      }
      return uploadAgentAssets(req, res, next);
    });
  }
);

router.post('/execute', auth, enrichAgentUser, checkPermission('smart_search:use'), executeAgentTask);
router.get('/tasks/:taskId', getAgentTask);

module.exports = router;
