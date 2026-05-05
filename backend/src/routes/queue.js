/**
 * 队列管理路由
 */

const express = require('express');
const router = express.Router();
const queueController = require('../controllers/queueController');
const auth = require('../middlewares/auth');
const { checkPermission } = require('../middlewares/permission');

// 获取所有队列状态
router.get('/status', auth, checkPermission('queue:read'), queueController.getQueueStatus);

// 获取指定队列状态
router.get('/status/:queueName', auth, checkPermission('queue:read'), queueController.getQueueStatusByName);

// 根据来源获取队列信息
router.get('/source/:source', auth, checkPermission('queue:read'), queueController.getQueueBySource);

// 清理队列
router.post('/:queueName/clean', auth, checkPermission('queue:manage'), queueController.cleanQueue);

// 暂停队列
router.post('/:queueName/pause', auth, checkPermission('queue:manage'), queueController.pauseQueue);

// 恢复队列
router.post('/:queueName/resume', auth, checkPermission('queue:manage'), queueController.resumeQueue);

module.exports = router;
