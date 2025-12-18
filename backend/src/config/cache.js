const redis = require('redis');

class CacheManager {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || '',
      db: parseInt(process.env.REDIS_DB) || 0,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: 3
    };
    
    this.cacheConfig = {
      enabled: process.env.CACHE_ENABLED === 'true',
      defaultTTL: parseInt(process.env.CACHE_TTL_SECONDS) || 300, // 5分钟
      maxKeys: parseInt(process.env.CACHE_MAX_KEYS) || 1000,
      searchCacheTTL: parseInt(process.env.SEARCH_CACHE_TTL_SECONDS) || 180 // 3分钟
    };
  }

  async connect() {
    if (!this.cacheConfig.enabled) {
      console.log('缓存功能已禁用');
      return false;
    }

    try {
      const url = process.env.REDIS_URL || `redis://${this.config.host}:${this.config.port}`;
      this.client = redis.createClient({
        url,
        password: this.config.password || undefined,
        database: this.config.db
      });
      
      this.client.on('error', (err) => {
        console.error('Redis连接错误:', err);
        this.isConnected = false;
      });
      
      this.client.on('connect', () => {
        console.log('Redis连接成功');
        this.isConnected = true;
      });
      
      this.client.on('ready', () => {
        console.log('Redis准备就绪');
        this.isConnected = true;
      });
      
      this.client.on('end', () => {
        console.log('Redis连接断开');
        this.isConnected = false;
      });

      await this.client.connect();
      return true;
    } catch (error) {
      console.error('Redis连接失败:', error);
      this.isConnected = false;
      return false;
    }
  }

  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
    }
  }

  // 生成缓存键
  generateKey(prefix, params) {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join('|');
    return `${prefix}:${sortedParams}`;
  }

  // 设置缓存
  async set(key, value, ttl = this.cacheConfig.defaultTTL) {
    if (!this.isConnected || !this.cacheConfig.enabled) {
      return false;
    }

    try {
      const serializedValue = JSON.stringify(value);
      await this.client.setEx(key, ttl, serializedValue);
      return true;
    } catch (error) {
      console.error('设置缓存失败:', error);
      return false;
    }
  }

  // 获取缓存
  async get(key) {
    if (!this.isConnected || !this.cacheConfig.enabled) {
      return null;
    }

    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('获取缓存失败:', error);
      return null;
    }
  }

  // 删除缓存
  async del(key) {
    if (!this.isConnected || !this.cacheConfig.enabled) {
      return false;
    }

    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error('删除缓存失败:', error);
      return false;
    }
  }

  // 批量删除缓存
  async delPattern(pattern) {
    if (!this.isConnected || !this.cacheConfig.enabled) {
      return false;
    }

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      return true;
    } catch (error) {
      console.error('批量删除缓存失败:', error);
      return false;
    }
  }

  // 检查缓存是否存在
  async exists(key) {
    if (!this.isConnected || !this.cacheConfig.enabled) {
      return false;
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error('检查缓存存在性失败:', error);
      return false;
    }
  }

  // 设置缓存过期时间
  async expire(key, ttl) {
    if (!this.isConnected || !this.cacheConfig.enabled) {
      return false;
    }

    try {
      await this.client.expire(key, ttl);
      return true;
    } catch (error) {
      console.error('设置缓存过期时间失败:', error);
      return false;
    }
  }

  // 获取缓存统计信息
  async getStats() {
    if (!this.isConnected || !this.cacheConfig.enabled) {
      return null;
    }

    try {
      const info = await this.client.info('memory');
      const keys = await this.client.dbSize();
      
      return {
        connected: this.isConnected,
        keys,
        memory: info
      };
    } catch (error) {
      console.error('获取缓存统计信息失败:', error);
      return null;
    }
  }

  // 清理过期缓存
  async cleanup() {
    if (!this.isConnected || !this.cacheConfig.enabled) {
      return false;
    }

    try {
      console.log('[缓存管理器] 开始清理缓存...');
      
      // 清理监控数据
      const metricsKeys = await this.client.keys('metrics:*');
      const alertsKeys = await this.client.keys('alerts:*');
      const cacheKeys = await this.client.keys('cache:*');
      
      let cleanedCount = 0;
      
      // 清理监控数据（超过限制数量）
      const metricsLimit = parseInt(process.env.CACHE_METRICS_LIMIT) || 100;
      if (metricsKeys.length > metricsLimit) {
        const keysToDelete = metricsKeys.slice(0, metricsKeys.length - metricsLimit);
        if (keysToDelete.length > 0) {
          await this.client.del(keysToDelete);
          cleanedCount += keysToDelete.length;
          console.log(`[缓存管理器] 清理了 ${keysToDelete.length} 个监控数据`);
        }
      }
      
      // 清理告警数据（超过限制数量）
      const alertsLimit = parseInt(process.env.CACHE_ALERTS_LIMIT) || 50;
      if (alertsKeys.length > alertsLimit) {
        const keysToDelete = alertsKeys.slice(0, alertsKeys.length - alertsLimit);
        if (keysToDelete.length > 0) {
          await this.client.del(keysToDelete);
          cleanedCount += keysToDelete.length;
          console.log(`[缓存管理器] 清理了 ${keysToDelete.length} 个告警数据`);
        }
      }
      
      // 清理搜索缓存（超过限制数量）
      const searchLimit = parseInt(process.env.CACHE_SEARCH_LIMIT) || 200;
      if (cacheKeys.length > searchLimit) {
        const keysToDelete = cacheKeys.slice(0, cacheKeys.length - searchLimit);
        if (keysToDelete.length > 0) {
          await this.client.del(keysToDelete);
          cleanedCount += keysToDelete.length;
          console.log(`[缓存管理器] 清理了 ${keysToDelete.length} 个搜索缓存`);
        }
      }
      
      console.log(`[缓存管理器] 清理完成，共清理了 ${cleanedCount} 个键`);
      return true;
    } catch (error) {
      console.error('[缓存管理器] 清理缓存失败:', error);
      return false;
    }
  }
}

// 创建全局缓存实例
const cacheManager = new CacheManager();

// 启动定期清理任务
if (process.env.AUTO_CACHE_CLEANUP === 'true') {
  const cleanupInterval = parseInt(process.env.CACHE_CLEANUP_INTERVAL) || 300000; // 默认5分钟
  
  setInterval(async () => {
    try {
      await cacheManager.cleanup();
    } catch (error) {
      console.error('[缓存管理器] 定期清理失败:', error);
    }
  }, cleanupInterval);
  
  console.log(`[缓存管理器] 定期清理已启动，间隔: ${cleanupInterval}ms`);
}

module.exports = {
  CacheManager,
  cacheManager
};
