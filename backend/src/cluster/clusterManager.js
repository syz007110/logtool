const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
const path = require('path');
const dotenv = require('dotenv');

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const UserQueueManager = require('../workers/userQueueManager');
const FairScheduler = require('../workers/fairScheduler');
const IntelligentScheduler = require('./intelligentScheduler');
const SmartWorker = require('../workers/smartWorker');

class ClusterManager {
  constructor() {
    this.numWorkers = parseInt(process.env.WORKER_PROCESSES) || numCPUs;
    this.userQueueManager = new UserQueueManager();
    this.scheduler = null;
    this.workers = new Map(); // workerId -> worker实例
    this.workerStats = new Map(); // workerId -> 统计信息
    this.healthCheckInterval = null;
    this.autoRestartEnabled = process.env.AUTO_RESTART_ENABLED !== 'false';
    this.maxRestartAttempts = parseInt(process.env.MAX_RESTART_ATTEMPTS) || 5;
    this.restartDelay = parseInt(process.env.RESTART_DELAY) || 1000;
    
    // 检查是否启用智能调度
    this.intelligentSchedulerEnabled = process.env.INTELLIGENT_SCHEDULER_ENABLED === 'true';
    this.intelligentScheduler = null;
    
    // 进程分离配置
    this.processSeparationEnabled = process.env.PROCESS_SEPARATION_ENABLED === 'true';
    this.userRequestWorkers = parseInt(process.env.USER_REQUEST_WORKERS) || Math.ceil(numCPUs * 0.6);
    this.logProcessingWorkers = parseInt(process.env.LOG_PROCESSING_WORKERS) || Math.ceil(numCPUs * 0.4);
    
    console.log(`[集群管理器] 进程分离: ${this.processSeparationEnabled ? '启用' : '禁用'}`);
    if (this.processSeparationEnabled) {
      console.log(`[集群管理器] 用户请求进程数: ${this.userRequestWorkers}`);
      console.log(`[集群管理器] 日志处理进程数: ${this.logProcessingWorkers}`);
    }
  }

  // 启动主进程
  async startMaster() {
    try {
      console.log(`[集群管理器] 主进程 ${process.pid} 启动`);
      console.log(`[集群管理器] CPU核心数: ${numCPUs}`);
      console.log(`[集群管理器] 创建工作进程数: ${this.numWorkers}`);
      console.log(`[集群管理器] 智能调度: ${this.intelligentSchedulerEnabled ? '启用' : '禁用'}`);

      // 初始化用户队列管理器
      this.userQueueManager = new UserQueueManager();

      // 根据配置选择调度器
      if (this.intelligentSchedulerEnabled) {
        // 使用智能调度器
        this.intelligentScheduler = new IntelligentScheduler();
        this.scheduler = this.intelligentScheduler;
        console.log(`[集群管理器] 使用智能调度器`);
      } else {
        // 使用传统公平调度器
        this.scheduler = new FairScheduler(this.userQueueManager, this.numWorkers);
        console.log(`[集群管理器] 使用传统公平调度器`);
      }

      // 创建工作进程
      if (this.processSeparationEnabled) {
        // 创建分离的进程类型
        await this.createSeparatedWorkers();
      } else {
        // 创建混合进程
        for (let i = 0; i < this.numWorkers; i++) {
          await this.createWorker(i, 'mixed');
        }
      }

      // 启动调度器
      this.scheduler.start();

      // 如果是智能调度器，注册工作进程
      if (this.intelligentSchedulerEnabled && this.intelligentScheduler) {
        for (const [workerId, worker] of this.workers) {
          this.intelligentScheduler.registerWorker(workerId, worker);
        }
      }

      // 监控工作进程
      this.monitorWorkers();

      // 启动健康检查
      this.startHealthCheck();

      // 启动性能监控
      this.startPerformanceMonitoring();

      console.log(`[集群管理器] 主进程启动完成，工作进程数: ${this.numWorkers}`);

    } catch (error) {
      console.error('[集群管理器] 主进程启动失败:', error);
      process.exit(1);
    }
  }

  // 创建分离的工作进程
  async createSeparatedWorkers() {
    try {
      let workerId = 0;
      
      // 创建用户请求处理进程
      for (let i = 0; i < this.userRequestWorkers; i++) {
        await this.createWorker(workerId, 'user-requests');
        workerId++;
      }
      
      // 创建日志处理进程
      for (let i = 0; i < this.logProcessingWorkers; i++) {
        await this.createWorker(workerId, 'log-processing');
        workerId++;
      }
      
      console.log(`[集群管理器] 创建分离进程完成 - 用户请求: ${this.userRequestWorkers}个, 日志处理: ${this.logProcessingWorkers}个`);
      
    } catch (error) {
      console.error('[集群管理器] 创建分离工作进程失败:', error);
      throw error;
    }
  }

  // 创建工作进程
  async createWorker(workerId, processType = 'mixed') {
    try {
      const worker = cluster.fork({
        WORKER_ID: workerId,
        WORKER_TYPE: this.intelligentSchedulerEnabled ? 'smart' : 'queue_worker',
        PROCESS_TYPE: processType,
        NODE_ENV: process.env.NODE_ENV || 'development'
      });

      // 存储工作进程实例
      this.workers.set(workerId, worker);

      // 初始化统计信息
      this.workerStats.set(workerId, {
        pid: worker.process.pid,
        startTime: Date.now(),
        restartCount: 0,
        lastHeartbeat: Date.now(),
        status: 'starting'
      });

      console.log(`[集群管理器] 创建工作进程 ${workerId}: ${worker.process.pid}`);

      // 监听工作进程消息
      worker.on('message', (message) => {
        this.handleWorkerMessage(worker, message);
      });

      // 监听工作进程退出
      worker.on('exit', (code, signal) => {
        this.handleWorkerExit(worker, code, signal);
      });

      // 监听工作进程错误
      worker.on('error', (error) => {
        this.handleWorkerError(worker, error);
      });

      return worker;

    } catch (error) {
      console.error(`[集群管理器] 创建工作进程 ${workerId} 失败:`, error);
      throw error;
    }
  }

  // 监控工作进程
  monitorWorkers() {
    cluster.on('exit', (worker, code, signal) => {
      console.log(`[集群管理器] 工作进程 ${worker.process.pid} 退出，代码: ${code}, 信号: ${signal}`);
      
      // 查找对应的workerId
      let workerId = null;
      for (const [id, w] of this.workers.entries()) {
        if (w.process.pid === worker.process.pid) {
          workerId = id;
          break;
        }
      }

      if (workerId !== null) {
        // 更新统计信息
        const stats = this.workerStats.get(workerId);
        if (stats) {
          stats.status = 'exited';
          stats.exitCode = code;
          stats.exitSignal = signal;
          stats.exitTime = Date.now();
        }

        // 从workers Map中移除
        this.workers.delete(workerId);

        // 自动重启工作进程
        if (this.autoRestartEnabled) {
          this.restartWorker(workerId);
        }
      }
    });

    cluster.on('online', (worker) => {
      console.log(`[集群管理器] 工作进程 ${worker.process.pid} 上线`);
      
      // 查找对应的workerId并更新状态
      for (const [id, w] of this.workers.entries()) {
        if (w.process.pid === worker.process.pid) {
          const stats = this.workerStats.get(id);
          if (stats) {
            stats.status = 'online';
            stats.lastHeartbeat = Date.now();
          }
          break;
        }
      }
    });
  }

  // 重启工作进程
  async restartWorker(workerId) {
    try {
      const stats = this.workerStats.get(workerId);
      if (!stats) return;

      // 检查重启次数限制
      if (stats.restartCount >= this.maxRestartAttempts) {
        console.error(`[集群管理器] 工作进程 ${workerId} 重启次数超过限制 (${this.maxRestartAttempts})，停止重启`);
        return;
      }

      // 增加重启计数
      stats.restartCount++;
      stats.status = 'restarting';

      console.log(`[集群管理器] ${this.restartDelay}ms 后重启工作进程 ${workerId} (第 ${stats.restartCount} 次)`);

      // 延迟重启
      setTimeout(async () => {
        try {
          await this.createWorker(workerId);
          console.log(`[集群管理器] 工作进程 ${workerId} 重启成功`);
        } catch (error) {
          console.error(`[集群管理器] 工作进程 ${workerId} 重启失败:`, error);
        }
      }, this.restartDelay);

    } catch (error) {
      console.error(`[集群管理器] 重启工作进程 ${workerId} 时出错:`, error);
    }
  }

  // 处理工作进程消息
  handleWorkerMessage(worker, message) {
    try {
      const workerId = this.getWorkerId(worker);
      if (workerId === null) return;

      const stats = this.workerStats.get(workerId);
      if (!stats) return;

      // 忽略 PM2 内置消息（监控、性能指标等）
      if (message.type && typeof message.type === 'string' && message.type.startsWith('axm:')) {
        // axm:monitor, axm:action, axm:option 等都是 PM2 内置消息，无需处理
        return;
      }

      switch (message.type) {
        case 'worker_ready':
          stats.status = 'ready';
          stats.lastHeartbeat = Date.now();
          console.log(`[集群管理器] 工作进程 ${workerId} 准备就绪`);
          break;

        case 'worker_heartbeat':
          stats.lastHeartbeat = Date.now();
          stats.status = 'active';
          break;

        case 'job_completed':
          stats.status = 'active';
          stats.lastHeartbeat = Date.now();
          console.log(`[集群管理器] 工作进程 ${workerId} 完成任务: ${message.jobId}`);
          break;

        case 'job_failed':
          stats.status = 'active';
          stats.lastHeartbeat = Date.now();
          console.error(`[集群管理器] 工作进程 ${workerId} 任务失败: ${message.jobId}`, message.error);
          break;

        case 'worker_stats':
          // 更新工作进程统计信息
          Object.assign(stats, message.stats);
          break;

        default:
          // 只有非 PM2 内置消息才记录为未知消息
          console.log(`[集群管理器] 收到未知消息类型: ${message.type}`);
      }

    } catch (error) {
      console.error('[集群管理器] 处理工作进程消息时出错:', error);
    }
  }

  // 处理工作进程退出
  handleWorkerExit(worker, code, signal) {
    // 已在monitorWorkers中处理
  }

  // 处理工作进程错误
  handleWorkerError(worker, error) {
    console.error(`[集群管理器] 工作进程 ${worker.process.pid} 错误:`, error);
  }

  // 获取工作进程ID
  getWorkerId(worker) {
    for (const [id, w] of this.workers.entries()) {
      if (w.process.pid === worker.process.pid) {
        return id;
      }
    }
    return null;
  }

  // 启动健康检查
  startHealthCheck() {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const now = Date.now();
        const heartbeatTimeout = parseInt(process.env.HEARTBEAT_TIMEOUT) || 30000; // 30秒

        // 检查工作进程心跳
        for (const [workerId, stats] of this.workerStats.entries()) {
          if (stats.status === 'online' || stats.status === 'ready' || stats.status === 'active') {
            if (now - stats.lastHeartbeat > heartbeatTimeout) {
              console.warn(`[集群管理器] 工作进程 ${workerId} 心跳超时，标记为异常`);
              stats.status = 'timeout';
            }
          }
        }

        // 获取队列状态
        const queueStats = await this.userQueueManager.getQueueStats();
        const schedulerStatus = this.scheduler ? this.scheduler.getStatus() : null;
        const fairnessStats = this.scheduler ? this.scheduler.getUserFairnessStats() : null;

        // 输出健康状态
        console.log(`[健康检查] 工作进程: ${this.workers.size}/${this.numWorkers}, 队列任务: ${queueStats.totalJobs}, 公平性: ${fairnessStats?.fairness || 'N/A'}%`);

        // 如果任务积压过多，考虑增加工作进程
        if (queueStats.totalWaiting > this.numWorkers * 10) {
          console.log('[健康检查] 任务积压过多，建议增加工作进程');
        }

        // 如果公平性过低，输出警告
        if (fairnessStats && fairnessStats.fairness < 80) {
          console.warn(`[健康检查] 用户公平性较低: ${fairnessStats.fairness}%`);
        }

      } catch (error) {
        console.error('[健康检查] 检查失败:', error);
      }
    }, 30000); // 每30秒检查一次
  }

  // 启动性能监控
  startPerformanceMonitoring() {
    setInterval(() => {
      try {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        console.log(`[性能监控] 主进程 - 内存: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB, CPU: ${Math.round(cpuUsage.user / 1000)}ms`);
        
        // 监控工作进程性能
        for (const [workerId, stats] of this.workerStats.entries()) {
          if (stats.status === 'active' || stats.status === 'ready') {
            const worker = this.workers.get(workerId);
            if (worker && worker.process) {
              try {
                const workerMemUsage = worker.process.memoryUsage();
                console.log(`[性能监控] 工作进程 ${workerId} - 内存: ${Math.round(workerMemUsage.heapUsed / 1024 / 1024)}MB`);
              } catch (error) {
                // 忽略无法获取内存信息的错误
              }
            }
          }
        }

      } catch (error) {
        console.error('[性能监控] 监控失败:', error);
      }
    }, 60000); // 每1分钟监控一次
  }

  // 获取集群状态
  getClusterStatus() {
    const activeWorkers = Array.from(this.workerStats.values()).filter(stats => 
      stats.status === 'ready' || stats.status === 'active'
    ).length;

    const workerDetails = Array.from(this.workerStats.entries()).map(([id, stats]) => {
      // 获取进程类型信息
      let processType = 'mixed';
      const worker = this.workers.get(id);
      if (worker && worker.process && worker.process.env && worker.process.env.PROCESS_TYPE) {
        processType = worker.process.env.PROCESS_TYPE;
      }
      
      return {
        id: parseInt(id),
        pid: stats.pid,
        status: stats.status,
        processType: processType, // 添加进程类型
        startTime: stats.startTime,
        restartCount: stats.restartCount,
        lastHeartbeat: stats.lastHeartbeat
      };
    });

    return {
      masterPid: process.pid,
      numWorkers: this.numWorkers,
      activeWorkers,
      workerDetails,
      autoRestartEnabled: this.autoRestartEnabled,
      maxRestartAttempts: this.maxRestartAttempts
    };
  }

  // 优雅关闭
  async gracefulShutdown() {
    console.log('[集群管理器] 开始优雅关闭...');

    try {
      // 停止健康检查
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }

      // 停止调度器
      if (this.scheduler) {
        this.scheduler.stop();
      }

      // 关闭所有工作进程
      const shutdownPromises = Array.from(this.workers.values()).map(worker => {
        return new Promise((resolve) => {
          worker.on('exit', () => resolve());
          worker.kill('SIGTERM');
          
          // 强制关闭超时
          setTimeout(() => {
            worker.kill('SIGKILL');
            resolve();
          }, 5000);
        });
      });

      await Promise.all(shutdownPromises);

      // 清理用户队列
      await this.userQueueManager.cleanupAllQueues();

      console.log('[集群管理器] 优雅关闭完成');

    } catch (error) {
      console.error('[集群管理器] 优雅关闭失败:', error);
    }
  }

  // 动态调整工作进程数
  async adjustWorkerCount(newCount) {
    if (newCount === this.numWorkers) return;

    console.log(`[集群管理器] 调整工作进程数: ${this.numWorkers} -> ${newCount}`);

    if (newCount > this.numWorkers) {
      // 增加工作进程
      for (let i = this.numWorkers; i < newCount; i++) {
        await this.createWorker(i);
      }
    } else {
      // 减少工作进程
      const workersToRemove = this.numWorkers - newCount;
      const workerIds = Array.from(this.workers.keys()).slice(-workersToRemove);
      
      for (const workerId of workerIds) {
        const worker = this.workers.get(workerId);
        if (worker) {
          worker.kill('SIGTERM');
        }
      }
    }

    this.numWorkers = newCount;
    
    // 调整调度器工作进程数
    if (this.scheduler) {
      this.scheduler.setMaxWorkers(newCount);
    }

    console.log(`[集群管理器] 工作进程数调整完成: ${newCount}`);
  }
}

module.exports = ClusterManager;
