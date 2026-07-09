const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const { decryptLogContent } = require('../utils/decryptUtils');
const { renderEntryExplanation, ensureCacheReady } = require('../services/logParsingService');
const Log = require('../models/log');
const ErrorCode = require('../models/error_code');
const Device = require('../models/device');
const errorCodeCache = require('../services/errorCodeCache');
const { streamLogProcessor } = require('../utils/streamLogProcessor');
const { getClickHouseClient } = require('../config/clickhouse');
const { evictOldVersionsFromClickHouse } = require('./batchProcessor');

// 上传目录
const UPLOAD_DIR = path.join(__dirname, '../../uploads/logs');

/**
 * 处理日志文件的工作函数
 * @param {Object} job - Bull队列任务对象
 */
async function processLogFile(job) {
  const { 
    filePath, 
    originalName, 
    decryptKey, 
    deviceId, 
    uploaderId, 
    logId 
  } = job.data;

  // 只记录关键信息
  console.log(`[日志处理] 开始处理: ${originalName} (ID: ${logId})`);
  
  // 验证文件路径
  if (!filePath) {
    throw new Error('文件路径为空，无法处理文件');
  }

  try {
    const deviceRecord = deviceId
      ? await Device.findOne({ where: { device_id: deviceId }, attributes: ['series_id'] })
      : null;
    const deviceSeriesId = deviceRecord?.series_id || null;

    // 更新任务进度
    await job.progress(10);

    // 获取当前日志版本（由上传阶段负责自增）
    const currentLog = await Log.findByPk(logId);
    const currentVersion = currentLog ? (currentLog.version || 1) : 1;
    console.log(`[日志处理] 当前日志版本: ${currentVersion}`);

    // 预加载故障码表/解析依赖
    console.log('🔄 预加载解析依赖...');
    await ensureCacheReady();
    console.log('✅ 解析依赖预加载完成');

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      console.warn(`文件不存在，跳过处理: ${filePath}`);
      // 更新日志状态为文件错误，但不抛出异常
      await Log.update(
        { status: 'file_error' },
        { where: { id: logId } }
      );
      console.log(`✅ 已更新日志状态为 'file_error'，跳过处理`);
      return; // 优雅退出，不抛出异常
    }

    // 读取文件内容
    const content = fs.readFileSync(filePath, 'utf-8');
    
    await job.progress(20);

    // 更新状态为解密中
    await Log.update(
      { status: 'decrypting' },
      { where: { id: logId } }
    );
    
    // 推送状态变化到 WebSocket
    try {
      const websocketService = require('../services/websocketService');
      websocketService.pushLogStatusChange(deviceId, logId, 'decrypting', 'uploading');
    } catch (wsError) {
      console.warn('WebSocket 状态推送失败:', wsError.message);
    }

    // 解密日志内容 - 只记录关键信息
    console.log(`[日志处理] 更换密钥，开始解密: ${originalName}`);
    const decryptedEntries = decryptLogContent(content, decryptKey);
    console.log(`[日志处理] 解密结果: ${decryptedEntries.length} 个日志条目`);

    await job.progress(50);

    // 如果解密失败（返回空数组），更新状态为解密失败并结束处理
    if (decryptedEntries.length === 0) {
      console.log(`[日志处理] 解密失败，更新状态为解密失败: ${originalName}`);
      await Log.update(
        { status: 'decrypt_failed' },
        { where: { id: logId } }
      );
      
      // 更新WebSocket状态
      try {
        const websocketService = require('../services/websocketService');
        websocketService.pushLogStatusChange(deviceId, logId, 'decrypt_failed', 'decrypting');
      } catch (wsError) {
        console.warn('WebSocket 状态推送失败:', wsError.message);
      }
      
      // 返回失败结果，但不抛出错误
      return {
        success: false,
        logId,
        entriesCount: 0,
        reason: '解密失败：无法解密文件内容'
      };
    }

    // 更新状态为解析中
    await Log.update(
      { status: 'parsing' },
      { where: { id: logId } }
    );
    
    // 推送状态变化到 WebSocket
    try {
      const websocketService = require('../services/websocketService');
      websocketService.pushLogStatusChange(deviceId, logId, 'parsing', 'decrypting');
    } catch (wsError) {
      console.warn('WebSocket 状态推送失败:', wsError.message);
    }

    // 选择处理方式：流式处理 vs 传统处理（支持 env 阈值）
    const largeThreshold = Number.isFinite(parseInt(process.env.STREAM_LARGE_FILE_THRESHOLD, 10))
      ? parseInt(process.env.STREAM_LARGE_FILE_THRESHOLD, 10)
      : 50000; // 提高阈值，因为 ClickHouse 批量写入性能很好
    const useStreamProcessing = process.env.USE_STREAM_PROCESSING === 'true' || 
                               decryptedEntries.length > largeThreshold;

    let entries = []; // 初始化entries变量，确保在两种模式下都可用

    if (useStreamProcessing) {
      console.log('🌊 使用流式处理模式（大文件或配置启用）');
      
      // 流式处理
      const t0 = Date.now();
      const result = await streamLogProcessor.processLogFile(filePath, decryptKey, logId, currentVersion, {
        seriesId: deviceSeriesId
      });
      console.log(`⏱️ 流式处理耗时: ${Date.now() - t0}ms`);
      
      if (!result.success) {
        throw new Error(`流式处理失败: 成功 ${result.successLines} 条，失败 ${result.errorLines} 条`);
      }
      
      // 使用流式处理返回的条目
      entries = result.allProcessedEntries || [];
      console.log(`✅ 流式处理完成，处理了 ${result.totalEntries} 条记录`);
      
    } else {
      console.log('📦 使用传统批量处理模式 (ClickHouse)');
      
      const t0 = Date.now();
      console.log(`🚀 开始处理 ${decryptedEntries.length} 个解密后的日志条目`);
    
      const chEntries = [];
      let rowIndex = 1;

      for (const entry of decryptedEntries) {
        const { explanation: parsedExplanation } = renderEntryExplanation({
          ...entry,
          series_id: deviceSeriesId
        });
        
        // 计算 subsystem_char 和 code4（统一转换为大写，确保与查询时匹配）
        const errorCodeStr = entry.error_code || '';
        let subsystem = '';
        let code = '';
        
        if (errorCodeStr && errorCodeStr.length >= 5) {
          subsystem = errorCodeStr.charAt(0).toUpperCase(); // 统一转换为大写
           if (!/^[1-9A-F]$/.test(subsystem)) {
               subsystem = '';
           }
          code = '0X' + errorCodeStr.slice(-4).toUpperCase(); // 统一转换为大写
        }

        // 格式化时间戳：如果已经是字符串格式 YYYY-MM-DD HH:mm:ss，直接使用；否则格式化为无时区格式
        let timestampStr;
        if (typeof entry.timestamp === 'string' && /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(entry.timestamp)) {
          timestampStr = entry.timestamp;
        } else if (entry.timestamp instanceof Date) {
          // Date 对象：使用 dayjs 格式化，但不进行时区转换（保持原始时间值）
          // 注意：dayjs 默认使用本地时区，但我们需要保持原始时间字符串的值
          // 如果原始时间字符串是 "2025-12-30 22:59:58"，应该直接存储这个值
          // 但由于 entry.timestamp 已经是 Date 对象，我们需要从原始字符串恢复
          // 这里使用 dayjs 的 format，但应该确保不进行时区转换
          timestampStr = dayjs(entry.timestamp).format('YYYY-MM-DD HH:mm:ss');
        } else {
          // 其他格式：尝试解析并格式化
          const parsed = dayjs(entry.timestamp);
          timestampStr = parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : dayjs().format('YYYY-MM-DD HH:mm:ss');
        }

        chEntries.push({
          log_id: logId,
          timestamp: timestampStr,
          error_code: errorCodeStr,
          param1: entry.param1 || '',
          param2: entry.param2 || '',
          param3: entry.param3 || '',
          param4: entry.param4 || '',
          explanation: parsedExplanation || '',
          subsystem_char: subsystem || '',
          code4: code || '',
          version: currentVersion,
          row_index: rowIndex++
        });
      }

      entries = chEntries; // 用于后续文件生成

      await job.progress(70);

      console.log('释义查询和解析完成，示例:', entries[0]?.explanation);
      console.log(`⏱️ 传统处理解析阶段耗时: ${Date.now() - t0}ms`);
      console.log(`准备插入 ${entries.length} 个日志条目到 ClickHouse`);
    
      try {
        const batchSize = 20000;
        for (let i = 0; i < entries.length; i += batchSize) {
             const batch = entries.slice(i, i + batchSize);
             await getClickHouseClient().insert({
                 table: 'log_entries',
                 values: batch,
                 format: 'JSONEachRow'
             });
             console.log(`✅ ClickHouse 批次插入完成: ${i + batch.length}/${entries.length}`);
        }
        console.log('✅ 所有数据插入 ClickHouse 完成');
      } catch (insertError) {
        console.error('❌ ClickHouse 插入失败:', insertError.message);
        throw new Error(`数据库插入失败: ${insertError.message}`);
      }
    }

    await job.progress(85);

    // 解密成功后，同步设备信息到设备表（若存在）
    // 注意：只有在解密成功后才保存密钥，避免错误密钥污染设备表
    try {
      if (deviceId && deviceId !== '0000-00' && decryptKey) {
        const [device, created] = await Device.findOrCreate({
          where: { device_id: deviceId },
          defaults: {
            device_model: null,
            device_key: decryptKey,
            created_at: new Date(),
            updated_at: new Date()
          }
        });
        
        if (!created) {
          // 更新现有设备信息：如果设备没有密钥，或者当前密钥与设备密钥不同，则更新
          // 这样可以更新到正确的密钥，但不会覆盖已有的正确密钥
          if (!device.device_key || device.device_key !== decryptKey) {
          await device.update({
            device_key: decryptKey,
            updated_at: new Date()
          });
            console.log(`✅ 已更新设备 ${deviceId} 的密钥（解密验证成功）`);
          }
        } else {
          console.log(`✅ 已创建设备 ${deviceId} 并保存密钥（解密验证成功）`);
        }
      }
    } catch (e) {
      console.warn('设备信息同步失败（忽略，不影响日志处理）:', e.message);
    }

    // 根据需求，解密后的文件应该保存到服务器磁盘
    // 创建设备编号文件夹（如果设备编号存在）
    let deviceFolder = UPLOAD_DIR;
    if (deviceId) {
      deviceFolder = path.join(UPLOAD_DIR, deviceId);
      if (!fs.existsSync(deviceFolder)) {
        fs.mkdirSync(deviceFolder, { recursive: true });
      }
    }
    
    // 生成解密后的文件名（与上传文件保持一致，.medbot -> .txt）
    const decryptedFileName = originalName.replace('.medbot', '.txt');
    const decryptedFilePath = path.join(deviceFolder, decryptedFileName);
    
    // 生成解密后的文件内容，使用解析后的释义
    console.log('📝 生成解密文件内容...');
    const decryptedContent = entries.map(entry => {
      const localTs = entry.timestamp; // 已经是格式化好的字符串
      return `${localTs} ${entry.error_code} ${entry.param1} ${entry.param2} ${entry.param3} ${entry.param4} ${entry.explanation}`;
    }).join('\n');
    
    // 保存解密后的文件
    fs.writeFileSync(decryptedFilePath, decryptedContent, 'utf-8');

    await job.progress(95);

    // 更新日志记录中的解密文件路径和状态（version 已在上传阶段更新）
    await Log.update({
      decrypted_path: decryptedFilePath,
      status: 'parsed', // 标记为解析完成
      parse_time: new Date() // 设置解析时间
    }, { where: { id: logId } });

    // 版本淘汰：重复上传场景下，清理 ClickHouse 中该日志的旧版本，仅保留最近 N 个版本
    try {
      await evictOldVersionsFromClickHouse(logId, currentVersion, 2);
    } catch (e) {
      console.warn(
        `[版本淘汰] 处理上传日志时清理旧版本失败: log_id=${logId}, version=${currentVersion}, 错误=${e.message}`
      );
    }
    
    // 推送状态变化到 WebSocket
    try {
      const websocketService = require('../services/websocketService');
      websocketService.pushLogStatusChange(deviceId, logId, 'parsed', 'parsing');
    } catch (wsError) {
      console.warn('WebSocket 状态推送失败:', wsError.message);
    }

    // 只有手动上传的文件才删除原文件，自动上传的文件保留
    if (uploaderId !== null) {
      // 手动上传的文件（有uploaderId），删除临时文件
      fs.unlinkSync(filePath);
      console.log(`[日志处理] 已删除手动上传的临时文件: ${originalName}`);
    } else {
      // 自动上传的文件（uploaderId为null），保留原文件
      console.log(`[日志处理] 保留自动上传的原文件: ${originalName}`);
    }
    
    console.log(`[日志处理] 处理完成: ${originalName}`);

    await job.progress(100);

    return {
      success: true,
      logId,
      entriesCount: entries.length,
      decryptedFilePath
    };

  } catch (error) {
    // 简化的错误信息输出，只保留关键信息
    console.error(`[日志处理] 处理失败: ${originalName}`);
    console.error(`[日志处理] 错误: ${error.message}`);
    
    // 根据错误类型提供具体的失败原因分析
    let failureStatus = 'failed';
    
    if (error.message.includes('解密失败：用户密钥和默认密钥都出现参数大于100000的情况')) {
      console.error(`[日志处理] 失败原因: 密钥错误 - 请检查密钥是否正确`);
      failureStatus = 'decrypt_failed';
    } else if (error.message.includes('日志行格式不正确')) {
      console.error(`[日志处理] 失败原因: 文件格式错误 - 检查日志格式`);
      failureStatus = 'parse_failed';
    } else if (error.message.includes('参数不是有效的十六进制格式')) {
      console.error(`[日志处理] 失败原因: 参数格式错误 - 检查文件是否损坏`);
      failureStatus = 'parse_failed';
    } else if (error.message.includes('密钥长度不足')) {
      console.error(`[日志处理] 失败原因: 密钥格式错误 - 应为MAC地址格式`);
      failureStatus = 'decrypt_failed';
    } else if (error.message.includes('所有') && error.message.includes('行日志解析都失败了')) {
      console.error(`[日志处理] 失败原因: 解密失败 - 检查密钥或加密方式`);
      failureStatus = 'decrypt_failed';
    } else if (error.message.includes('ENOENT') || error.message.includes('文件不存在')) {
      console.error(`[日志处理] 失败原因: 文件系统错误 - 检查文件权限和磁盘空间`);
      failureStatus = 'file_error';
    } else if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
      console.error(`[日志处理] 失败原因: 数据库连接错误 - 检查数据库服务状态`);
    } else if (error.message.includes('ER_ACCESS_DENIED_ERROR')) {
      console.error(`[日志处理] 失败原因: 数据库权限错误 - 检查用户权限配置`);
    } else if (error.message.includes('ER_NO_SUCH_TABLE')) {
      console.error(`[日志处理] 失败原因: 数据库表不存在 - 运行迁移脚本创建表结构`);
    } else {
      console.error(`[日志处理] 失败原因: 未知错误`);
    }
    
    // 只在开发环境下输出详细错误信息
    if (process.env.NODE_ENV === 'development') {
      console.error(`[日志处理] 详细错误:`, error.stack);
    }
    
    // 更新日志状态为具体的失败类型
    try {
      await Log.update(
        { status: failureStatus },
        { where: { id: logId } }
      );
      console.error(`✅ 已更新日志状态为 '${failureStatus}'`);
    } catch (updateError) {
      console.error(`❌ 更新日志状态失败: ${updateError.message}`);
    }
    
    // 只有手动上传的文件才删除临时文件，自动上传的文件保留
    if (uploaderId !== null) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.error(`✅ 已删除手动上传的临时文件: ${filePath}`);
        }
      } catch (deleteError) {
        console.error(`❌ 删除临时文件失败: ${deleteError.message}`);
      }
    } else {
      console.log(`[日志处理] 保留自动上传的原文件（处理失败）: ${originalName}`);
    }
    
    throw error;
  }
}

module.exports = {
  processLogFile
};
