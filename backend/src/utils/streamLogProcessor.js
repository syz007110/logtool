const fs = require('fs');
const readline = require('readline');
const dayjs = require('dayjs');
const { translatePerLine } = require('./decryptUtils');
const { renderEntryExplanation, ensureCacheReady } = require('../services/logParsingService');
const errorCodeCache = require('../services/errorCodeCache');
const { getClickHouseClient } = require('../config/clickhouse');

/**
 * 流式日志处理器
 * 解决大文件处理时的内存和锁等待超时问题
 */
class StreamLogProcessor {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 1000; // ClickHouse 建议更大的批次
    this.progressCallback = options.progressCallback || (() => {});
    this.errorCallback = options.errorCallback || (() => {});
  }

  /**
   * 流式处理日志文件
   * @param {string} filePath - 日志文件路径
   * @param {string} key - 解密密钥
   * @param {number} logId - 日志ID
   * @param {number} version - 日志版本号
   * @param {Object} options - 处理选项
   * @returns {Promise<Object>} 处理结果
   */
  async processLogFile(filePath, key, logId, version, options = {}) {
    console.log(`🚀 开始流式处理日志文件: ${filePath} (Version: ${version})`);
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

      // ClickHouse 不需要清空旧条目，通过 Version 区分
      
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
          const entry = await this.processLogLine(line, key, logId, version, processedLines);
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
          await this.flushBatch(currentBatch);
          totalEntries.push(...currentBatch);
          currentBatch = [];
          
          // 更新进度
          const progress = Math.round((processedLines / totalLines) * 100);
          this.progressCallback(progress, processedLines, totalLines);
        }
      }

      // 处理剩余的批次
      if (currentBatch.length > 0) {
        await this.flushBatch(currentBatch);
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
   * @param {number} version - 日志版本
   * @param {number} rowIndex - 行号
   * @returns {Promise<Object|null>} 处理后的日志条目
   */
  async processLogLine(line, key, logId, version, rowIndex) {
    try {
      // 解析单行日志
      const entry = translatePerLine(line, key);
      
      // 查询故障码释义
      const errorCodeStr = entry.error_code;
      let subsystem = '';
      let code = '';
      
      if (errorCodeStr && errorCodeStr.length >= 5) {
        subsystem = errorCodeStr.charAt(0).toUpperCase(); // 统一转换为大写，确保与查询时匹配
        // 仅当首字符是 1-9, A-F 时才认为是有效子系统，这里简化处理
        if (!/^[1-9A-F]$/.test(subsystem)) {
           subsystem = '';
        }
        code = '0X' + errorCodeStr.slice(-4).toUpperCase(); // 统一转换为大写，确保与查询时匹配
      }
      
      // 重新计算 subsystem_char 和 code4 (Node.js 端计算)
      const subsystemChar = subsystem || '';
      const code4 = code || '';

      let explanation = entry.explanation;
      if (subsystem && code) {
        const errorCodeRecord = errorCodeCache.findErrorCode(subsystem, code);
        if (errorCodeRecord && errorCodeRecord.explanation) {
          explanation = errorCodeRecord.explanation;
        }
      }
      
      const { explanation: parsedExplanation } = renderEntryExplanation(entry);
      
      // 格式化时间戳：如果已经是字符串格式 YYYY-MM-DD HH:mm:ss，直接使用；否则格式化为无时区格式
      let timestampStr;
      if (typeof entry.timestamp === 'string' && /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(entry.timestamp)) {
        timestampStr = entry.timestamp;
      } else if (entry.timestamp instanceof Date) {
        // Date 对象：使用 dayjs 格式化，但不进行时区转换（保持原始时间值）
        timestampStr = dayjs(entry.timestamp).format('YYYY-MM-DD HH:mm:ss');
      } else {
        // 其他格式：尝试解析并格式化
        const parsed = dayjs(entry.timestamp);
        timestampStr = parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : dayjs().format('YYYY-MM-DD HH:mm:ss');
      }

      return {
        log_id: logId,
        timestamp: timestampStr,
        error_code: entry.error_code || '',
        param1: entry.param1 || '',
        param2: entry.param2 || '',
        param3: entry.param3 || '',
        param4: entry.param4 || '',
        explanation: parsedExplanation || '',
        subsystem_char: subsystemChar,
        code4: code4,
        version: version,
        row_index: rowIndex
      };
      
    } catch (error) {
      console.warn(`处理日志行失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 刷新批次到数据库 (ClickHouse)
   * @param {Array} batch - 批次数据
   */
  async flushBatch(batch) {
    if (batch.length === 0) return;
    
    try {
      await getClickHouseClient().insert({
        table: 'log_entries',
        values: batch,
        format: 'JSONEachRow'
      });
      
      // console.log(`✅ 批次插入 ClickHouse 成功: ${batch.length} 条记录`);
      
    } catch (error) {
      console.error(`❌ 批次插入 ClickHouse 失败: ${error.message}`);
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
}

// 创建默认实例
const streamBatchSize = parseInt(process.env.STREAM_BATCH_SIZE, 10);
const streamLogProcessor = new StreamLogProcessor({
  batchSize: Number.isFinite(streamBatchSize) ? streamBatchSize : 10000 // ClickHouse 批量大一点更好
});

module.exports = {
  StreamLogProcessor,
  streamLogProcessor
};