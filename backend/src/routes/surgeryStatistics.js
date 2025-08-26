const express = require('express');
const router = express.Router();
const surgeryStatisticsController = require('../controllers/surgeryStatisticsController');
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');

// 获取手术统计数据
router.get('/', auth, checkPermission('surgery:read'), surgeryStatisticsController.getAllSurgeryStatistics);

// 分析已排序的日志条目
router.post('/analyze-sorted-entries', auth, checkPermission('surgery:analyze'), surgeryStatisticsController.analyzeSortedLogEntries);

// 通过日志ID列表分析手术数据
router.post('/analyze-by-log-ids', auth, checkPermission('surgery:analyze'), surgeryStatisticsController.analyzeByLogIds);

// 查询分析任务状态
router.get('/task/:taskId', auth, checkPermission('surgery:read'), surgeryStatisticsController.getAnalysisTaskStatus);

// 获取用户的分析任务列表
router.get('/tasks', auth, checkPermission('surgery:read'), surgeryStatisticsController.getUserAnalysisTasks);

// 导出手术报告
router.get('/:id/export', auth, checkPermission('surgery:export'), surgeryStatisticsController.exportSurgeryReport);

// 导出PostgreSQL结构化数据
router.get('/export/postgresql', auth, checkPermission('surgery:export'), surgeryStatisticsController.exportPostgreSQLData);
router.get('/postgresql', auth, checkPermission('surgery:read'), surgeryStatisticsController.getPostgreSQLSurgeries);
router.get('/:id/export-data', auth, checkPermission('surgery:export'), surgeryStatisticsController.exportSingleSurgeryData);

module.exports = router; 