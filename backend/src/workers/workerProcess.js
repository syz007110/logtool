const UserQueueManager = require('./userQueueManager');
const FairScheduler = require('./fairScheduler');

class WorkerProcess {
  constructor(workerId) {
    this.workerId = workerId;
    this.userQueueManager = new UserQueueManager();
    this.scheduler = null;
    this.isReady = false;
    this.heartbeatInterval = null;
    this.statsInterval = null;
    this.startTime = Date.now();
    this.jobsProcessed = 0;
    this.jobsFailed = 0;
    this.lastJobTime = null;
  }

  // 启动工作进程
  async start() {
    try {
      console.log(`[工作进程 ${this.workerId}] 启动，PID: ${process.pid}`);

      // 初始化用户队列管理器
      this.userQueueManager = new UserQueueManager();

      // 创建公平调度器（每个工作进程1个并发）
      this.scheduler = new FairScheduler(this.userQueueManager, 1);

      // 设置调度器事件监听
      this.setupSchedulerEvents();

      // 启动调度器
      this.scheduler.start();

      // 启动心跳
      this.startHeartbeat();

      // 启动统计信息收集
      this.startStatsCollection();

      // 标记为就绪
      this.isReady = true;

      // 通知主进程
      this.sendMessage({
        type: 'worker_ready',
        workerId: this.workerId,
        pid: process.pid
      });

      console.log(`[工作进程 ${this.workerId}] 启动完成`);

    } catch (error) {
      console.error(`[工作进程 ${this.workerId}] 启动失败:`, error);
      process.exit(1);
    }
  }

  // 设置调度器事件监听
  setupSchedulerEvents() {
    if (!this.scheduler) return;

    this.scheduler.on('jobCompleted', (data) => {
      this.jobsProcessed++;
      this.lastJobTime = Date.now();
      
      this.sendMessage({
        type: 'job_completed',
        workerId: this.workerId,
        jobId: data.jobId,
        userId: data.userId,
        result: data.result
      });
    });

    this.scheduler.on('jobFailed', (data) => {
      this.jobsFailed++;
      this.lastJobTime = Date.now();
      
      this.sendMessage({
        type: 'job_failed',
        workerId: this.workerId,
        jobId: data.jobId,
        userId: data.userId,
        error: data.error
      });
    });

    this.scheduler.on('workerIdle', (workerIndex) => {
      console.log(`[工作进程 ${this.workerId}] 工作进程 ${workerIndex} 空闲`);
    });

    this.scheduler.on('noJobsAvailable', () => {
      // 没有任务可处理，可以进入节能模式
      console.log(`[工作进程 ${this.workerId}] 当前没有任务可处理`);
    });

    this.scheduler.on('schedulerError', (error) => {
      console.error(`[工作进程 ${this.workerId}] 调度器错误:`, error);
    });
  }

  // 启动心跳
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.isReady) {
        this.sendMessage({
          type: 'worker_heartbeat',
          workerId: this.workerId,
          timestamp: Date.now()
        });
      }
    }, 10000); // 每10秒发送一次心跳
  }

  // 启动统计信息收集
  startStatsCollection() {
    this.statsInterval = setInterval(() => {
      if (this.isReady) {
        this.sendMessage({
          type: 'worker_stats',
          workerId: this.workerId,
          stats: this.getStats()
        });
      }
    }, 30000); // 每30秒发送一次统计信息
  }

  // 获取工作进程统计信息
  getStats() {
    const uptime = Date.now() - this.startTime;
    const schedulerStatus = this.scheduler ? this.scheduler.getStatus() : null;
    
    return {
      uptime,
      jobsProcessed: this.jobsProcessed,
      jobsFailed: this.jobsFailed,
      lastJobTime: this.lastJobTime,
      scheduler: schedulerStatus,
      memory: this.getMemoryUsage(),
      cpu: this.getCpuUsage()
    };
  }

  // 获取内存使用情况
  getMemoryUsage() {
    try {
      const memUsage = process.memoryUsage();
      return {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024)
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  // 获取CPU使用情况
  getCpuUsage() {
    try {
      const cpuUsage = process.cpuUsage();
      return {
        user: Math.round(cpuUsage.user / 1000),
        system: Math.round(cpuUsage.system / 1000)
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  // 发送消息给主进程
  sendMessage(message) {
    if (process.send) {
      try {
        process.send(message);
      } catch (error) {
        console.error(`[工作进程 ${this.workerId}] 发送消息失败:`, error);
      }
    }
  }

  // 停止工作进程
  async stop() {
    try {
      console.log(`[工作进程 ${this.workerId}] 停止中`);

      // 停止心跳
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }

      // 停止统计收集
      if (this.statsInterval) {
        clearInterval(this.statsInterval);
        this.statsInterval = null;
      }

      // 停止调度器
      if (this.scheduler) {
        this.scheduler.stop();
      }

      // 清理用户队列
      for (const [userId] of this.userQueueManager.userQueues) {
        await this.userQueueManager.cleanupUserQueue(userId);
      }

      this.isReady = false;
      console.log(`[工作进程 ${this.workerId}] 已停止`);

    } catch (error) {
      console.error(`[工作进程 ${this.workerId}] 停止失败:`, error);
    }
  }

  // 获取工作进程状态
  getStatus() {
    return {
      workerId: this.workerId,
      pid: process.pid,
      isReady: this.isReady,
      startTime: this.startTime,
      uptime: Date.now() - this.startTime,
      jobsProcessed: this.jobsProcessed,
      jobsFailed: this.jobsFailed,
      lastJobTime: this.lastJobTime,
      scheduler: this.scheduler ? this.scheduler.getStatus() : null,
      memory: this.getMemoryUsage(),
      cpu: this.getCpuUsage()
    };
  }

  // 处理信号
  setupSignalHandlers() {
    // 优雅关闭
    process.on('SIGTERM', async () => {
      console.log(`[工作进程 ${this.workerId}] 收到SIGTERM信号`);
      await this.stop();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log(`[工作进程 ${this.workerId}] 收到SIGINT信号`);
      await this.stop();
      process.exit(0);
    });

    // 未捕获的异常
    process.on('uncaughtException', async (error) => {
      console.error(`[工作进程 ${this.workerId}] 未捕获的异常:`, error);
      
      // 发送错误消息给主进程
      this.sendMessage({
        type: 'worker_error',
        workerId: this.workerId,
        error: error.message,
        stack: error.stack
      });

      // 尝试优雅关闭
      await this.stop();
      process.exit(1);
    });

    // 未处理的Promise拒绝
    process.on('unhandledRejection', (reason, promise) => {
      console.error(`[工作进程 ${this.workerId}] 未处理的Promise拒绝:`, reason);
      
      // 发送错误消息给主进程
      this.sendMessage({
        type: 'worker_promise_rejection',
        workerId: this.workerId,
        reason: reason instanceof Error ? reason.message : String(reason)
      });
    });
  }

  // 健康检查
  async healthCheck() {
    try {
      const status = this.getStatus();
      const isHealthy = this.isReady && 
                       status.memory.heapUsed < 1000 && // 内存使用小于1GB
                       status.uptime > 0;

      if (!isHealthy) {
        console.warn(`[工作进程 ${this.workerId}] 健康检查失败:`, status);
      }

      return {
        isHealthy,
        status,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error(`[工作进程 ${this.workerId}] 健康检查失败:`, error);
      return {
        isHealthy: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }
}

module.exports = WorkerProcess;
