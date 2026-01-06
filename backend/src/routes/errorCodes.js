const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');
const multer = require('multer');
const path = require('path');
const {
  MAX_IMAGES,
  MAX_IMAGE_SIZE,
  ALLOWED_MIMES,
  ensureTempDir
} = require('../config/techSolutionStorage');
const {
  createErrorCode,
  getErrorCodes,
  updateErrorCode,
  deleteErrorCode,
  exportErrorCodesToXML,
  exportMultiLanguageXML,
  getErrorCodeByCodeAndSubsystem,
  exportErrorCodesToCSV,
  uploadTechSolutionImages,
  getTechSolutionDetail,
  updateTechSolutionDetail,
  cleanupTempTechFiles
} = require('../controllers/errorCodeController');
const {
  getErrorCodeI18nByLang,
  saveErrorCodeI18nByLang,
  autoTranslateErrorCodeI18n
} = require('../controllers/i18nErrorCodeController');

// 技术排查方案图片上传（仅图片）
const techSolutionUploadDir = ensureTempDir();
const techSolutionStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, techSolutionUploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '';
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${ext}`);
  }
});
const techSolutionUpload = multer({
  storage: techSolutionStorage,
  limits: { fileSize: MAX_IMAGE_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      const err = new Error('ONLY_IMAGE_ALLOWED');
      err.code = 'ONLY_IMAGE_ALLOWED';
      return cb(err);
    }
    cb(null, true);
  }
});

// 查询（支持简单/高级搜索）- 需要 error_code:read 权限
router.get('/', auth, checkPermission('error_code:read'), getErrorCodes);
// 根据故障码和子系统查找故障码 - 所有已登录用户可用
router.get('/by-code', auth, getErrorCodeByCodeAndSubsystem);
// XML导出 - 需要 error_code:read 权限
router.get('/export/xml', auth, checkPermission('error_code:read'), exportErrorCodesToXML);
// 多语言XML导出 - 需要 error_code:read 权限
router.get('/export/multi-xml', auth, checkPermission('error_code:read'), exportMultiLanguageXML);
// CSV导出 - 需要 error_code:read 权限
router.get('/export/csv', auth, checkPermission('error_code:read'), exportErrorCodesToCSV);

// 技术排查方案：上传/获取/更新
router.post(
  '/tech-solution/upload',
  auth,
  checkPermission('error_code:update'),
  (req, res, next) => {
    techSolutionUpload.array('files', MAX_IMAGES)(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ message: `单个附件不能超过 ${Math.round(MAX_IMAGE_SIZE / (1024 * 1024))}MB` });
        }
        if (err.message === 'ONLY_IMAGE_ALLOWED' || err.message === 'UNSUPPORTED_FILE_TYPE') {
          return res.status(400).json({ message: '文件类型不支持' });
        }
        return res.status(400).json({ message: err.message || '上传失败' });
      }
      return uploadTechSolutionImages(req, res, next);
    });
  }
);
router.post('/tech-solution/cleanup-temp', auth, checkPermission('error_code:update'), cleanupTempTechFiles);
// 获取技术排查方案 - 所有已登录用户可用（与 /by-code 保持一致，避免依赖权限表）
router.get('/:id/tech-solution', auth, getTechSolutionDetail);
router.put('/:id/tech-solution', auth, checkPermission('error_code:update'), updateTechSolutionDetail);

// 新增 - 需要 error_code:create 权限
router.post('/', auth, checkPermission('error_code:create'), createErrorCode);
// 更新 - 需要 error_code:update 权限
router.put('/:id', auth, checkPermission('error_code:update'), updateErrorCode);
// 删除 - 需要 error_code:delete 权限
router.delete('/:id', auth, checkPermission('error_code:delete'), deleteErrorCode);

// 获取故障码的指定语言的多语言内容（技术说明字段）- 需要 error_code:read 权限
router.get('/:id/i18n', auth, checkPermission('error_code:read'), getErrorCodeI18nByLang);

// 保存故障码的指定语言的多语言内容（技术说明字段）- 需要 error_code:update 权限
router.put('/:id/i18n', auth, checkPermission('error_code:update'), saveErrorCodeI18nByLang);

// 自动翻译故障码的技术说明字段 - 需要 error_code:update 权限
router.post('/:id/i18n/auto-translate', auth, checkPermission('error_code:update'), autoTranslateErrorCodeI18n);

module.exports = router; 