/**
 * 增强的集群管理器
 * 集成智能调度器，支持时段感知的进程分配
 */

const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
const IntelligentScheduler = require('./intelligentScheduler');
const SmartWorker = require('../workers/smartWorker');

class EnhancedClusterManager {
  constructor() {
    this.numWorkers = parseInt(process.env.WORKER_PROCESSES) || numCPUs;
    this.workers = new Map(); // workerId -> worker实例
    this.workerStats = new Map(); // workerId -> 统计信息
    this.healthCheckInterval = null;
    this.autoRestartEnabled = process.env.AUTO_RESTART_ENABLED !== 'false';
    this.maxRestartAttempts = parseInt(process.env.MAX_RESTART_ATTEMPTS) || 5;
    this.restartDelay = parseInt(process.env.RESTART_DELAY) || 1000;
    
    // 初始化智能调度器
    this.scheduler = new IntelligentScheduler();
    
    console.log('🚀 增强集群管理器初始化完成');
  }
  
  /**
   * 启动主进程
   */
  async startMaster() {
    try {
      console.log('='.repeat(60));
      console.log('🚀 增强集群管理器启动');
      console.log('='.repeat(60));
      console.log(`[集群管理器] 主进程 ${process.pid} 启动`);
      console.log(`[集群管理器] CPU核心数: ${numCPUs}`);
      console.log(`[集群管理器] 创建工作进程数: ${this.numWorkers}`);
      
      // 启动智能调度器
      this.scheduler.start();
      
      // 为每个CPU核心创建工作进程
      for (let i = 0; i < this.numWorkers; i++) {
        await this.createWorker(i);
      }
      
      // 监控工作进程
      this.monitorWorkers();
      
      // 首次创建完成后，立即进行一次角色分配，避免在队列非空时初始切换阻塞
      try {
        const initialMode = this.scheduler.currentMode || this.scheduler.getCurrentTimeBasedMode();
        await this.scheduler.reallocateWorkers(initialMode);
        console.log(`[集群管理器] 初始角色分配完成，模式: ${initialMode}`);
      } catch (e) {
        console.warn('[集群管理器] 初始角色分配失败（将由定时调度修复）:', e && e.message);
      }

      // 启动健康检查
      this.startHealthCheck();
      
      // 启动性能监控
      this.startPerformanceMonitoring();
      
      // 启动状态报告
      this.startStatusReporting();
      
      console.log(`[集群管理器] 主进程启动完成，工作进程数: ${this.numWorkers}`);
      
    } catch (error) {
      console.error('[集群管理器] 主进程启动失败:', error);
      throw error;
    }
  }
  
  /**
   * 创建工作进程
   */
  async createWorker(workerId) {
    return new Promise((resolve, reject) => {
      try {
        console.log(`[集群管理器] 创建工作进程 ${workerId}...`);
        
        const worker = cluster.fork({
          WORKER_ID: workerId,
          WORKER_TYPE: 'smart'
        });
        
        // 设置工作进程属性
        worker.id = workerId;
        worker.role = null;
        worker.restartCount = 0;
        worker.lastRestart = Date.now();
        
        // 注册到调度器
        this.scheduler.registerWorker(workerId, worker);
        
        // 存储工作进程
        this.workers.set(workerId, worker);
        
        // 设置工作进程事件监听
        this.setupWorkerEventHandlers(worker);
        
        // 初始化工作进程统计信息
        this.workerStats.set(workerId, {
          pid: worker.process.pid,
          status: 'starting',
          startTime: Date.now(),
          restartCount: 0,
          lastHeartbeat: Date.now(),
          role: null
        });
        
        console.log(`[集群管理器] 工作进程 ${workerId} 创建完成 (PID: ${worker.process.pid})`);
        resolve(worker);
        
      } catch (error) {
        console.error(`[集群管理器] 创建工作进程 ${workerId} 失败:`, error);
        reject(error);
      }
    });
  }
  
  /**
   * 设置工作进程事件处理器
   */
  setupWorkerEventHandlers(worker) {
    // 工作进程退出
    worker.on('exit', (code, signal) => {
      console.log(`[集群管理器] 工作进程 ${worker.id} 退出 (PID: ${worker.process.pid}, 代码: ${code}, 信号: ${signal})`);
      
      // 从调度器注销
      this.scheduler.unregisterWorker(worker.id);
      
      // 从工作进程列表移除
      this.workers.delete(worker.id);
      
      // 如果启用了自动重启，则重启工作进程
      if (this.autoRestartEnabled && worker.restartCount < this.maxRestartAttempts) {
        this.restartWorker(worker.id);
      }
    });
    
    // 工作进程错误
    worker.on('error', (error) => {
      console.error(`[集群管理器] 工作进程 ${worker.id} 错误:`, error);
    });
    
    // 工作进程消息
    worker.on('message', (message) => {
      this.handleWorkerMessage(worker, message);
    });
  }
  
  /**
   * 重启工作进程
   */
  async restartWorker(workerId) {
    try {
      const worker = this.workers.get(workerId);
      if (!worker) return;
      
      worker.restartCount++;
      worker.lastRestart = Date.now();
      
      console.log(`[集群管理器] 重启工作进程 ${workerId} (第 ${worker.restartCount} 次)...`);
      
      // 等待一段时间后重启
      setTimeout(async () => {
        try {
          await this.createWorker(workerId);
          console.log(`[集群管理器] 工作进程 ${workerId} 重启完成`);
        } catch (error) {
          console.error(`[集群管理器] 工作进程 ${workerId} 重启失败:`, error);
        }
      }, this.restartDelay);
      
    } catch (error) {
      console.error(`[集群管理器] 重启工作进程 ${workerId} 失败:`, error);
    }
  }
  
  /**
   * 处理工作进程消息
   */
  handleWorkerMessage(worker, message) {
    try {
      const { type, data, timestamp } = message;
      
      // 忽略 PM2 内置消息（监控、性能指标等）
      if (type && typeof type === 'string' && type.startsWith('axm:')) {
        // axm:monitor, axm:action, axm:option 等都是 PM2 内置消息，无需处理
        return;
      }
      
      switch (type) {
        case 'worker_ready':
          console.log(`[集群管理器] 工作进程 ${worker.id} 准备就绪`);
          this.updateWorkerStats(worker.id, { status: 'ready', lastHeartbeat: Date.now() });
          break;
          
        case 'worker_heartbeat':
          // 更新心跳时间
          this.updateWorkerStats(worker.id, { lastHeartbeat: Date.now() });
          break;
          
        case 'STATUS_UPDATE':
          this.updateWorkerStats(worker.id, data);
          break;
          
        case 'ROLE_CHANGED':
          console.log(`[集群管理器] 工作进程 ${worker.id} 角色变更为: ${data.role}`);
          worker.role = data.role;
          break;
          
        case 'MONITOR_STATUS':
          console.log(`[集群管理器] 工作进程 ${worker.id} 监控状态: ${data.enabled ? '启用' : '禁用'}`);
          break;
          
        default:
          // 只有非 PM2 内置消息才记录为未知消息
          console.log(`[集群管理器] 工作进程 ${worker.id} 发送未知消息类型: ${type}`);
      }
      
    } catch (error) {
      console.error(`[集群管理器] 处理工作进程 ${worker.id} 消息失败:`, error);
    }
  }
  
  /**
   * 更新工作进程统计信息
   */
  updateWorkerStats(workerId, stats) {
    const existingStats = this.workerStats.get(workerId) || {};
    this.workerStats.set(workerId, {
      ...existingStats,
      ...stats,
      lastUpdate: Date.now()
    });
  }
  
  /**
   * 监控工作进程
   */
  monitorWorkers() {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000); // 30秒检查一次
  }
  
  /**
   * 执行健康检查
   */
  performHealthCheck() {
    const now = Date.now();
    const unhealthyWorkers = [];
    
    for (const [workerId, worker] of this.workers) {
      const stats = this.workerStats.get(workerId);
      
      // 检查工作进程是否响应（使用lastHeartbeat或lastUpdate）
      const lastActivity = stats?.lastHeartbeat || stats?.lastUpdate;
      if (!stats || !lastActivity || (now - lastActivity) > 90000) { // 1.5分钟无响应
        unhealthyWorkers.push(workerId);
      }
    }
    
    if (unhealthyWorkers.length > 0) {
      console.warn(`[集群管理器] 发现不健康的工作进程: ${unhealthyWorkers.join(', ')}`);
      
      // 重启不健康的工作进程
      for (const workerId of unhealthyWorkers) {
        this.restartWorker(workerId);
      }
    }
  }
  
  /**
   * 启动健康检查
   */
  startHealthCheck() {
    console.log('[集群管理器] 健康检查已启动');
  }
  
  /**
   * 启动性能监控
   */
  startPerformanceMonitoring() {
    console.log('[集群管理器] 性能监控已启动');
  }
  
  /**
   * 启动状态报告
   */
  startStatusReporting() {
    setInterval(() => {
      this.reportStatus();
    }, 60000); // 每分钟报告一次状态
  }
  
  /**
   * 报告状态
   */
  reportStatus() {
    try {
      const schedulerStatus = this.scheduler.getStatus();
      const workerCount = this.workers.size;
      const workerStats = Array.from(this.workerStats.values());
      
      console.log('='.repeat(60));
      console.log('📊 集群状态报告');
      console.log('='.repeat(60));
      console.log(`当前模式: ${schedulerStatus.displayMode || schedulerStatus.currentMode || schedulerStatus.autoMode}`);
      console.log(`是否切换中: ${schedulerStatus.isTransitioning ? '是' : '否'}`);
      console.log(`工作进程数: ${workerCount}`);
      console.log(`通用进程: ${schedulerStatus.workers.general}`);
      console.log(`用户请求进程: ${schedulerStatus.workers.userRequest}`);
      console.log(`监控进程: ${schedulerStatus.master?.monitoring ? '主进程负责' : '未分配'}`);
      console.log(`队列状态: 等待=${schedulerStatus.queue.waiting}, 活跃=${schedulerStatus.queue.active}`);
      console.log('='.repeat(60));
      
    } catch (error) {
      console.error('[集群管理器] 状态报告失败:', error);
    }
  }
  
  /**
   * 优雅关闭
   */
  async gracefulShutdown() {
    try {
      console.log('[集群管理器] 开始优雅关闭...');
      
      // 停止智能调度器
      this.scheduler.stop();
      
      // 停止健康检查
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }
      
      // 关闭所有工作进程
      const shutdownPromises = [];
      for (const [workerId, worker] of this.workers) {
        shutdownPromises.push(this.shutdownWorker(workerId, worker));
      }
      
      await Promise.all(shutdownPromises);
      
      console.log('[集群管理器] 优雅关闭完成');
      
    } catch (error) {
      console.error('[集群管理器] 优雅关闭失败:', error);
    }
  }
  
  /**
   * 关闭单个工作进程
   */
  async shutdownWorker(workerId, worker) {
    return new Promise((resolve) => {
      try {
        console.log(`[集群管理器] 关闭工作进程 ${workerId}...`);
        
        // 发送关闭信号
        worker.send({
          type: 'SHUTDOWN',
          timestamp: Date.now()
        });
        
        // 等待工作进程退出
        worker.on('exit', () => {
          console.log(`[集群管理器] 工作进程 ${workerId} 已关闭`);
          resolve();
        });
        
        // 设置超时
        setTimeout(() => {
          console.log(`[集群管理器] 工作进程 ${workerId} 关闭超时，强制终止`);
          worker.kill('SIGTERM');
          resolve();
        }, 10000); // 10秒超时
        
      } catch (error) {
        console.error(`[集群管理器] 关闭工作进程 ${workerId} 失败:`, error);
        resolve();
      }
    });
  }
  
  /**
   * 获取集群状态
   */
  getStatus() {
    return {
      scheduler: this.scheduler.getStatus(),
      workers: {
        total: this.workers.size,
        details: Array.from(this.workers.entries()).map(([id, worker]) => ({
          id,
          pid: worker.process.pid,
          role: worker.role,
          restartCount: worker.restartCount,
          lastRestart: worker.lastRestart
        }))
      },
      stats: Array.from(this.workerStats.entries())
    };
  }

  /**
   * 获取集群状态
   */
  getClusterStatus() {
    const activeWorkers = Array.from(this.workerStats.values()).filter(stats => 
      stats.status === 'ready' || stats.status === 'active'
    ).length;

    const workerDetails = Array.from(this.workerStats.entries()).map(([id, stats]) => ({
      id: parseInt(id),
      pid: stats.pid,
      status: stats.status,
      startTime: stats.startTime,
      restartCount: stats.restartCount,
      lastHeartbeat: stats.lastHeartbeat
    }));

    return {
      masterPid: process.pid,
      numWorkers: this.numWorkers,
      activeWorkers,
      workerDetails,
      autoRestartEnabled: this.autoRestartEnabled,
      maxRestartAttempts: this.maxRestartAttempts
    };
  }
}

module.exports = EnhancedClusterManager;
