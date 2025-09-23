const ErrorCode = require('../models/error_code');

/**
 * 故障码缓存服务
 * 预加载所有故障码到内存中，避免重复数据库查询
 */
class ErrorCodeCache {
  constructor() {
    this.cache = new Map();
    this.isLoaded = false;
    this.loadPromise = null;
  }

  /**
   * 预加载所有故障码到内存
   */
  async loadAllErrorCodes() {
    if (this.isLoaded) {
      return this.cache;
    }

    // 如果正在加载，返回同一个Promise
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = this._doLoad();
    return this.loadPromise;
  }

  async _doLoad() {
    try {
      console.log('🔄 开始预加载故障码表...');
      const startTime = Date.now();
      
      const errorCodes = await ErrorCode.findAll({
        attributes: ['id', 'subsystem', 'code', 'explanation', 'short_message', 'short_message_en']
      });

      console.log(`📊 加载了 ${errorCodes.length} 个故障码记录`);
      
      // 构建缓存映射表
      this.cache.clear();
      errorCodes.forEach(code => {
        const key = `${code.subsystem}-${code.code}`;
        this.cache.set(key, {
          id: code.id,
          subsystem: code.subsystem,
          code: code.code,
          explanation: code.explanation,
          short_message: code.short_message,
          short_message_en: code.short_message_en
        });
      });

      this.isLoaded = true;
      const loadTime = Date.now() - startTime;
      console.log(`✅ 故障码表预加载完成，耗时: ${loadTime}ms`);
      
      return this.cache;
    } catch (error) {
      console.error('❌ 故障码表预加载失败:', error);
      this.loadPromise = null;
      throw error;
    }
  }

  /**
   * 根据子系统和故障码查找故障码记录
   * @param {string} subsystem - 子系统
   * @param {string} code - 故障码
   * @returns {Object|null} 故障码记录或null
   */
  findErrorCode(subsystem, code) {
    if (!this.isLoaded) {
      console.warn('⚠️ 故障码表未加载，请先调用 loadAllErrorCodes()');
      return null;
    }

    if (!subsystem || !code) {
      return null;
    }

    const key = `${subsystem}-${code}`;
    return this.cache.get(key) || null;
  }

  /**
   * 批量查找故障码记录
   * @param {Array} codes - 故障码数组，格式: [{subsystem, code}, ...]
   * @returns {Array} 找到的故障码记录数组
   */
  findErrorCodesBatch(codes) {
    if (!this.isLoaded) {
      console.warn('⚠️ 故障码表未加载，请先调用 loadAllErrorCodes()');
      return [];
    }

    const results = [];
    for (const { subsystem, code } of codes) {
      if (subsystem && code) {
        const key = `${subsystem}-${code}`;
        const record = this.cache.get(key);
        if (record) {
          results.push(record);
        }
      }
    }
    return results;
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats() {
    return {
      isLoaded: this.isLoaded,
      cacheSize: this.cache.size,
      memoryUsage: process.memoryUsage()
    };
  }

  /**
   * 清空缓存（用于测试或重新加载）
   */
  clearCache() {
    this.cache.clear();
    this.isLoaded = false;
    this.loadPromise = null;
    console.log('🗑️ 故障码缓存已清空');
  }

  /**
   * 重新加载缓存
   */
  async reloadCache() {
    this.clearCache();
    return this.loadAllErrorCodes();
  }
}

// 创建全局单例实例
const errorCodeCache = new ErrorCodeCache();

module.exports = errorCodeCache;
