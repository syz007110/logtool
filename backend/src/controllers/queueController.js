const UserQueueManager = require('../workers/userQueueManager');

class QueueController {
  constructor() {
    this.userQueueManager = new UserQueueManager();
  }

  // 获取队列状态概览
  async getQueueStatus(req, res) {
    try {
      const queueStats = await this.userQueueManager.getQueueStats();
      const clusterStatus = global.clusterManager ? global.clusterManager.getClusterStatus() : null;
      
      res.json({
        success: true,
        data: {
          queueStats,
          cluster: clusterStatus,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('[队列控制器] 获取队列状态失败:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }

  // 获取用户队列状态
  async getUserQueueStatus(req, res) {
    try {
      const { userId } = req.params;
      const userStatus = await this.userQueueManager.getUserQueueStatus(userId);
      
      res.json({
        success: true,
        data: userStatus
      });
    } catch (error) {
      console.error(`[队列控制器] 获取用户 ${req.params.userId} 队列状态失败:`, error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }

  // 获取用户队列中的任务
  async getUserQueueJobs(req, res) {
    try {
      const { userId } = req.params;
      const { status = 'waiting', start = 0, end = 50 } = req.query;
      
      const jobs = await this.userQueueManager.getUserQueueJobs(
        userId, 
        status, 
        parseInt(start), 
        parseInt(end)
      );
      
      res.json({
        success: true,
        data: {
          userId,
          status,
          start: parseInt(start),
          end: parseInt(end),
          jobs,
          count: jobs.length
        }
      });
    } catch (error) {
      console.error(`[队列控制器] 获取用户 ${req.params.userId} 队列任务失败:`, error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }

  // 清理用户队列
  async cleanupUserQueue(req, res) {
    try {
      const { userId } = req.params;
      await this.userQueueManager.cleanupUserQueue(userId);
      
      res.json({
        success: true,
        message: `用户 ${userId} 的队列已清理`,
        data: { userId }
      });
    } catch (error) {
      console.error(`[队列控制器] 清理用户 ${req.params.userId} 队列失败:`, error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }

  // 暂停用户队列
  async pauseUserQueue(req, res) {
    try {
      const { userId } = req.params;
      await this.userQueueManager.pauseUserQueue(userId);
      
      res.json({
        success: true,
        message: `用户 ${userId} 的队列已暂停`,
        data: { userId, status: 'paused' }
      });
    } catch (error) {
      console.error(`[队列控制器] 暂停用户 ${req.params.userId} 队列失败:`, error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }

  // 恢复用户队列
  async resumeUserQueue(req, res) {
    try {
      const { userId } = req.params;
      await this.userQueueManager.resumeUserQueue(userId);
      
      res.json({
        success: true,
        message: `用户 ${userId} 的队列已恢复`,
        data: { userId, status: 'active' }
      });
    } catch (error) {
      console.error(`[队列控制器] 恢复用户 ${req.params.userId} 队列失败:`, error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }

  // 获取调度器状态
  async getSchedulerStatus(req, res) {
    try {
      if (!global.clusterManager || !global.clusterManager.scheduler) {
        return res.status(503).json({
          success: false,
          error: '调度器未启动'
        });
      }

      const schedulerStatus = global.clusterManager.scheduler.getStatus();
      const fairnessStats = global.clusterManager.scheduler.getUserFairnessStats();
      
      res.json({
        success: true,
        data: {
          scheduler: schedulerStatus,
          fairness: fairnessStats,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('[队列控制器] 获取调度器状态失败:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }

  // 重置调度器统计信息
  async resetSchedulerStats(req, res) {
    try {
      if (!global.clusterManager || !global.clusterManager.scheduler) {
        return res.status(503).json({
          success: false,
          error: '调度器未启动'
        });
      }

      global.clusterManager.scheduler.resetStats();
      
      res.json({
        success: true,
        message: '调度器统计信息已重置',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[队列控制器] 重置调度器统计失败:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }

  // 调整工作进程数
  async adjustWorkerCount(req, res) {
    try {
      const { count } = req.body;
      
      if (!count || !Number.isInteger(count) || count < 1) {
        return res.status(400).json({
          success: false,
          error: '请提供有效的工作进程数量'
        });
      }

      if (!global.clusterManager) {
        return res.status(503).json({
          success: false,
          error: '集群管理器未启动'
        });
      }

      await global.clusterManager.adjustWorkerCount(count);
      
      res.json({
        success: true,
        message: `工作进程数已调整为 ${count}`,
        data: { 
          newCount: count,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('[队列控制器] 调整工作进程数失败:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }

  // 获取队列性能指标
  async getQueueMetrics(req, res) {
    try {
      const queueStats = await this.userQueueManager.getQueueStats();
      const schedulerStatus = global.clusterManager?.scheduler?.getStatus();
      const fairnessStats = global.clusterManager?.scheduler?.getUserFairnessStats();
      
      // 计算性能指标
      const metrics = {
        throughput: {
          totalJobs: queueStats.totalJobs,
          completedJobs: queueStats.totalCompleted,
          failedJobs: queueStats.totalFailed,
          successRate: queueStats.totalJobs > 0 ? 
            ((queueStats.totalCompleted / queueStats.totalJobs) * 100).toFixed(2) : 0
        },
        fairness: fairnessStats || { fairness: 'N/A' },
        workers: {
          total: schedulerStatus?.maxWorkers || 0,
          active: schedulerStatus?.activeWorkers || 0,
          idle: schedulerStatus?.idleWorkers || 0,
          utilization: schedulerStatus?.maxWorkers > 0 ? 
            ((schedulerStatus.activeWorkers / schedulerStatus.maxWorkers) * 100).toFixed(2) : 0
        },
        users: {
          total: queueStats.totalUsers,
          withJobs: Object.values(queueStats.userQueues).filter(q => q.total > 0).length
        },
        timestamp: new Date().toISOString()
      };
      
      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      console.error('[队列控制器] 获取队列性能指标失败:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }

  // 健康检查
  async healthCheck(req, res) {
    try {
      const queueStats = await this.userQueueManager.getQueueStats();
      const clusterStatus = global.clusterManager?.getClusterStatus();
      const schedulerStatus = global.clusterManager?.scheduler?.getStatus();
      
      const isHealthy = clusterStatus && 
                       clusterStatus.activeWorkers > 0 && 
                       queueStats.totalFailed < queueStats.totalCompleted * 0.1; // 失败率小于10%
      
      const health = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        details: {
          cluster: clusterStatus,
          queue: queueStats,
          scheduler: schedulerStatus
        }
      };
      
      const statusCode = isHealthy ? 200 : 503;
      res.status(statusCode).json({
        success: isHealthy,
        data: health
      });
    } catch (error) {
      console.error('[队列控制器] 健康检查失败:', error);
      res.status(503).json({
        success: false,
        error: error.message,
        status: 'unhealthy'
      });
    }
  }
}

module.exports = new QueueController();
