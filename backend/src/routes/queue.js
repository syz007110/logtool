const express = require('express');
const router = express.Router();
const queueController = require('../controllers/queueController');
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');

// 队列状态查询路由
router.get('/status', auth, checkPermission('read_all'), queueController.getQueueStatus);
router.get('/health', queueController.healthCheck);
router.get('/metrics', auth, checkPermission('read_all'), queueController.getQueueMetrics);

// 用户队列管理路由
router.get('/user/:userId/status', auth, checkPermission('read_all'), queueController.getUserQueueStatus);
router.get('/user/:userId/jobs', auth, checkPermission('read_all'), queueController.getUserQueueJobs);
router.delete('/user/:userId', auth, checkPermission('admin'), queueController.cleanupUserQueue);
router.post('/user/:userId/pause', auth, checkPermission('admin'), queueController.pauseUserQueue);
router.post('/user/:userId/resume', auth, checkPermission('admin'), queueController.resumeUserQueue);

// 调度器管理路由
router.get('/scheduler/status', auth, checkPermission('read_all'), queueController.getSchedulerStatus);
router.post('/scheduler/reset-stats', auth, checkPermission('admin'), queueController.resetSchedulerStats);

// 集群管理路由
router.post('/cluster/adjust-workers', auth, checkPermission('admin'), queueController.adjustWorkerCount);

module.exports = router;
