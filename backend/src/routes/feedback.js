const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middlewares/auth');
const { createFeedback, listFeedbacks, getFeedbackDetail, updateFeedbackStatus } = require('../controllers/feedbackController');

const FEEDBACK_DIR = path.join(__dirname, '../../uploads/feedback');
if (!fs.existsSync(FEEDBACK_DIR)) {
  fs.mkdirSync(FEEDBACK_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const now = new Date();
    const subdir = path.join(FEEDBACK_DIR, String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
    fs.mkdirSync(subdir, { recursive: true });
    cb(null, subdir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, unique + ext);
  }
});

function fileFilter(req, file, cb) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error('仅支持 JPG/PNG/WebP 图片'));
  }
  cb(null, true);
}

const upload = multer({ storage, fileFilter, limits: { fileSize: 2 * 1024 * 1024, files: 3 } });

router.post('/', auth, upload.array('images', 3), createFeedback);
router.get('/', auth, listFeedbacks);
router.get('/:id', auth, getFeedbackDetail);
router.put('/:id/status', auth, updateFeedbackStatus);

module.exports = router;


