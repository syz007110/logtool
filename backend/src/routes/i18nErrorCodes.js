const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');
const {
  getI18nErrorCodes,
  upsertI18nErrorCode,
  deleteI18nErrorCode,
  batchImportI18nErrorCodes,
  getSupportedLanguages,
  getSubsystems,
  uploadCSV
} = require('../controllers/i18nErrorCodeController');

// 查询多语言故障码内容 - 需要 error_code:read 权限
router.get('/', auth, checkPermission('error_code:read'), getI18nErrorCodes);

// 获取支持的语言列表 - 需要 error_code:read 权限
router.get('/languages', auth, checkPermission('error_code:read'), getSupportedLanguages);

// 获取子系统号列表 - 需要 error_code:read 权限
router.get('/subsystems', auth, checkPermission('error_code:read'), getSubsystems);

// 创建或更新多语言故障码内容 - 需要 error_code:update 权限
router.post('/', auth, checkPermission('error_code:update'), upsertI18nErrorCode);

// 批量导入多语言故障码内容 - 需要 error_code:update 权限
router.post('/batch-import', auth, checkPermission('error_code:update'), batchImportI18nErrorCodes);

// CSV文件上传导入 - 需要 error_code:update 权限
const multer = require('multer');
const upload = multer({ 
  dest: 'uploads/temp/',
  fileFilter: (req, file, cb) => {
    // 检查文件类型
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传CSV文件'), false);
    }
  }
});
router.post('/upload-csv', auth, checkPermission('error_code:update'), upload.single('files'), uploadCSV);

// 删除多语言故障码内容 - 需要 error_code:delete 权限
router.delete('/:id', auth, checkPermission('error_code:delete'), deleteI18nErrorCode);

module.exports = router; 