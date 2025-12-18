const express = require('express');
const router = express.Router();
const surgeryStatisticsController = require('../controllers/surgeryStatisticsController');
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');

// 获取手术统计数据（管理员、专家）
router.get('/', auth, checkPermission('surgery:read'), surgeryStatisticsController.getAllSurgeryStatistics);

// 分析已排序的日志条目（管理员、专家）
router.post('/analyze-sorted-entries', auth, checkPermission('surgery:read'), surgeryStatisticsController.analyzeSortedLogEntries);

// 通过日志ID列表分析手术数据（管理员、专家）
router.post('/analyze-by-log-ids', auth, checkPermission('surgery:read'), surgeryStatisticsController.analyzeByLogIds);

// 查询分析任务状态（管理员、专家）
router.get('/task/:taskId', auth, checkPermission('surgery:read'), surgeryStatisticsController.getAnalysisTaskStatus);

// 获取用户的分析任务列表（管理员、专家）
router.get('/tasks', auth, checkPermission('surgery:read'), surgeryStatisticsController.getUserAnalysisTasks);

// 导出手术报告（管理员、专家）
router.get('/:id/export', auth, checkPermission('surgery:export'), surgeryStatisticsController.exportSurgeryReport);

// 导出PostgreSQL结构化数据（管理员、专家）
router.get('/export/postgresql', auth, checkPermission('surgery:export'), surgeryStatisticsController.exportPostgreSQLData);
router.get('/postgresql', auth, checkPermission('surgery:read'), surgeryStatisticsController.getPostgreSQLSurgeries);
router.post('/export-single', auth, checkPermission('surgery:export'), surgeryStatisticsController.exportSingleSurgeryData);

// 确认覆盖手术数据（管理员、专家）
router.post('/confirm-override', auth, checkPermission('surgery:export'), surgeryStatisticsController.confirmOverrideSurgeryData);

module.exports = router; 