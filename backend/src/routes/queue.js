/**
 * 队列管理路由
 */

const express = require('express');
const router = express.Router();
const queueController = require('../controllers/queueController');

// 获取所有队列状态
router.get('/status', queueController.getQueueStatus);

// 获取指定队列状态
router.get('/status/:queueName', queueController.getQueueStatusByName);

// 根据来源获取队列信息
router.get('/source/:source', queueController.getQueueBySource);

// 清理队列
router.post('/:queueName/clean', queueController.cleanQueue);

// 暂停队列
router.post('/:queueName/pause', queueController.pauseQueue);

// 恢复队列
router.post('/:queueName/resume', queueController.resumeQueue);

module.exports = router;