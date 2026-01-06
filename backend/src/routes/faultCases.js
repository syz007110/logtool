const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');
const multer = require('multer');
const path = require('path');

const {
  uploadFaultCaseAttachments,
  createFaultCase,
  updateFaultCase,
  deleteFaultCase,
  getFaultCaseDetail,
  listLatestFaultCases,
  searchFaultCases,
  getFaultCaseI18nByLang,
  saveFaultCaseI18nByLang,
  autoTranslateFaultCaseI18n,
  MAX_FILES,
  MAX_FILE_SIZE,
  ALLOWED_MIMES
} = require('../controllers/faultCaseController');

const { ensureTempDir } = require('../config/faultCaseStorage');

// Attachments upload (temp)
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
    if (ALLOWED_MIMES.length && !ALLOWED_MIMES.includes(file.mimetype)) {
      const err = new Error('UNSUPPORTED_FILE_TYPE');
      err.code = 'UNSUPPORTED_FILE_TYPE';
      return cb(err);
    }
    return cb(null, true);
  }
});

router.post(
  '/attachments/upload',
  auth,
  checkPermission('fault_case:create'),
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
      return uploadFaultCaseAttachments(req, res, next);
    });
  }
);

// Latest 5 cases (published)
router.get('/latest', auth, checkPermission('fault_case:read'), listLatestFaultCases);

// Search by keyword or errorCode
router.get('/search', auth, checkPermission('fault_case:read'), searchFaultCases);

// CRUD
router.post('/', auth, checkPermission('fault_case:create'), createFaultCase);
router.get('/:id', auth, checkPermission('fault_case:read'), getFaultCaseDetail);
router.put('/:id', auth, checkPermission('fault_case:update'), updateFaultCase);
router.delete('/:id', auth, checkPermission('fault_case:delete'), deleteFaultCase);

// i18n
router.get('/:id/i18n', auth, checkPermission('fault_case:read'), getFaultCaseI18nByLang);
router.put('/:id/i18n', auth, checkPermission('fault_case:update'), saveFaultCaseI18nByLang);
router.post('/:id/i18n/auto-translate', auth, checkPermission('fault_case:update'), autoTranslateFaultCaseI18n);

module.exports = router;


