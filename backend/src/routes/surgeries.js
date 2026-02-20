const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');
const surgeriesController = require('../controllers/surgeriesController');

// 列表：支持按设备编号筛选、分页
router.get('/', auth, checkPermission('surgery:read'), surgeriesController.listSurgeries);

// 获取按设备分组的手术数据列表（用于设备列表页，性能优化）
router.get('/by-device', auth, checkPermission('surgery:read'), surgeriesController.listSurgeriesByDevice);

// 获取时间筛选选项（年、月、日）
router.get('/time-filters', auth, checkPermission('surgery:read'), surgeriesController.getSurgeryTimeFilters);
// 获取设备手术分析任务元数据（详情抽屉失败行展示/分组重试）
router.get('/analysis-task-meta', auth, checkPermission('surgery:read'), surgeriesController.getAnalysisTaskMetaByDevice);

// 获取单条
router.get('/:id', auth, checkPermission('surgery:read'), surgeriesController.getSurgeryById);

// 删除
router.delete('/:id', auth, checkPermission('surgery:delete'), surgeriesController.deleteSurgery);

// 根据起止日志条目ID范围获取日志（用于“查看日志”）
router.get('/:id/log-entries', auth, checkPermission('surgery:read'), surgeriesController.getLogEntriesByRange);

module.exports = router;


