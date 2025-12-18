const EventEmitter = require('events');

class FairScheduler extends EventEmitter {
  constructor(userQueueManager, maxWorkers = 4) {
    super();
    this.userQueueManager = userQueueManager;
    this.maxWorkers = maxWorkers;
    this.workers = new Array(maxWorkers).fill(null);
    this.userRoundRobin = new Map(); // 用户轮询状态
    this.isRunning = false;
    this.schedulerInterval = null;
    this.schedulerIntervalMs = parseInt(process.env.QUEUE_SCHEDULER_INTERVAL) || 100;
    this.stats = {
      totalScheduled: 0,
      totalProcessed: 0,
      totalFailed: 0,
      userStats: new Map()
    };
  }

  // 启动调度器
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.schedulerInterval = setInterval(() => {
      this.scheduleNext();
    }, this.schedulerIntervalMs);
    
    console.log(`[公平调度器] 启动，工作进程数: ${this.maxWorkers}, 调度间隔: ${this.schedulerIntervalMs}ms`);
  }

  // 停止调度器
  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
    
    console.log('[公平调度器] 已停止');
  }

  // 调度下一个任务
  async scheduleNext() {
    try {
      // 查找空闲的工作进程
      const availableWorkerIndex = this.workers.findIndex(worker => worker === null);
      if (availableWorkerIndex === -1) {
        return; // 没有空闲工作进程
      }

      // 获取所有用户队列
      const userQueues = Array.from(this.userQueueManager.userQueues.entries());
      if (userQueues.length === 0) {
        return; // 没有用户队列
      }

      // 轮询调度：确保每个用户都有机会
      let jobFound = false;
      let attempts = 0;
      const maxAttempts = userQueues.length;

      while (!jobFound && attempts < maxAttempts) {
        // 获取下一个用户（轮询）
        const nextUser = this.getNextUser(userQueues);
        const [userId, queue] = nextUser;
        
        // 尝试从该用户队列获取任务
        const job = await queue.getNextJob();
        if (job) {
          // 分配任务给工作进程
          this.assignJobToWorker(availableWorkerIndex, job, userId);
          jobFound = true;
          
          // 更新统计信息
          this.updateStats(userId, 'scheduled');
          
          console.log(`[公平调度器] 用户 ${userId} 的任务 ${job.id} 分配给工作进程 ${availableWorkerIndex}`);
        }
        
        attempts++;
      }

      if (!jobFound) {
        // 所有用户队列都没有任务
        this.emit('noJobsAvailable');
      }

    } catch (error) {
      console.error('[公平调度器] 调度错误:', error);
      this.emit('schedulerError', error);
    }
  }

  // 获取下一个用户（轮询算法）
  getNextUser(userQueues) {
    // 获取当前轮询位置
    const currentIndex = this.userRoundRobin.get('current') || 0;
    const nextIndex = (currentIndex + 1) % userQueues.length;
    
    // 更新轮询位置
    this.userRoundRobin.set('current', nextIndex);
    
    // 记录轮询历史
    const history = this.userRoundRobin.get('history') || [];
    history.push({
      timestamp: Date.now(),
      userId: userQueues[nextIndex][0],
      index: nextIndex
    });
    
    // 保持历史记录在合理范围内
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
    
    this.userRoundRobin.set('history', history);
    
    return userQueues[nextIndex];
  }

  // 分配任务给工作进程
  assignJobToWorker(workerIndex, job, userId) {
    // 标记工作进程为忙碌状态
    this.workers[workerIndex] = {
      jobId: job.id,
      userId: userId,
      startTime: Date.now(),
      status: 'processing',
      jobType: job.data.jobType || 'unknown'
    };

    // 处理任务
    this.processJob(job, userId, workerIndex);
  }

  // 处理任务
  async processJob(job, userId, workerIndex) {
    try {
      console.log(`[工作进程 ${workerIndex}] 开始处理用户 ${userId} 的任务 ${job.id}`);
      
      // 根据任务类型调用相应的处理器
      const result = await this.processJobByType(job);
      
      // 标记任务完成
      await job.moveToCompleted(result);
      
      // 更新统计信息
      this.updateStats(userId, 'completed');
      
      console.log(`[工作进程 ${workerIndex}] 完成任务 ${job.id}`);
      
      // 发送完成事件
      this.emit('jobCompleted', {
        workerIndex,
        jobId: job.id,
        userId,
        result
      });
      
    } catch (error) {
      console.error(`[工作进程 ${workerIndex}] 处理任务 ${job.id} 失败:`, error);
      
      // 标记任务失败
      await job.moveToFailed(error);
      
      // 更新统计信息
      this.updateStats(userId, 'failed');
      
      // 发送失败事件
      this.emit('jobFailed', {
        workerIndex,
        jobId: job.id,
        userId,
        error: error.message
      });
      
    } finally {
      // 释放工作进程
      this.workers[workerIndex] = null;
      
      // 发送工作进程空闲事件
      this.emit('workerIdle', workerIndex);
    }
  }

  // 根据任务类型处理
  async processJobByType(job) {
    const { jobType, data } = job.data;
    
    // 导入任务处理器
    const { processLogFile, processSingleDelete, batchDeleteLogs, batchReparseLogs } = require('./batchProcessor');
    
    switch (jobType) {
      case 'process-log':
        return await processLogFile(job);
      case 'delete-single':
        return await processSingleDelete(job);
      case 'batch-delete':
        return await batchDeleteLogs(job);
      case 'batch-reparse':
        return await batchReparseLogs(job);
      default:
        throw new Error(`未知的任务类型: ${jobType}`);
    }
  }

  // 更新统计信息
  updateStats(userId, action) {
    if (!this.stats.userStats.has(userId)) {
      this.stats.userStats.set(userId, {
        scheduled: 0,
        completed: 0,
        failed: 0,
        total: 0
      });
    }

    const userStat = this.stats.userStats.get(userId);
    userStat[action]++;
    userStat.total++;
    
    this.stats[`total${action.charAt(0).toUpperCase() + action.slice(1)}`]++;
  }

  // 获取调度器状态
  getStatus() {
    const activeWorkers = this.workers.filter(w => w !== null);
    const idleWorkers = this.workers.filter(w => w === null);
    
    return {
      isRunning: this.isRunning,
      maxWorkers: this.maxWorkers,
      activeWorkers: activeWorkers.length,
      idleWorkers: idleWorkers.length,
      workers: this.workers.map((worker, index) => ({
        index,
        status: worker ? 'busy' : 'idle',
        jobId: worker?.jobId,
        userId: worker?.userId,
        startTime: worker?.startTime,
        jobType: worker?.jobType
      })),
      stats: {
        totalScheduled: this.stats.totalScheduled,
        totalCompleted: this.stats.totalCompleted,
        totalFailed: this.stats.totalFailed,
        userStats: Object.fromEntries(this.stats.userStats)
      },
      roundRobin: {
        current: this.userRoundRobin.get('current') || 0,
        history: this.userRoundRobin.get('history') || []
      }
    };
  }

  // 获取用户公平性统计
  getUserFairnessStats() {
    const userStats = Array.from(this.stats.userStats.entries());
    const totalJobs = userStats.reduce((sum, [_, stats]) => sum + stats.total, 0);
    
    if (totalJobs === 0) {
      return { fairness: 100, distribution: {} };
    }

    // 计算公平性指标
    const expectedJobsPerUser = totalJobs / userStats.length;
    let totalDeviation = 0;
    const distribution = {};

    userStats.forEach(([userId, stats]) => {
      const deviation = Math.abs(stats.total - expectedJobsPerUser);
      totalDeviation += deviation;
      
      distribution[userId] = {
        total: stats.total,
        percentage: (stats.total / totalJobs * 100).toFixed(2),
        deviation: deviation.toFixed(2),
        fairness: Math.max(0, 100 - (deviation / expectedJobsPerUser * 100)).toFixed(2)
      };
    });

    const averageDeviation = totalDeviation / userStats.length;
    const fairness = Math.max(0, 100 - (averageDeviation / expectedJobsPerUser * 100));

    return {
      fairness: fairness.toFixed(2),
      totalUsers: userStats.length,
      totalJobs,
      expectedJobsPerUser: expectedJobsPerUser.toFixed(2),
      averageDeviation: averageDeviation.toFixed(2),
      distribution
    };
  }

  // 重置统计信息
  resetStats() {
    this.stats = {
      totalScheduled: 0,
      totalProcessed: 0,
      totalFailed: 0,
      userStats: new Map()
    };
    console.log('[公平调度器] 统计信息已重置');
  }

  // 设置工作进程数
  setMaxWorkers(maxWorkers) {
    const oldMaxWorkers = this.maxWorkers;
    this.maxWorkers = maxWorkers;
    
    // 调整工作进程数组
    if (maxWorkers > oldMaxWorkers) {
      // 增加工作进程
      for (let i = oldMaxWorkers; i < maxWorkers; i++) {
        this.workers[i] = null;
      }
    } else if (maxWorkers < oldMaxWorkers) {
      // 减少工作进程（需要等待当前任务完成）
      this.workers = this.workers.slice(0, maxWorkers);
    }
    
    console.log(`[公平调度器] 工作进程数从 ${oldMaxWorkers} 调整为 ${maxWorkers}`);
  }
}

module.exports = FairScheduler;
