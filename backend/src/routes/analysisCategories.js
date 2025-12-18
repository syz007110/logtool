const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');
const {
  getAnalysisCategories,
  createAnalysisCategory,
  updateAnalysisCategory,
  deleteAnalysisCategory,
  getPresets
} = require('../controllers/analysisCategoryController');

// 获取所有分析分类 - 需要登录即可访问
router.get('/', auth, getAnalysisCategories);

// 获取预设集合（ALL/FINE/KEY） - 需要登录即可访问
router.get('/presets', auth, getPresets);

// 创建分析分类 - 需要 loglevel:manage 权限
router.post('/', auth, checkPermission('loglevel:manage'), createAnalysisCategory);

// 更新分析分类 - 需要 loglevel:manage 权限
router.put('/:id', auth, checkPermission('loglevel:manage'), updateAnalysisCategory);

// 删除分析分类 - 需要 loglevel:manage 权限
router.delete('/:id', auth, checkPermission('loglevel:manage'), deleteAnalysisCategory);

module.exports = router;

