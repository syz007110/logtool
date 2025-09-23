const errorCodeCache = require('./errorCodeCache');

/**
 * 缓存初始化服务
 * 在应用启动时预加载常用缓存
 */
class CacheInitializer {
  constructor() {
    this.isInitialized = false;
    this.initializationPromise = null;
  }

  /**
   * 初始化所有缓存
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._doInitialize();
    return this.initializationPromise;
  }

  async _doInitialize() {
    try {
      console.log('🚀 开始初始化缓存...');
      const startTime = Date.now();

      // 预加载故障码表
      await errorCodeCache.loadAllErrorCodes();

      const endTime = Date.now();
      const duration = endTime - startTime;
      
      this.isInitialized = true;
      console.log(`✅ 缓存初始化完成，耗时: ${duration}ms`);
      
      // 输出缓存统计信息
      const stats = errorCodeCache.getCacheStats();
      console.log(`📊 缓存统计: 故障码 ${stats.cacheSize} 条`);
      
    } catch (error) {
      console.error('❌ 缓存初始化失败:', error);
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * 获取初始化状态
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      isInitializing: !!this.initializationPromise && !this.isInitialized
    };
  }
}

// 创建全局单例实例
const cacheInitializer = new CacheInitializer();

module.exports = cacheInitializer;
