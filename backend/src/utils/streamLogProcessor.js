const fs = require('fs');
const readline = require('readline');
const { decryptLogContent, translatePerLine } = require('./decryptUtils');
const { renderEntryExplanation, ensureCacheReady } = require('../services/logParsingService');
const LogEntry = require('../models/log_entry');
const errorCodeCache = require('../services/errorCodeCache');
const { batchInsertHelper } = require('./batchInsertHelper');

/**
 * 流式日志处理器
 * 解决大文件处理时的内存和锁等待超时问题
 */
class StreamLogProcessor {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 500; // 每批处理行数
    this.insertBatchSize = options.insertBatchSize || 200; // 每批插入数量
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.progressCallback = options.progressCallback || (() => {});
    this.errorCallback = options.errorCallback || (() => {});
  }

  /**
   * 流式处理日志文件
   * @param {string} filePath - 日志文件路径
   * @param {string} key - 解密密钥
   * @param {number} logId - 日志ID
   * @param {Object} options - 处理选项
   * @returns {Promise<Object>} 处理结果
   */
  async processLogFile(filePath, key, logId, options = {}) {
    console.log(`🚀 开始流式处理日志文件: ${filePath}`);
    const startTime = Date.now();
    
    let totalLines = 0;
    let processedLines = 0;
    let successLines = 0;
    let errorLines = 0;
    let currentBatch = [];
    let totalEntries = [];
    let allProcessedEntries = []; // 存储所有处理过的条目

    try {
      // 预加载解析依赖
      await ensureCacheReady();
      console.log('✅ 解析依赖已预加载');

      // 先清空旧的日志条目
      console.log('🗑️ 清空旧的日志条目...');
      await LogEntry.destroy({ where: { log_id: logId }, force: true });

      // 统计总行数（用于进度显示）
      totalLines = await this.countLines(filePath);
      console.log(`📊 文件总行数: ${totalLines}`);

      // 创建流式读取器
      const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity // 处理Windows和Unix换行符差异
      });

      // 逐行处理
      for await (const line of rl) {
        if (!line.trim()) continue; // 跳过空行
        
        processedLines++;
        
        try {
          // 解析单行日志
          const entry = await this.processLogLine(line, key, logId);
          if (entry) {
            currentBatch.push(entry);
            allProcessedEntries.push(entry); // 保存到总列表中
            successLines++;
          }
        } catch (error) {
          errorLines++;
          console.warn(`⚠️ 第 ${processedLines} 行处理失败: ${error.message}`);
          this.errorCallback(error, processedLines);
        }

        // 达到批次大小时，批量插入数据库
        if (currentBatch.length >= this.batchSize) {
          await this.flushBatch(currentBatch, logId);
          totalEntries.push(...currentBatch);
          currentBatch = [];
          
          // 更新进度
          const progress = Math.round((processedLines / totalLines) * 100);
          this.progressCallback(progress, processedLines, totalLines);
          
          // 批次间短暂延迟，减少锁竞争
          await this.delay(50);
        }
      }

      // 处理剩余的批次
      if (currentBatch.length > 0) {
        await this.flushBatch(currentBatch, logId);
        totalEntries.push(...currentBatch);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      const result = {
        totalLines,
        processedLines,
        successLines,
        errorLines,
        totalEntries: totalEntries.length,
        allProcessedEntries, // 返回所有处理过的条目
        duration,
        success: errorLines === 0 || errorLines < totalLines * 0.1 // 错误率小于10%认为成功
      };

      console.log(`✅ 流式处理完成:`);
      console.log(`   📊 总行数: ${result.totalLines}`);
      console.log(`   ✅ 成功处理: ${result.successLines}`);
      console.log(`   ❌ 处理失败: ${result.errorLines}`);
      console.log(`   📝 插入条目: ${result.totalEntries}`);
      console.log(`   ⏱️ 总耗时: ${result.duration}ms`);
      console.log(`   📈 处理速度: ${Math.round(result.processedLines / (result.duration / 1000))} 行/秒`);

      return result;

    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.error(`❌ 流式处理失败，耗时: ${duration}ms，错误:`, error.message);
      throw error;
    }
  }

  /**
   * 处理单行日志
   * @param {string} line - 日志行
   * @param {string} key - 解密密钥
   * @param {number} logId - 日志ID
   * @returns {Promise<Object|null>} 处理后的日志条目
   */
  async processLogLine(line, key, logId) {
    try {
      // 解析单行日志
      const entry = translatePerLine(line, key);
      
      // 查询故障码释义
      const errorCodeStr = entry.error_code;
      let subsystem = '';
      let code = '';
      
      if (errorCodeStr && errorCodeStr.length >= 5) {
        subsystem = errorCodeStr.charAt(0);
        code = '0X' + errorCodeStr.slice(-4);
      }
      
      let explanation = entry.explanation;
      if (subsystem && code) {
        const errorCodeRecord = errorCodeCache.findErrorCode(subsystem, code);
        if (errorCodeRecord && errorCodeRecord.explanation) {
          explanation = errorCodeRecord.explanation;
        }
      }
      
      const { explanation: parsedExplanation } = renderEntryExplanation(entry);
      
      return {
        log_id: logId,
        timestamp: entry.timestamp,
        error_code: entry.error_code,
        param1: entry.param1,
        param2: entry.param2,
        param3: entry.param3,
        param4: entry.param4,
        explanation: parsedExplanation
      };
      
    } catch (error) {
      console.warn(`处理日志行失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 刷新批次到数据库
   * @param {Array} batch - 批次数据
   * @param {number} logId - 日志ID
   */
  async flushBatch(batch, logId) {
    if (batch.length === 0) return;
    
    try {
      // 使用优化的批量插入
      await batchInsertHelper.batchInsert(
        LogEntry, 
        batch, 
        {
          validate: false,
          ignoreDuplicates: true,
          individualHooks: false
        }
      );
      
      console.log(`✅ 批次插入成功: ${batch.length} 条记录`);
      
    } catch (error) {
      console.error(`❌ 批次插入失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 统计文件行数
   * @param {string} filePath - 文件路径
   * @returns {Promise<number>} 行数
   */
  async countLines(filePath) {
    return new Promise((resolve, reject) => {
      let lines = 0;
      const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      rl.on('line', () => lines++);
      rl.on('close', () => resolve(lines));
      rl.on('error', reject);
    });
  }

  /**
   * 延迟函数
   * @param {number} ms - 延迟毫秒数
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 创建默认实例（读取环境变量）
const streamBatchSize = parseInt(process.env.STREAM_BATCH_SIZE, 10);
const streamInsertBatchSize = parseInt(process.env.STREAM_INSERT_BATCH_SIZE, 10);
const streamLogProcessor = new StreamLogProcessor({
  batchSize: Number.isFinite(streamBatchSize) ? streamBatchSize : 500,
  insertBatchSize: Number.isFinite(streamInsertBatchSize) ? streamInsertBatchSize : 200
});

module.exports = {
  StreamLogProcessor,
  streamLogProcessor
};
