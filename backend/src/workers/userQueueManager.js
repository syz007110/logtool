const Bull = require('bull');
const Redis = require('ioredis');

class UserQueueManager {
  constructor() {
    this.userQueues = new Map(); // 用户ID -> 队列实例
    this.redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || '',
      db: process.env.REDIS_DB || 0
    };
    this.maxConcurrency = parseInt(process.env.QUEUE_MAX_CONCURRENCY) || 5;
    this.maxAttempts = parseInt(process.env.QUEUE_MAX_ATTEMPTS) || 3;
    this.backoffDelay = parseInt(process.env.QUEUE_BACKOFF_DELAY) || 2000;
  }

  // 获取或创建用户队列
  getUserQueue(userId) {
    if (!this.userQueues.has(userId)) {
      const queueName = `user_queue_${userId}`;
      const queue = new Bull(queueName, {
        redis: this.redisConfig,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: this.maxAttempts,
          backoff: {
            type: 'exponential',
            delay: this.backoffDelay
          }
        }
      });
      
      // 设置队列事件监听
      this.setupQueueEvents(queue, userId);
      
      this.userQueues.set(userId, queue);
      console.log(`[队列管理器] 创建用户队列: ${queueName}`);
    }
    
    return this.userQueues.get(userId);
  }

  // 设置队列事件监听
  setupQueueEvents(queue, userId) {
    queue.on('waiting', (jobId) => {
      console.log(`[用户队列 ${userId}] 任务 ${jobId} 等待中`);
    });

    queue.on('active', (job) => {
      console.log(`[用户队列 ${userId}] 任务 ${job.id} 开始处理`);
    });

    queue.on('completed', (job, result) => {
      console.log(`[用户队列 ${userId}] 任务 ${job.id} 完成`);
    });

    queue.on('failed', (job, err) => {
      console.error(`[用户队列 ${userId}] 任务 ${job.id} 失败:`, err.message);
    });

    queue.on('stalled', (jobId) => {
      console.warn(`[用户队列 ${userId}] 任务 ${jobId} 停滞`);
    });

    queue.on('error', (error) => {
      console.error(`[用户队列 ${userId}] 队列错误:`, error);
    });
  }

  // 添加任务到用户队列
  async addJob(userId, jobType, jobData, options = {}) {
    const userQueue = this.getUserQueue(userId);
    
    const job = await userQueue.add(jobType, jobData, {
      priority: options.priority || 2,
      delay: options.delay || 0,
      attempts: options.attempts || this.maxAttempts,
      ...options
    });

    console.log(`[队列管理器] 用户 ${userId} 添加任务: ${jobType}, 任务ID: ${job.id}`);
    return job;
  }

  // 获取用户队列状态
  async getUserQueueStatus(userId) {
    if (!this.userQueues.has(userId)) {
      return {
        userId,
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        total: 0,
        exists: false
      };
    }

    const queue = this.userQueues.get(userId);
    const waiting = await queue.getWaiting();
    const active = await queue.getActive();
    const completed = await queue.getCompleted();
    const failed = await queue.getFailed();
    
    return {
      userId,
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      total: waiting.length + active.length + completed.length + failed.length,
      exists: true
    };
  }

  // 获取所有用户队列状态
  async getAllQueueStatus() {
    const status = {};
    
    for (const [userId, queue] of this.userQueues) {
      status[userId] = await this.getUserQueueStatus(userId);
    }
    
    return status;
  }

  // 获取队列统计信息
  async getQueueStats() {
    const allStatus = await this.getAllQueueStatus();
    const totalWaiting = Object.values(allStatus).reduce((sum, status) => sum + status.waiting, 0);
    const totalActive = Object.values(allStatus).reduce((sum, status) => sum + status.active, 0);
    const totalCompleted = Object.values(allStatus).reduce((sum, status) => sum + status.completed, 0);
    const totalFailed = Object.values(allStatus).reduce((sum, status) => sum + status.failed, 0);
    
    return {
      totalUsers: Object.keys(allStatus).length,
      totalWaiting,
      totalActive,
      totalCompleted,
      totalFailed,
      totalJobs: totalWaiting + totalActive + totalCompleted + totalFailed,
      userQueues: allStatus
    };
  }

  // 清理用户队列
  async cleanupUserQueue(userId) {
    if (this.userQueues.has(userId)) {
      const queue = this.userQueues.get(userId);
      await queue.close();
      this.userQueues.delete(userId);
      console.log(`[队列管理器] 清理用户队列: user_queue_${userId}`);
    }
  }

  // 清理所有队列
  async cleanupAllQueues() {
    const userIds = Array.from(this.userQueues.keys());
    
    for (const userId of userIds) {
      await this.cleanupUserQueue(userId);
    }
    
    console.log(`[队列管理器] 清理所有用户队列，共 ${userIds.length} 个`);
  }

  // 暂停用户队列
  async pauseUserQueue(userId) {
    if (this.userQueues.has(userId)) {
      const queue = this.userQueues.get(userId);
      await queue.pause();
      console.log(`[队列管理器] 暂停用户队列: user_queue_${userId}`);
    }
  }

  // 恢复用户队列
  async resumeUserQueue(userId) {
    if (this.userQueues.has(userId)) {
      const queue = this.userQueues.get(userId);
      await queue.resume();
      console.log(`[队列管理器] 恢复用户队列: user_queue_${userId}`);
    }
  }

  // 获取用户队列中的任务
  async getUserQueueJobs(userId, status = 'waiting', start = 0, end = 50) {
    if (!this.userQueues.has(userId)) {
      return [];
    }

    const queue = this.userQueues.get(userId);
    let jobs = [];

    switch (status) {
      case 'waiting':
        jobs = await queue.getWaiting(start, end);
        break;
      case 'active':
        jobs = await queue.getActive(start, end);
        break;
      case 'completed':
        jobs = await queue.getCompleted(start, end);
        break;
      case 'failed':
        jobs = await queue.getFailed(start, end);
        break;
      default:
        jobs = await queue.getJobs([status], start, end);
    }

    return jobs.map(job => ({
      id: job.id,
      data: job.data,
      progress: job.progress(),
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason
    }));
  }
}

module.exports = UserQueueManager;
