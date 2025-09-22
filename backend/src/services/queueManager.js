/**
 * 队列管理器
 * 统一管理所有队列的初始化和配置
 */

const { 
  logProcessingQueue, 
  realtimeProcessingQueue, 
  historicalProcessingQueue, 
  surgeryAnalysisQueue 
} = require('../config/queue');

class QueueManager {
  constructor() {
    this.queues = {
      logProcessing: logProcessingQueue,
      realtime: realtimeProcessingQueue,
      historical: historicalProcessingQueue,
      surgery: surgeryAnalysisQueue
    };
    
    this.initialized = false;
  }

  /**
   * 初始化所有队列
   */
  async initialize() {
    if (this.initialized) {
      console.log('[队列管理器] 队列已初始化，跳过重复初始化');
      return;
    }

    // 检查是否启用队列管理器
    if (process.env.QUEUE_MANAGER_ENABLED === 'false') {
      console.log('[队列管理器] 队列管理器已禁用');
      return;
    }

    try {
      console.log('[队列管理器] 开始初始化队列系统...');
      
      // 检查队列连接状态
      await this.checkQueueConnections();
      
      // 设置队列事件监听
      this.setupQueueEventListeners();
      
      // 启动定期状态检查
      this.startPeriodicStatusCheck();
      
      // 启动定期清理
      this.startPeriodicCleanup();
      
      this.initialized = true;
      console.log('[队列管理器] 队列系统初始化完成');
      
    } catch (error) {
      console.error('[队列管理器] 队列系统初始化失败:', error);
      throw error;
    }
  }

  /**
   * 检查队列连接状态
   */
  async checkQueueConnections() {
    const queueNames = Object.keys(this.queues);
    
    for (const queueName of queueNames) {
      const queue = this.queues[queueName];
      if (queue) {
        try {
          // 检查队列是否可访问
          await queue.isPaused();
          console.log(`[队列管理器] ${queueName} 队列连接正常`);
        } catch (error) {
          console.warn(`[队列管理器] ${queueName} 队列连接异常:`, error.message);
        }
      }
    }
  }

  /**
   * 设置队列事件监听
   */
  setupQueueEventListeners() {
    Object.entries(this.queues).forEach(([name, queue]) => {
      if (!queue) return;

      queue.on('error', (error) => {
        console.error(`[队列管理器] ${name} 队列错误:`, error);
      });

      queue.on('waiting', (jobId) => {
        console.log(`[队列管理器] ${name} 队列任务 ${jobId} 等待处理`);
      });

      queue.on('active', (job) => {
        console.log(`[队列管理器] ${name} 队列任务 ${job.id} 开始处理`);
      });

      queue.on('completed', (job) => {
        console.log(`[队列管理器] ${name} 队列任务 ${job.id} 处理完成`);
      });

      queue.on('failed', (job, err) => {
        console.error(`[队列管理器] ${name} 队列任务 ${job.id} 处理失败:`, err.message);
      });

      queue.on('stalled', (job) => {
        console.warn(`[队列管理器] ${name} 队列任务 ${job.id} 停滞`);
      });
    });
  }

  /**
   * 获取指定队列
   * @param {string} queueName - 队列名称
   * @returns {Object} 队列实例
   */
  getQueue(queueName) {
    return this.queues[queueName];
  }

  /**
   * 获取所有队列
   * @returns {Object} 所有队列实例
   */
  getAllQueues() {
    return this.queues;
  }

  /**
   * 根据来源获取合适的队列
   * @param {string} source - 来源类型 ('user-upload' | 'auto-upload')
   * @returns {Object} 队列实例
   */
  getQueueBySource(source) {
    switch (source) {
      case 'user-upload':
        return this.queues.realtime;
      case 'auto-upload':
        return this.queues.historical;
      default:
        return this.queues.logProcessing; // 默认使用通用队列
    }
  }

  /**
   * 获取队列状态信息
   * @returns {Object} 队列状态
   */
  async getQueueStatus() {
    const status = {};
    
    for (const [name, queue] of Object.entries(this.queues)) {
      if (!queue) continue;
      
      try {
        const waiting = await queue.getWaiting();
        const active = await queue.getActive();
        const completed = await queue.getCompleted();
        const failed = await queue.getFailed();
        
        status[name] = {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
          total: waiting.length + active.length + completed.length + failed.length
        };
      } catch (error) {
        console.error(`[队列管理器] 获取 ${name} 队列状态失败:`, error);
        status[name] = { error: error.message };
      }
    }
    
    return status;
  }

  /**
   * 清理队列
   * @param {string} queueName - 队列名称
   * @param {Object} options - 清理选项
   */
  async cleanQueue(queueName, options = {}) {
    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`队列 ${queueName} 不存在`);
    }

    try {
      const { 
        grace = 0, 
        type = 'completed' 
      } = options;
      
      await queue.clean(grace, type);
      console.log(`[队列管理器] ${queueName} 队列清理完成`);
    } catch (error) {
      console.error(`[队列管理器] 清理 ${queueName} 队列失败:`, error);
      throw error;
    }
  }

  /**
   * 暂停队列
   * @param {string} queueName - 队列名称
   */
  async pauseQueue(queueName) {
    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`队列 ${queueName} 不存在`);
    }

    try {
      await queue.pause();
      console.log(`[队列管理器] ${queueName} 队列已暂停`);
    } catch (error) {
      console.error(`[队列管理器] 暂停 ${queueName} 队列失败:`, error);
      throw error;
    }
  }

  /**
   * 恢复队列
   * @param {string} queueName - 队列名称
   */
  async resumeQueue(queueName) {
    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`队列 ${queueName} 不存在`);
    }

    try {
      await queue.resume();
      console.log(`[队列管理器] ${queueName} 队列已恢复`);
    } catch (error) {
      console.error(`[队列管理器] 恢复 ${queueName} 队列失败:`, error);
      throw error;
    }
  }

  /**
   * 启动定期状态检查
   */
  startPeriodicStatusCheck() {
    const interval = parseInt(process.env.QUEUE_STATUS_CHECK_INTERVAL) || 30000; // 默认30秒
    
    this.statusCheckInterval = setInterval(async () => {
      try {
        const status = await this.getQueueStatus();
        
        // 检查队列健康状态
        Object.entries(status).forEach(([queueName, queueStatus]) => {
          if (queueStatus.error) {
            console.warn(`[队列管理器] ${queueName} 队列状态异常:`, queueStatus.error);
          }
          
          // 检查队列积压情况
          const totalPending = (queueStatus.waiting || 0) + (queueStatus.active || 0);
          if (totalPending > 100) {
            console.warn(`[队列管理器] ${queueName} 队列积压严重: ${totalPending} 个任务`);
          }
        });
        
      } catch (error) {
        console.error('[队列管理器] 定期状态检查失败:', error);
      }
    }, interval);
    
    console.log(`[队列管理器] 定期状态检查已启动，间隔: ${interval}ms`);
  }

  /**
   * 启动定期清理
   */
  startPeriodicCleanup() {
    const interval = parseInt(process.env.QUEUE_CLEANUP_INTERVAL) || 3600000; // 默认1小时
    
    this.cleanupInterval = setInterval(async () => {
      try {
        console.log('[队列管理器] 开始定期清理队列...');
        
        for (const [queueName, queue] of Object.entries(this.queues)) {
          if (queue) {
            try {
              // 清理完成的任务
              await queue.clean(0, 'completed');
              
              // 清理失败的任务（保留最近24小时）
              const retentionHours = parseInt(process.env.QUEUE_MAX_RETENTION_HOURS) || 24;
              const retentionMs = retentionHours * 60 * 60 * 1000;
              await queue.clean(retentionMs, 'failed');
              
              console.log(`[队列管理器] ${queueName} 队列清理完成`);
            } catch (error) {
              console.error(`[队列管理器] 清理 ${queueName} 队列失败:`, error);
            }
          }
        }
        
      } catch (error) {
        console.error('[队列管理器] 定期清理失败:', error);
      }
    }, interval);
    
    console.log(`[队列管理器] 定期清理已启动，间隔: ${interval}ms`);
  }

  /**
   * 停止定期任务
   */
  stopPeriodicTasks() {
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
      this.statusCheckInterval = null;
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    console.log('[队列管理器] 定期任务已停止');
  }

  /**
   * 关闭所有队列
   */
  async closeAll() {
    console.log('[队列管理器] 开始关闭所有队列...');
    
    // 停止定期任务
    this.stopPeriodicTasks();
    
    for (const [name, queue] of Object.entries(this.queues)) {
      if (queue) {
        try {
          await queue.close();
          console.log(`[队列管理器] ${name} 队列已关闭`);
        } catch (error) {
          console.error(`[队列管理器] 关闭 ${name} 队列失败:`, error);
        }
      }
    }
    
    this.initialized = false;
    console.log('[队列管理器] 所有队列已关闭');
  }
}

// 创建单例实例
const queueManager = new QueueManager();

module.exports = queueManager;
