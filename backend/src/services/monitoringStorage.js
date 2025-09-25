/**
 * 监控数据存储服务
 * 负责监控数据的持久化存储和历史数据管理
 */

const { cacheManager } = require('../config/cache');

class MonitoringStorage {
  constructor() {
    this.storageConfig = {
      enabled: process.env.MONITORING_STORAGE_ENABLED === 'true' || true,
      retentionDays: parseInt(process.env.MONITORING_RETENTION_DAYS) || 7, // 保留7天
      batchSize: parseInt(process.env.MONITORING_BATCH_SIZE) || 100,
      flushInterval: parseInt(process.env.MONITORING_FLUSH_INTERVAL) || 60000 // 1分钟
    };
    
    this.metricsBuffer = [];
    this.alertsBuffer = [];
    this.isFlushing = false;
    
    // 启动定期刷新
    if (this.storageConfig.enabled) {
      this.startPeriodicFlush();
    }
  }

  /**
   * 存储指标数据
   * @param {Object} metrics - 指标数据
   * @param {string} type - 指标类型 (system, application, business)
   */
  async storeMetrics(metrics, type = 'system') {
    if (!this.storageConfig.enabled || !cacheManager.isConnected) {
      return false;
    }

    const timestamp = new Date().toISOString();
    const data = {
      type,
      timestamp,
      data: metrics,
      ttl: this.calculateTTL()
    };

    // 添加到缓冲区
    this.metricsBuffer.push(data);

    // 如果缓冲区满了，立即刷新
    if (this.metricsBuffer.length >= this.storageConfig.batchSize) {
      await this.flushMetrics();
    }

    return true;
  }

  /**
   * 存储告警数据
   * @param {Object} alert - 告警数据
   */
  async storeAlert(alert) {
    if (!this.storageConfig.enabled || !cacheManager.isConnected) {
      return false;
    }

    const timestamp = new Date().toISOString();
    const data = {
      ...alert,
      timestamp,
      ttl: this.calculateTTL()
    };

    // 添加到缓冲区
    this.alertsBuffer.push(data);

    // 告警数据立即存储
    await this.flushAlerts();

    return true;
  }

  /**
   * 获取历史指标数据
   * @param {string} type - 指标类型
   * @param {number} hours - 时间范围（小时）
   * @returns {Array} 历史数据
   */
  async getMetricsHistory(type, hours = 24) {
    if (!cacheManager.isConnected) {
      return [];
    }

    try {
      const cutoff = new Date(Date.now() - (hours * 60 * 60 * 1000));
      const pattern = `metrics:${type}:*`;
      const keys = await cacheManager.client.keys(pattern);
      
      const results = [];
      for (const key of keys) {
        const data = await cacheManager.get(key);
        if (data && new Date(data.timestamp) > cutoff) {
          results.push(data);
        }
      }

      // 按时间排序
      return results.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    } catch (error) {
      console.error('[监控存储] 获取历史指标失败:', error);
      return [];
    }
  }

  /**
   * 获取历史告警数据
   * @param {number} hours - 时间范围（小时）
   * @returns {Array} 历史告警
   */
  async getAlertsHistory(hours = 24) {
    if (!cacheManager.isConnected) {
      return [];
    }

    try {
      const cutoff = new Date(Date.now() - (hours * 60 * 60 * 1000));
      const pattern = 'alerts:*';
      const keys = await cacheManager.client.keys(pattern);
      
      const results = [];
      for (const key of keys) {
        const data = await cacheManager.get(key);
        if (data && new Date(data.timestamp) > cutoff) {
          results.push(data);
        }
      }

      // 按时间排序
      return results.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    } catch (error) {
      console.error('[监控存储] 获取历史告警失败:', error);
      return [];
    }
  }

  /**
   * 获取系统概览数据
   * @param {number} hours - 时间范围（小时）
   * @returns {Object} 概览数据
   */
  async getSystemOverview(hours = 1) {
    if (!cacheManager.isConnected) {
      return null;
    }

    try {
      const [systemMetrics, applicationMetrics, businessMetrics] = await Promise.all([
        this.getMetricsHistory('system', hours),
        this.getMetricsHistory('application', hours),
        this.getMetricsHistory('business', hours)
      ]);

      return {
        system: this.aggregateMetrics(systemMetrics),
        application: this.aggregateMetrics(applicationMetrics),
        business: this.aggregateMetrics(businessMetrics),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('[监控存储] 获取系统概览失败:', error);
      return null;
    }
  }

  /**
   * 清理过期数据
   */
  async cleanupExpiredData() {
    if (!cacheManager.isConnected) {
      return false;
    }

    try {
      console.log('[监控存储] 开始清理过期数据...');
      
      const cutoff = new Date(Date.now() - (this.storageConfig.retentionDays * 24 * 60 * 60 * 1000));
      const patterns = ['metrics:*', 'alerts:*'];
      let totalCleaned = 0;
      
      for (const pattern of patterns) {
        const keys = await cacheManager.client.keys(pattern);
        const expiredKeys = [];
        
        // 如果键数量超过限制，直接清理最旧的
        const limit = pattern === 'metrics:*' ? 
          parseInt(process.env.CACHE_METRICS_LIMIT) || 100 :
          parseInt(process.env.CACHE_ALERTS_LIMIT) || 50;
          
        if (keys.length > limit) {
          // 按时间戳排序，删除最旧的
          const sortedKeys = keys.sort();
          const keysToDelete = sortedKeys.slice(0, keys.length - limit);
          if (keysToDelete.length > 0) {
            await cacheManager.client.del(keysToDelete);
            totalCleaned += keysToDelete.length;
            console.log(`[监控存储] 清理了 ${keysToDelete.length} 个${pattern}数据（超过限制）`);
          }
        } else {
          // 按时间戳清理过期数据
          for (const key of keys) {
            try {
              const data = await cacheManager.get(key);
              if (data && data.timestamp && new Date(data.timestamp) < cutoff) {
                expiredKeys.push(key);
              }
            } catch (error) {
              // 如果获取数据失败，也标记为过期
              expiredKeys.push(key);
            }
          }
          
          if (expiredKeys.length > 0) {
            await cacheManager.client.del(expiredKeys);
            totalCleaned += expiredKeys.length;
            console.log(`[监控存储] 清理了 ${expiredKeys.length} 个过期${pattern}数据`);
          }
        }
      }

      console.log(`[监控存储] 清理完成，共清理了 ${totalCleaned} 个键`);
      return true;
    } catch (error) {
      console.error('[监控存储] 清理过期数据失败:', error);
      return false;
    }
  }

  /**
   * 启动定期刷新
   */
  startPeriodicFlush() {
    setInterval(async () => {
      if (!this.isFlushing) {
        await this.flushAll();
      }
    }, this.storageConfig.flushInterval);
  }

  /**
   * 启动定期清理
   */
  startPeriodicCleanup() {
    const cleanupInterval = parseInt(process.env.CACHE_CLEANUP_INTERVAL) || 300000; // 默认5分钟
    
    setInterval(async () => {
      try {
        await this.cleanupExpiredData();
      } catch (error) {
        console.error('[监控存储] 定期清理失败:', error);
      }
    }, cleanupInterval);
    
    console.log(`[监控存储] 定期清理已启动，间隔: ${cleanupInterval}ms`);
  }

  /**
   * 刷新所有缓冲区数据
   */
  async flushAll() {
    await Promise.all([
      this.flushMetrics(),
      this.flushAlerts()
    ]);
  }

  /**
   * 刷新指标数据
   */
  async flushMetrics() {
    if (this.isFlushing || this.metricsBuffer.length === 0) {
      return;
    }

    this.isFlushing = true;

    try {
      const batch = this.metricsBuffer.splice(0, this.storageConfig.batchSize);
      
      for (const item of batch) {
        const key = `metrics:${item.type}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
        await cacheManager.set(key, item, item.ttl);
      }

      console.log(`[监控存储] 刷新了 ${batch.length} 个指标数据`);
    } catch (error) {
      console.error('[监控存储] 刷新指标数据失败:', error);
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * 刷新告警数据
   */
  async flushAlerts() {
    if (this.alertsBuffer.length === 0) {
      return;
    }

    try {
      const batch = this.alertsBuffer.splice(0, this.storageConfig.batchSize);
      
      for (const item of batch) {
        const key = `alerts:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
        await cacheManager.set(key, item, item.ttl);
      }

      console.log(`[监控存储] 刷新了 ${batch.length} 个告警数据`);
    } catch (error) {
      console.error('[监控存储] 刷新告警数据失败:', error);
    }
  }

  /**
   * 聚合指标数据
   * @param {Array} metrics - 指标数据数组
   * @returns {Object} 聚合后的数据
   */
  aggregateMetrics(metrics) {
    if (metrics.length === 0) {
      return {};
    }

    const latest = metrics[metrics.length - 1];
    const first = metrics[0];
    
    // 计算平均值
    const averages = {};
    const keys = Object.keys(latest.data || {});
    
    for (const key of keys) {
      if (typeof latest.data[key] === 'number') {
        const values = metrics.map(m => m.data[key]).filter(v => typeof v === 'number');
        if (values.length > 0) {
          averages[key] = Math.round(values.reduce((sum, val) => sum + val, 0) / values.length);
        }
      }
    }

    return {
      latest: latest.data,
      averages,
      count: metrics.length,
      timeRange: {
        start: first.timestamp,
        end: latest.timestamp
      }
    };
  }

  /**
   * 计算TTL
   * @returns {number} TTL秒数
   */
  calculateTTL() {
    return this.storageConfig.retentionDays * 24 * 60 * 60; // 转换为秒
  }

  /**
   * 获取存储统计信息
   * @returns {Object} 统计信息
   */
  async getStorageStats() {
    if (!cacheManager.isConnected) {
      return null;
    }

    try {
      const [metricsKeys, alertsKeys] = await Promise.all([
        cacheManager.client.keys('metrics:*'),
        cacheManager.client.keys('alerts:*')
      ]);

      return {
        enabled: this.storageConfig.enabled,
        metricsCount: metricsKeys.length,
        alertsCount: alertsKeys.length,
        bufferSize: {
          metrics: this.metricsBuffer.length,
          alerts: this.alertsBuffer.length
        },
        retentionDays: this.storageConfig.retentionDays
      };
    } catch (error) {
      console.error('[监控存储] 获取存储统计失败:', error);
      return null;
    }
  }
}

// 创建全局实例
const monitoringStorage = new MonitoringStorage();

// 启动定期清理任务
if (process.env.AUTO_CACHE_CLEANUP === 'true') {
  monitoringStorage.startPeriodicCleanup();
}

module.exports = {
  MonitoringStorage,
  monitoringStorage
};
