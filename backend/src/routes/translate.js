const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middlewares/auth');
const {
  createTranslateTask,
  getTranslateTaskStatus,
  downloadTranslateTaskResult
} = require('../controllers/translateController');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

const UPLOAD_DIR = path.join(__dirname, '../../uploads/translate/input');
ensureDir(UPLOAD_DIR);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + '-' + file.originalname);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: Number.parseInt(process.env.TRANSLATE_UPLOAD_MAX_BYTES || '', 10) || 50 * 1024 * 1024 // 50MB
  }
});

// Create async translation task for a document file
router.post('/document', auth, upload.single('file'), createTranslateTask);

// Task status
router.get('/tasks/:taskId/status', auth, getTranslateTaskStatus);

// Download result (also supports query token via auth middleware)
router.get('/tasks/:taskId/result', auth, downloadTranslateTaskResult);

module.exports = router;

