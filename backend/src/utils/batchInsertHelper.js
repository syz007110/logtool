const { sequelize } = require('../models');

/**
 * 批量插入助手工具
 * 解决大量数据插入时的锁等待超时问题
 */
class BatchInsertHelper {
  constructor(options = {}) {
    // 每批插入数量（默认较小，避免单批事务过大）
    this.batchSize = options.batchSize || 300;
    this.maxRetries = options.maxRetries || 3; // 最大重试次数
    this.retryDelay = options.retryDelay || 1000; // 重试延迟（毫秒）
    this.lockTimeout = options.lockTimeout || 60000; // 锁等待超时（毫秒）
  }

  /**
   * 分批批量插入数据
   * @param {Object} Model - Sequelize 模型
   * @param {Array} data - 要插入的数据数组
   * @param {Object} options - 插入选项
   * @returns {Promise<Array>} 插入结果
   */
  async batchInsert(Model, data, options = {}) {
    const t0 = Date.now();
    if (!Array.isArray(data) || data.length === 0) {
      console.log('📝 没有数据需要插入');
      return [];
    }

    console.log(`🚀 开始分批插入 ${data.length} 条记录，每批 ${this.batchSize} 条`);

    const results = [];
    const batches = this.createBatches(data, this.batchSize);
    
    console.log(`📊 分为 ${batches.length} 批进行插入`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchNumber = i + 1;
      
      console.log(`🔄 插入第 ${batchNumber}/${batches.length} 批，${batch.length} 条记录`);
      
      try {
        const batchResult = await this.insertWithRetry(Model, batch, options);
        results.push(...batchResult);
        
        // 批次间短暂延迟，减少锁竞争
        if (i < batches.length - 1) {
          await this.delay(100);
        }
        
      } catch (error) {
        console.error(`❌ 第 ${batchNumber} 批插入失败:`, error.message);
        throw error;
      }
    }

    console.log(`✅ 分批插入完成，总共插入 ${results.length} 条记录，耗时: ${Date.now() - t0}ms`);
    return results;
  }

  /**
   * 创建批次
   * @param {Array} data - 原始数据
   * @param {number} batchSize - 批次大小
   * @returns {Array} 批次数组
   */
  createBatches(data, batchSize) {
    const batches = [];
    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * 带重试的插入操作
   * @param {Object} Model - Sequelize 模型
   * @param {Array} batch - 批次数据
   * @param {Object} options - 插入选项
   * @returns {Promise<Array>} 插入结果
   */
  async insertWithRetry(Model, batch, options = {}) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // 使用事务确保数据一致性
        const result = await sequelize.transaction(async (transaction) => {
          const insertOptions = {
            ...options,
            transaction,
            validate: false, // 跳过验证以提高性能
            ignoreDuplicates: true, // 忽略重复数据
            returning: true
          };
          
          return await Model.bulkCreate(batch, insertOptions);
        });
        
        if (attempt > 1) {
          console.log(`✅ 第 ${attempt} 次重试成功`);
        }
        
        return result;
        
      } catch (error) {
        lastError = error;
        
        // 检查是否是锁等待超时错误
        if (this.isLockTimeoutError(error)) {
          console.warn(`⚠️ 第 ${attempt} 次尝试失败（锁等待超时），${attempt < this.maxRetries ? '准备重试' : '达到最大重试次数'}`);
          
          if (attempt < this.maxRetries) {
            // 指数退避延迟
            const delay = this.retryDelay * Math.pow(2, attempt - 1);
            console.log(`⏳ 等待 ${delay}ms 后重试...`);
            await this.delay(delay);
          }
        } else {
          // 非锁超时错误，直接抛出
          throw error;
        }
      }
    }
    
    throw lastError;
  }

  /**
   * 检查是否是锁等待超时错误
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否是锁超时错误
   */
  isLockTimeoutError(error) {
    if (!error || !error.message) return false;
    
    const message = error.message.toLowerCase();
    return message.includes('lock wait timeout') || 
           message.includes('deadlock') ||
           message.includes('lock timeout') ||
           (error.name === 'SequelizeDatabaseError' && 
            error.parent && 
            error.parent.code === 'ER_LOCK_WAIT_TIMEOUT');
  }

  /**
   * 延迟函数
   * @param {number} ms - 延迟毫秒数
   * @returns {Promise} Promise
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 优化的批量插入方法（针对日志条目）
   * @param {Array} entries - 日志条目数组
   * @param {number} logId - 日志ID
   * @returns {Promise<Array>} 插入结果
   */
  async batchInsertLogEntries(entries, logId) {
    console.log(`📝 开始处理日志条目，日志ID: ${logId}，条目数: ${entries.length}`);
    
    const startTime = Date.now();
    
    try {
      // const LogEntry = require('../models/log_entry');
      // [MIGRATION] LogEntry migrated to ClickHouse.
      console.warn('[MIGRATION] batchInsertLogEntries called but LogEntry model is removed.');
      return [];
      
      if (entries.length === 0) {
        console.log('📝 没有新数据需要处理');
        return [];
      }
      
      // 使用 upsert 策略：先尝试更新，不存在则插入
      // 这样可以避免删除操作导致的锁等待超时
      console.log('🔄 使用 upsert 策略处理日志条目...');
      
      const results = [];
      // 使用环境变量配置批次大小，默认500
      const batchSize = parseInt(process.env.STREAM_INSERT_BATCH_SIZE) || 500;
      
      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);
        console.log(`🔄 处理批次 ${Math.floor(i/batchSize) + 1}/${Math.ceil(entries.length/batchSize)}，${batch.length} 条记录`);
        
        // 使用 bulkCreate 的 updateOnDuplicate 选项
        const batchResults = await LogEntry.bulkCreate(batch, {
          updateOnDuplicate: ['timestamp', 'error_code', 'param1', 'param2', 'param3', 'param4', 'explanation'],
          individualHooks: false,
          validate: false
        });
        
        results.push(...batchResults);
        
        // 批次间短暂延迟，减少锁竞争
        if (i + batchSize < entries.length) {
          await this.delay(50);
        }
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`✅ 日志条目处理完成，耗时: ${duration}ms，处理: ${results.length} 条`);
      
      return results;
      
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.error(`❌ 日志条目处理失败，耗时: ${duration}ms，错误:`, error.message);
      throw error;
    }
  }
}

// 创建默认实例（允许通过环境变量调整批大小）
const envInsertBatchSize = parseInt(process.env.STREAM_INSERT_BATCH_SIZE, 10);
const batchInsertHelper = new BatchInsertHelper({
  batchSize: Number.isFinite(envInsertBatchSize) ? envInsertBatchSize : 300,
  maxRetries: 3,   // 最多重试3次
  retryDelay: 1000 // 重试延迟1秒
});

module.exports = {
  BatchInsertHelper,
  batchInsertHelper
};
