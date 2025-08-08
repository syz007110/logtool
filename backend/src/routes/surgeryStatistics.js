const express = require('express');
const router = express.Router();
const surgeryStatisticsController = require('../controllers/surgeryStatisticsController');
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');

// 获取手术统计列表（实时分析）
router.get('/', auth, checkPermission('surgery:read'), surgeryStatisticsController.getAllSurgeryStatistics);

// 新增：使用已排序日志条目进行分析
router.post('/analyze-sorted-entries', auth, checkPermission('surgery:analyze'), surgeryStatisticsController.analyzeSortedLogEntries);

// 新增：通过日志ID列表直接分析手术数据
router.post('/analyze-by-log-ids', auth, checkPermission('surgery:analyze'), surgeryStatisticsController.analyzeByLogIds);

// 导出手术报告PDF
router.get('/:id/export', auth, checkPermission('surgery:export'), surgeryStatisticsController.exportSurgeryReport);

module.exports = router; 