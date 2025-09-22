/**
 * 队列管理控制器
 * 提供队列状态监控和管理接口
 */

const queueManager = require('../services/queueManager');

/**
 * 获取所有队列状态
 */
const getQueueStatus = async (req, res) => {
  try {
    const status = await queueManager.getQueueStatus();
    
    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[队列控制器] 获取队列状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取队列状态失败',
      error: error.message
    });
  }
};

/**
 * 获取指定队列状态
 */
const getQueueStatusByName = async (req, res) => {
  try {
    const { queueName } = req.params;
    const queue = queueManager.getQueue(queueName);
    
    if (!queue) {
      return res.status(404).json({
        success: false,
        message: `队列 ${queueName} 不存在`
      });
    }

    const waiting = await queue.getWaiting();
    const active = await queue.getActive();
    const completed = await queue.getCompleted();
    const failed = await queue.getFailed();
    
    const status = {
      name: queueName,
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      total: waiting.length + active.length + completed.length + failed.length,
      details: {
        waiting: waiting.map(job => ({
          id: job.id,
          data: job.data,
          createdAt: job.timestamp
        })),
        active: active.map(job => ({
          id: job.id,
          data: job.data,
          startedAt: job.processedOn
        })),
        failed: failed.map(job => ({
          id: job.id,
          data: job.data,
          failedAt: job.failedOn,
          error: job.failedReason
        }))
      }
    };
    
    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[队列控制器] 获取队列状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取队列状态失败',
      error: error.message
    });
  }
};

/**
 * 清理队列
 */
const cleanQueue = async (req, res) => {
  try {
    const { queueName } = req.params;
    const { grace = 0, type = 'completed' } = req.body;
    
    await queueManager.cleanQueue(queueName, { grace, type });
    
    res.json({
      success: true,
      message: `队列 ${queueName} 清理完成`,
      data: { queueName, grace, type }
    });
  } catch (error) {
    console.error('[队列控制器] 清理队列失败:', error);
    res.status(500).json({
      success: false,
      message: '清理队列失败',
      error: error.message
    });
  }
};

/**
 * 暂停队列
 */
const pauseQueue = async (req, res) => {
  try {
    const { queueName } = req.params;
    
    await queueManager.pauseQueue(queueName);
    
    res.json({
      success: true,
      message: `队列 ${queueName} 已暂停`
    });
  } catch (error) {
    console.error('[队列控制器] 暂停队列失败:', error);
    res.status(500).json({
      success: false,
      message: '暂停队列失败',
      error: error.message
    });
  }
};

/**
 * 恢复队列
 */
const resumeQueue = async (req, res) => {
  try {
    const { queueName } = req.params;
    
    await queueManager.resumeQueue(queueName);
    
    res.json({
      success: true,
      message: `队列 ${queueName} 已恢复`
    });
  } catch (error) {
    console.error('[队列控制器] 恢复队列失败:', error);
    res.status(500).json({
      success: false,
      message: '恢复队列失败',
      error: error.message
    });
  }
};

/**
 * 根据来源获取队列信息
 */
const getQueueBySource = async (req, res) => {
  try {
    const { source } = req.params;
    const queue = queueManager.getQueueBySource(source);
    
    if (!queue) {
      return res.status(404).json({
        success: false,
        message: `未找到来源 ${source} 对应的队列`
      });
    }

    const waiting = await queue.getWaiting();
    const active = await queue.getActive();
    const completed = await queue.getCompleted();
    const failed = await queue.getFailed();
    
    res.json({
      success: true,
      data: {
        source,
        queueName: queue.name,
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        total: waiting.length + active.length + completed.length + failed.length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[队列控制器] 获取来源队列信息失败:', error);
    res.status(500).json({
      success: false,
      message: '获取来源队列信息失败',
      error: error.message
    });
  }
};

module.exports = {
  getQueueStatus,
  getQueueStatusByName,
  cleanQueue,
  pauseQueue,
  resumeQueue,
  getQueueBySource
};