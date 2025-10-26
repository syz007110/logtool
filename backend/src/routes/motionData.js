const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');
const {
  uploadBinary,
  getMotionFormat,
  getDhModelConfig,
  previewParsedData,
  downloadCsv,
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

// Config endpoints - admin only
router.get('/config', auth, checkPermission('data_replay:manage'), getMotionFormat);
router.get('/dh-model', auth, checkPermission('data_replay:manage'), getDhModelConfig);

// Upload binary - admin only
router.post('/upload', auth, checkPermission('data_replay:manage'), upload.single('file'), uploadBinary);

// Preview parsed data - admin only
router.get('/:id/preview', auth, checkPermission('data_replay:manage'), previewParsedData);

// Download CSV - admin only
router.get('/:id/download-csv', auth, checkPermission('data_replay:manage'), downloadCsv);

module.exports = router;


