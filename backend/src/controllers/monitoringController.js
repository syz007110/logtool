/**
 * 统一监控控制�?
 * 整合系统所有监控数据，提供统一的监控接�?
 */

const { cacheManager } = require('../config/cache');
const UserQueueManager = require('../workers/userQueueManager');
const { monitoringStorage } = require('../services/monitoringStorage');

class MonitoringController {
  constructor() {
    this.userQueueManager = new UserQueueManager();
    this.metricsHistory = new Map(); // 存储历史指标数据
    this.alertThresholds = {
      cpuUsage: 80,           // CPU使用率告警阈�?
      memoryUsage: 85,        // 内存使用率告警阈�?
      queueLength: 100,       // 队列长度告警阈�?
      errorRate: 5,           // 错误率告警阈值（百分比）
      responseTime: 5000,     // 响应时间告警阈值（毫秒�?
      cacheHitRate: 70        // 缓存命中率告警阈值（百分比）
    };
  }

  /**
   * 获取系统概览监控数据
   */
  async getSystemOverview(req, res) {
    try {
      const [
        systemMetrics,
        applicationMetrics,
        businessMetrics,
        clusterStatus,
        queueStatus
      ] = await Promise.all([
        this.getSystemMetrics(),
        this.getApplicationMetrics(),
        this.getBusinessMetrics(),
        this.getClusterStatus(),
        this.getQueueStatus()
      ]);

      const overview = {
        timestamp: new Date().toISOString(),
        system: systemMetrics,
        application: applicationMetrics,
        business: businessMetrics,
        cluster: clusterStatus,
        queue: queueStatus,
        alerts: await this.checkAlerts()
      };

      // 存储监控数据到历史记�?
      await Promise.all([
        monitoringStorage.storeMetrics(systemMetrics, 'system'),
        monitoringStorage.storeMetrics(applicationMetrics, 'application'),
        monitoringStorage.storeMetrics(businessMetrics, 'business')
      ]);

      res.json({
        success: true,
        data: overview
      });
    } catch (error) {
      console.error('[监控控制器] 获取系统概览失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * 获取系统级指�?
   */
  async getSystemMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      memory: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        external: Math.round(memUsage.external / 1024 / 1024), // MB
        usage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100) // 百分�?
      },
      cpu: {
        user: Math.round(cpuUsage.user / 1000), // ms
        system: Math.round(cpuUsage.system / 1000), // ms
        total: Math.round((cpuUsage.user + cpuUsage.system) / 1000) // ms
      },
      uptime: Math.round(process.uptime()), // �?
      nodeVersion: process.version,
      platform: process.platform
    };
  }

  /**
   * 获取应用级指�?
   */
  async getApplicationMetrics() {
    const cacheStats = await cacheManager.getStats();
    
    return {
      cache: {
        connected: cacheManager.isConnected,
        keys: cacheStats?.keys || 0,
        memory: cacheStats?.memory || 'N/A'
      },
      api: {
        // 这里可以从中间件收集API指标
        totalRequests: this.getTotalRequests(),
        errorRate: this.getErrorRate(),
        avgResponseTime: this.getAvgResponseTime()
      }
    };
  }

  /**
   * 获取业务级指?
   */
  async getBusinessMetrics() {
    try {
      // 获取全局队列状态（logProcessingQueue?
      const { logProcessingQueue, realtimeProcessingQueue, historicalProcessingQueue, surgeryAnalysisQueue } = require('../config/queue');
      
      // 获取所有队列的任务状态（用计数接口，避免列表遍历开销）
      const [logCounts, rtCounts, histCounts, surgCounts] = await Promise.all([
        logProcessingQueue.getJobCounts(),
        realtimeProcessingQueue.getJobCounts(),
        historicalProcessingQueue.getJobCounts(),
        surgeryAnalysisQueue.getJobCounts()
      ]);
      
      // 计算所有队列的总任务数
      const waiting = (logCounts.waiting || 0) + (rtCounts.waiting || 0) + (histCounts.waiting || 0) + (surgCounts.waiting || 0);
      const active = (logCounts.active || 0) + (rtCounts.active || 0) + (histCounts.active || 0) + (surgCounts.active || 0);
      const completed = (logCounts.completed || 0) + (rtCounts.completed || 0) + (histCounts.completed || 0) + (surgCounts.completed || 0);
      const failed = (logCounts.failed || 0) + (rtCounts.failed || 0) + (histCounts.failed || 0) + (surgCounts.failed || 0);
      
      const queueStats = {
        totalUsers: 1, // 全局队列，所有用户共?
        totalWaiting: waiting,
        totalActive: active,
        totalCompleted: completed,
        totalFailed: failed,
        totalJobs: waiting + active + completed + failed,
        userQueues: {
          'global': {
            waiting: waiting,
            active: active,
            completed: completed,
            failed: failed,
            total: waiting + active + completed + failed
          }
        }
      };
      
      let schedulerStatus = null;
      let fairnessStats = null;
      
      // 安全获取调度器状�?
      if (global.clusterManager?.scheduler) {
        try {
          if (typeof global.clusterManager.scheduler.getStatus === 'function') {
            schedulerStatus = global.clusterManager.scheduler.getStatus();
          }
          if (typeof global.clusterManager.scheduler.getUserFairnessStats === 'function') {
            fairnessStats = global.clusterManager.scheduler.getUserFairnessStats();
          }
        } catch (error) {
          console.warn('[监控控制器] 获取调度器状态失�?', error);
        }
      }

      return {
        users: {
          total: queueStats.totalUsers,
          active: Object.values(queueStats.userQueues).filter(q => q.total > 0).length
        },
        tasks: {
          total: queueStats.totalJobs,
          waiting: queueStats.totalWaiting,
          processing: queueStats.totalActive,
          completed: queueStats.totalCompleted,
          failed: queueStats.totalFailed
        },
        fairness: fairnessStats?.fairness || 0,
        throughput: this.calculateThroughput(queueStats)
      };
    } catch (error) {
      console.error('[监控控制器] 获取业务指标失败:', error);
      return {
        users: {
          total: 0,
          active: 0
        },
        tasks: {
          total: 0,
          waiting: 0,
          processing: 0,
          completed: 0,
          failed: 0
        },
        fairness: 0,
        throughput: 0,
        error: error.message
      };
    }
  }

  /**
   * 获取集群状�?
   */
  async getClusterStatus() {
    if (!global.clusterManager || typeof global.clusterManager.getClusterStatus !== 'function') {
      return {
        enabled: false,
        message: '集群模式未启用或未初始化'
      };
    }

    try {
      const clusterStatus = global.clusterManager.getClusterStatus();
      const schedulerStatus = global.clusterManager.scheduler?.getStatus();

      return {
        enabled: true,
        masterPid: clusterStatus.masterPid,
        workers: {
          total: clusterStatus.numWorkers,
          active: clusterStatus.activeWorkers,
          details: clusterStatus.workerDetails
        },
        scheduler: schedulerStatus,
        autoRestart: clusterStatus.autoRestartEnabled
      };
    } catch (error) {
      console.error('[监控控制器] 获取集群状态失败:', error);
      return {
        enabled: false,
        message: '获取集群状态失败',
        error: error.message
      };
    }
  }

  /**
   * 获取队列状�?
   */
  async getQueueStatus() {
    try {
      // 获取全局队列状态（logProcessingQueue�?
      const { logProcessingQueue, realtimeProcessingQueue, historicalProcessingQueue, surgeryAnalysisQueue } = require('../config/queue');
      
      // 获取所有队列的任务状态
      const [
        logWaiting, logActive, logCompleted, logFailed,
        realtimeWaiting, realtimeActive, realtimeCompleted, realtimeFailed,
        historicalWaiting, historicalActive, historicalCompleted, historicalFailed,
        surgeryWaiting, surgeryActive, surgeryCompleted, surgeryFailed
      ] = await Promise.all([
        logProcessingQueue.getWaiting(),
        logProcessingQueue.getActive(),
        logProcessingQueue.getCompleted(),
        logProcessingQueue.getFailed(),
        realtimeProcessingQueue.getWaiting(),
        realtimeProcessingQueue.getActive(),
        realtimeProcessingQueue.getCompleted(),
        realtimeProcessingQueue.getFailed(),
        historicalProcessingQueue.getWaiting(),
        historicalProcessingQueue.getActive(),
        historicalProcessingQueue.getCompleted(),
        historicalProcessingQueue.getFailed(),
        surgeryAnalysisQueue.getWaiting(),
        surgeryAnalysisQueue.getActive(),
        surgeryAnalysisQueue.getCompleted(),
        surgeryAnalysisQueue.getFailed()
      ]);
      
      // 计算所有队列的总任务数
      const waiting = logWaiting.length + realtimeWaiting.length + historicalWaiting.length + surgeryWaiting.length;
      const active = logActive.length + realtimeActive.length + historicalActive.length + surgeryActive.length;
      const completed = logCompleted.length + realtimeCompleted.length + historicalCompleted.length + surgeryCompleted.length;
      const failed = logFailed.length + realtimeFailed.length + historicalFailed.length + surgeryFailed.length;
      
      // 获取进程级别的任务统计
      const processStats = await this.getProcessTaskStats();
      
      const queueStats = {
        totalUsers: 1, // 全局队列，所有用户共?
        totalWaiting: waiting.length,
        totalActive: active.length,
        totalCompleted: completed.length,
        totalFailed: failed.length,
        totalJobs: waiting.length + active.length + completed.length + failed.length,
        userQueues: {
          'global': {
            waiting: waiting.length,
            active: active.length,
            completed: completed.length,
            failed: failed.length,
            total: waiting.length + active.length + completed.length + failed.length
          }
        },
        processStats: processStats // 添加进程统计
      };
      
      
      let schedulerStatus = null;
      
      // 安全获取调度器状�?
      if (global.clusterManager?.scheduler?.getStatus) {
        try {
          schedulerStatus = global.clusterManager.scheduler.getStatus();
        } catch (error) {
          console.warn('[监控控制器] 获取调度器状态失�?', error);
        }
      }

      // 根据进程角色分配队列消费者
      const getQueueConsumers = (queueType) => {
        const consumers = [];
        if (queueStats.processStats && queueStats.processStats.processes) {
          queueStats.processStats.processes.forEach(process => {
            if (process.type === 'worker') {
              let shouldConsume = false;
              
              // 根据进程角色和队列类型判断是否消费该队列
              if (queueType === 'logProcessingQueue') {
                // 通用进程和用户进程都可以消费日志处理队列
                shouldConsume = process.role === 'general' || process.role === 'userRequest' || !process.role;
              } else if (queueType === 'realtimeProcessingQueue') {
                // 通用进程和用户进程都可以消费实时队列
                shouldConsume = process.role === 'general' || process.role === 'userRequest' || !process.role;
              } else if (queueType === 'historicalProcessingQueue') {
                // 只有通用进程消费历史队列（用户进程不参与）
                shouldConsume = process.role === 'general' || !process.role;
              } else if (queueType === 'surgeryAnalysisQueue') {
                // 通用进程和用户进程都可以消费手术分析队列
                shouldConsume = process.role === 'general' || process.role === 'userRequest' || !process.role;
              }
              
              if (shouldConsume) {
                // 包含进程类型、角色和PID信息，格式：type_role#pid
                const roleInfo = process.role ? `_${process.role}` : '';
                consumers.push(`${process.type}${roleInfo}#${process.pid}`);
              }
            }
          });
        }
        return consumers;
      };

      // 按队列类型分组返回数据
      const queues = [
        {
          type: 'logProcessingQueue',
          waiting: logWaiting.length,
          active: logActive.length,
          completed: logCompleted.length,
          failed: logFailed.length,
          consumers: getQueueConsumers('logProcessingQueue')
        },
        {
          type: 'realtimeProcessingQueue',
          waiting: realtimeWaiting.length,
          active: realtimeActive.length,
          completed: realtimeCompleted.length,
          failed: realtimeFailed.length,
          consumers: getQueueConsumers('realtimeProcessingQueue')
        },
        {
          type: 'historicalProcessingQueue',
          waiting: historicalWaiting.length,
          active: historicalActive.length,
          completed: historicalCompleted.length,
          failed: historicalFailed.length,
          consumers: getQueueConsumers('historicalProcessingQueue')
        },
        {
          type: 'surgeryAnalysisQueue',
          waiting: surgeryWaiting.length,
          active: surgeryActive.length,
          completed: surgeryCompleted.length,
          failed: surgeryFailed.length,
          consumers: getQueueConsumers('surgeryAnalysisQueue')
        }
      ];

      return {
        summary: {
          totalJobs: queueStats.totalJobs,
          waiting: queueStats.totalWaiting,
          active: queueStats.totalActive,
          completed: queueStats.totalCompleted,
          failed: queueStats.totalFailed
        },
        users: queueStats.totalUsers,
        workers: {
          total: schedulerStatus?.maxWorkers || 0,
          active: schedulerStatus?.activeWorkers || 0,
          idle: schedulerStatus?.idleWorkers || 0
        },
        userQueues: Object.keys(queueStats.userQueues).length,
        processStats: queueStats.processStats, // 添加进程统计
        queues: queues // 添加按队列类型分组的数据
      };
    } catch (error) {
      console.error('[监控控制器] 获取队列状态失�?', error);
      return {
        summary: {
          totalJobs: 0,
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0
        },
        users: 0,
        workers: {
          total: 0,
          active: 0,
          idle: 0
        },
        userQueues: 0,
        processStats: {
          totalProcesses: 1,
          masterProcess: {
            pid: process.pid,
            type: 'master',
            status: 'active',
            tasks: { active: 0, waiting: 0, completed: 0, failed: 0, total: 0 }
          },
          workerProcesses: [],
          processes: [{
            pid: process.pid,
            type: 'master',
            status: 'active',
            tasks: { active: 0, waiting: 0, completed: 0, failed: 0, total: 0 }
          }]
        },
        queues: [
          { type: 'logProcessingQueue', waiting: 0, active: 0, completed: 0, failed: 0, consumers: ['master#' + process.pid] },
          { type: 'realtimeProcessingQueue', waiting: 0, active: 0, completed: 0, failed: 0, consumers: [] },
          { type: 'historicalProcessingQueue', waiting: 0, active: 0, completed: 0, failed: 0, consumers: ['master#' + process.pid] },
          { type: 'surgeryAnalysisQueue', waiting: 0, active: 0, completed: 0, failed: 0, consumers: ['master#' + process.pid] }
        ],
        error: error.message
      };
    }
  }

  /**
   * 获取历史指标数据
   */
  async getMetricsHistory(req, res) {
    try {
      const { metric, hours = 24 } = req.query;
      const history = await monitoringStorage.getMetricsHistory(metric, parseInt(hours));
      
      res.json({
        success: true,
        data: {
          metric,
          hours: parseInt(hours),
          data: history
        }
      });
    } catch (error) {
      console.error('[监控控制器] 获取历史指标失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * 获取实时指标数据（WebSocket支持�?
   */
  async getRealtimeMetrics(req, res) {
    try {
      const metrics = await this.collectRealtimeMetrics();
      
      res.json({
        success: true,
        data: {
          timestamp: new Date().toISOString(),
          metrics
        }
      });
    } catch (error) {
      console.error('[监控控制器] 获取实时指标失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * 检查告警条�?
   */
  async checkAlerts() {
    const alerts = [];
    const now = new Date();

    try {
      // 检查系统指�?
      const systemMetrics = await this.getSystemMetrics();
      
      if (systemMetrics.memory.usage > this.alertThresholds.memoryUsage) {
        alerts.push({
          type: 'memory',
          level: 'warning',
          message: `内存使用率过�? ${systemMetrics.memory.usage}%`,
          timestamp: now
        });
      }

      // 检查队列状�?
      const queueStats = await this.userQueueManager.getQueueStats();
      
      if (queueStats.totalWaiting > this.alertThresholds.queueLength) {
        alerts.push({
          type: 'queue',
          level: 'warning',
          message: `队列积压过多: ${queueStats.totalWaiting} 个任务`,
          timestamp: now
        });
      }

      // 检查错误率
      const errorRate = this.getErrorRate();
      if (errorRate > this.alertThresholds.errorRate) {
        alerts.push({
          type: 'error_rate',
          level: 'critical',
          message: `错误率过�? ${errorRate}%`,
          timestamp: now
        });
      }

      // 检查缓存状�?
      if (!cacheManager.isConnected) {
        alerts.push({
          type: 'cache',
          level: 'critical',
          message: '缓存服务连接断开',
          timestamp: now
        });
      }

      // 存储告警到历史记�?
      for (const alert of alerts) {
        await monitoringStorage.storeAlert(alert);
      }

    } catch (error) {
      console.error('[监控控制器] 检查告警失�?', error);
    }

    return alerts;
  }

  /**
   * 设置告警阈�?
   */
  async setAlertThresholds(req, res) {
    try {
      const { thresholds } = req.body;
      
      if (!thresholds || typeof thresholds !== 'object') {
        return res.status(400).json({
          success: false,
          error: '请提供有效的阈值配置'
        });
      }

      // 更新阈值
      Object.assign(this.alertThresholds, thresholds);
      
      res.json({
        success: true,
        message: '告警阈值已更新',
        data: this.alertThresholds
      });
    } catch (error) {
      console.error('[监控控制器] 设置告警阈值失�?', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * 获取告警历史
   */
  async getAlertHistory(req, res) {
    try {
      const { hours = 24 } = req.query;
      const alerts = await monitoringStorage.getAlertsHistory(parseInt(hours));
      
      res.json({
        success: true,
        data: {
          hours: parseInt(hours),
          alerts
        }
      });
    } catch (error) {
      console.error('[监控控制器] 获取告警历史失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // 辅助方法
  getTotalRequests() {
    // 从全局计数器获取总请求数
    return global.requestCounter?.total || 0;
  }

  getErrorRate() {
    // 计算错误�?
    const total = global.requestCounter?.total || 0;
    const errors = global.requestCounter?.errors || 0;
    return total > 0 ? Math.round((errors / total) * 100) : 0;
  }

  getAvgResponseTime() {
    // 计算平均响应时间
    return global.requestCounter?.avgResponseTime || 0;
  }

  calculateThroughput(queueStats) {
    // 计算吞吐量（任务/分钟�?
    const timeWindow = 5; // 5分钟窗口
    return Math.round(queueStats.totalCompleted / timeWindow);
  }

  collectRealtimeMetrics() {
    return {
      system: this.getSystemMetrics(),
      timestamp: new Date().toISOString()
    };
  }

  getStoredMetrics(metric, hours) {
    // 从存储中获取历史指标数据
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    const history = this.metricsHistory.get(metric) || [];
    return history.filter(item => item.timestamp > cutoff);
  }

  getStoredAlerts(hours) {
    // 从存储中获取历史告警数据
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    return global.alertHistory?.filter(alert => alert.timestamp > cutoff) || [];
  }

  /**
   * 获取进程级别的任务统�?
   */
  async getProcessTaskStats() {
    try {
      console.log('[监控控制器] 开始获取进程任务统�?..');
      console.log('[监控控制器] global.clusterManager 存在:', !!global.clusterManager);
      console.log('[监控控制器] global.clusterManager.getClusterStatus 存在:', !!(global.clusterManager && global.clusterManager.getClusterStatus));
      
      const processStats = [];
      
      // 获取当前进程信息
      const currentProcess = {
        pid: process.pid,
        type: 'master',
        status: 'active',
        startTime: new Date(Date.now() - process.uptime() * 1000),
        uptime: process.uptime(),
        tasks: {
          active: 0,
          waiting: 0,
          completed: 0,
          failed: 0
        }
      };

      // 如果是集群模式，获取工作进程信息
      if (global.clusterManager && global.clusterManager.getClusterStatus) {
        try {
          const clusterStatus = global.clusterManager.getClusterStatus();
          console.log('[监控控制器] 集群状态', `工作进程: ${clusterStatus.activeWorkers}/${clusterStatus.numWorkers}`);
          
          // 添加主进�?
          processStats.push({
            pid: clusterStatus.masterPid,
            type: 'master',
            status: 'active',
            startTime: new Date(Date.now() - process.uptime() * 1000),
            uptime: process.uptime(),
            tasks: {
              active: 0,
              waiting: 0,
              completed: 0,
              failed: 0
            }
          });

          // 添加工作进程
          if (clusterStatus.workerDetails) {
            console.log('[监控控制器] 工作进程详情:', clusterStatus.workerDetails.length, '个');
            clusterStatus.workerDetails.forEach((worker, index) => {
              console.log(`[监控控制器] 工作进程 ${index}: PID=${worker.pid}, 状态=${worker.status}`);
              
              // 获取进程角色信息
              let role = null;
              if (global.clusterManager?.scheduler?.workers) {
                const workerInfo = global.clusterManager.scheduler.workers.get(worker.id);
                role = workerInfo?.role || 'general';
              }
              
              processStats.push({
                id: worker.id,
                pid: worker.pid,
                type: 'worker',
                status: worker.status,
                role: role, // 添加角色信息
                startTime: new Date(worker.startTime),
                uptime: Math.round((Date.now() - worker.startTime) / 1000),
                restartCount: worker.restartCount,
                lastHeartbeat: new Date(worker.lastHeartbeat),
                tasks: {
                  active: 0,
                  waiting: 0,
                  completed: 0,
                  failed: 0
                }
              });
            });
          } else {
            console.log('[监控控制器] 没有工作进程详情');
          }
        } catch (error) {
          console.warn('[监控控制器] 获取集群状态失败:', error);
          // 降级到单进程模式
          processStats.push(currentProcess);
        }
      } else {
        // 检查是否在集群模式下运行但无法访问集群管理器
        const isClusterMode = process.env.WORKER_ID !== undefined;
        if (isClusterMode) {
          console.log('[监控控制器] 集群模式但无法访问集群管理器，创建模拟进程信息');
          
          // 获取当前进程信息
          const currentWorkerId = process.env.WORKER_ID || '0';
          let role = 'general'; // 默认角色
          
          // 尝试从环境变量或其他方式获取角色信息
          if (process.env.PROCESS_ROLE) {
            role = process.env.PROCESS_ROLE;
          }
          
          processStats.push({
            id: currentWorkerId,
            pid: process.pid,
            type: 'worker',
            status: 'active',
            role: role,
            startTime: new Date(Date.now() - process.uptime() * 1000),
            uptime: process.uptime(),
            restartCount: 0,
            lastHeartbeat: new Date(),
            tasks: {
              active: 0,
              waiting: 0,
              completed: 0,
              failed: 0
            }
          });
          
          // 添加主进程（模拟）
          processStats.push({
            pid: process.ppid || process.pid,
            type: 'master',
            status: 'active',
            startTime: new Date(Date.now() - process.uptime() * 1000),
            uptime: process.uptime(),
            tasks: {
              active: 0,
              waiting: 0,
              completed: 0,
              failed: 0
            }
          });
      } else {
        // 单进程模式
        console.log('[监控控制器] 运行在单进程模式');
        processStats.push(currentProcess);
      }
      }

      // 获取所有队列中的任务分配情况
      const { logProcessingQueue, realtimeProcessingQueue, historicalProcessingQueue, surgeryAnalysisQueue } = require('../config/queue');
      const [
        logActiveJobs, logWaitingJobs,
        realtimeActiveJobs, realtimeWaitingJobs,
        historicalActiveJobs, historicalWaitingJobs,
        surgeryActiveJobs, surgeryWaitingJobs
      ] = await Promise.all([
        logProcessingQueue.getActive(),
        logProcessingQueue.getWaiting(),
        realtimeProcessingQueue.getActive(),
        realtimeProcessingQueue.getWaiting(),
        historicalProcessingQueue.getActive(),
        historicalProcessingQueue.getWaiting(),
        surgeryAnalysisQueue.getActive(),
        surgeryAnalysisQueue.getWaiting()
      ]);
      
      // 计算所有队列的总任务数（仅用于汇总显示，不再按进程平均/分摊）
      const activeJobs = logActiveJobs.length + realtimeActiveJobs.length + historicalActiveJobs.length + surgeryActiveJobs.length;
      const waitingJobs = logWaitingJobs.length + realtimeWaitingJobs.length + historicalWaitingJobs.length + surgeryWaitingJobs.length;

      // 根据进程角色分配任务统计
      
      processStats.forEach(process => {
        if (process.type === 'worker') {
          // 根据进程角色分配对应的队列任务
          if (process.role === 'monitor' || process.type === 'master') {
            // 主进程/监控进程不消费队列
            process.tasks.active = 0;
            process.tasks.waiting = 0;
          } else if (process.role === 'userRequest') {
            // 用户进程：只统计实时队列（用户请求专用）
            process.tasks.active = realtimeActiveJobs.length;
            process.tasks.waiting = realtimeWaitingJobs.length;
          } else if (process.role === 'general') {
            // 通用进程：统计历史队列（自动上传）+ 通用日志处理队列（共享队列）
            process.tasks.active = historicalActiveJobs.length + logActiveJobs.length;
            process.tasks.waiting = historicalWaitingJobs.length + logWaitingJobs.length;
          } else {
            // 其他未知角色，保守显示0
            process.tasks.active = 0;
            process.tasks.waiting = 0;
          }
          
          // 添加当前进程标识
          process.isCurrentProcess = false; // �ڼ�Ⱥģʽ�£������̹������й�������
        } else {
          // 主进程不处理任务
          process.tasks.active = 0;
          process.tasks.waiting = 0;
          process.isCurrentProcess = false;
        }
        
        // 计算总任务数
        process.tasks.total = process.tasks.active + process.tasks.waiting + process.tasks.completed + process.tasks.failed;
      });

      return {
        totalProcesses: processStats.length,
        masterProcess: processStats.find(p => p.type === 'master'),
        workerProcesses: processStats.filter(p => p.type === 'worker'),
        processes: processStats
      };
    } catch (error) {
      console.error('[监控控制器] 获取进程任务统计失败:', error);
      return {
        totalProcesses: 1,
        masterProcess: {
          pid: process.pid,
          type: 'master',
          status: 'active',
          tasks: { active: 0, waiting: 0, completed: 0, failed: 0 }
        },
        workerProcesses: [],
        processes: [{
          pid: process.pid,
          type: 'master',
          status: 'active',
          tasks: { active: 0, waiting: 0, completed: 0, failed: 0 }
        }]
      };
    }
  }

  /**
   * 手动切换集群模式
   */
  async setClusterMode(req, res) {
    try {
      const { mode } = req.body;
      
      if (!mode || !['peak', 'offPeak'].includes(mode)) {
        return res.status(400).json({
          success: false,
          message: '无效的模式参数，必须是 "peak" 或 "offPeak"'
        });
      }
      
      if (!global.clusterManager || !global.clusterManager.scheduler) {
        return res.status(400).json({
          success: false,
          message: '集群模式未启用或调度器未初始化'
        });
      }
      
      console.log(`[监控控制器] 手动切换集群模式到: ${mode}`);
      const result = await global.clusterManager.scheduler.setManualMode(mode);
      
      return res.json(result);
    } catch (error) {
      console.error('[监控控制器] 手动切换集群模式失败:', error);
      return res.status(500).json({
        success: false,
        message: '切换集群模式失败',
        error: error.message
      });
    }
  }
}

module.exports = new MonitoringController();
