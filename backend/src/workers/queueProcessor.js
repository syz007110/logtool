const { 
  logProcessingQueue, 
  realtimeProcessingQueue, 
  historicalProcessingQueue, 
  surgeryAnalysisQueue 
} = require('../config/queue');
const { processSurgeryAnalysisJob } = require('./surgeryProcessor');
const { processLogFile } = require('./logProcessor');
const { batchReparseLogs, batchDeleteLogs, processSingleDelete, reparseSingleLog } = require('./batchProcessor');
const Log = require('../models/log');
const websocketService = require('../services/websocketService');

// 设置并发处理数量
const CONCURRENCY = parseInt(process.env.QUEUE_CONCURRENCY) || 3;
const REALTIME_CONCURRENCY = parseInt(process.env.REALTIME_QUEUE_CONCURRENCY) || 2; // 实时处理并发数
const HISTORICAL_CONCURRENCY = parseInt(process.env.HISTORICAL_QUEUE_CONCURRENCY) || 1; // 历史处理并发数
const SURGERY_CONCURRENCY = parseInt(process.env.SURGERY_QUEUE_CONCURRENCY) || 3;

console.log(`[队列系统] 启动日志处理队列，并发数: ${CONCURRENCY}`);
console.log(`[队列系统] 启动实时处理队列，并发数: ${REALTIME_CONCURRENCY}`);
console.log(`[队列系统] 启动历史处理队列，并发数: ${HISTORICAL_CONCURRENCY}`);
console.log(`[队列系统] 启动手术分析队列，并发数: ${SURGERY_CONCURRENCY}`);

// 检查和处理卡住的任务
const checkStuckJobs = async () => {
  try {
    // 检查卡住的任务（超过10分钟的任务）
    const stuckJobs = await logProcessingQueue.getJobs(['active', 'waiting']);
    const now = Date.now();
    const stuckThreshold = 10 * 60 * 1000; // 10分钟

    for (const job of stuckJobs) {
      const jobAge = now - job.timestamp;
      if (jobAge > stuckThreshold) {
        console.warn(`发现卡住的任务 ${job.id}，已运行 ${Math.round(jobAge / 1000)} 秒`);
        
        // 如果是日志处理任务，将状态设置为失败
        if (job.name === 'process-log' && job.data.logId) {
          try {
            const log = await Log.findByPk(job.data.logId);
            if (log) {
              const oldStatus = log.status;
              await Log.update(
                { status: 'failed' },
                { where: { id: job.data.logId } }
              );
              console.log(`已将卡住的任务 ${job.id} 对应的日志状态设置为失败`);
              
              // 推送状态变化到 WebSocket
              if (log.device_id) {
                websocketService.pushLogStatusChange(log.device_id, log.id, 'failed', oldStatus);
              }
            }
          } catch (error) {
            console.error(`更新卡住任务状态失败:`, error);
          }
        }
        
        // 移除卡住的任务
        await job.remove();
        console.log(`已移除卡住的任务 ${job.id}`);
      }
    }
  } catch (error) {
    console.error('检查卡住任务时出错:', error);
  }
};

// 每5分钟检查一次卡住的任务
setInterval(checkStuckJobs, 5 * 60 * 1000);

// 注册通用队列处理器（向后兼容）
logProcessingQueue.process('process-log', CONCURRENCY, async (job) => {
  // 减少冗余日志，只在开发环境下输出
  if (process.env.NODE_ENV === 'development') {
    console.log(`[通用队列处理器] 开始处理队列任务: ${job.id}`);
  }

  try {
    const result = await processLogFile(job);
    // 减少冗余日志，只在开发环境下输出
    if (process.env.NODE_ENV === 'development') {
      console.log(`[通用队列处理器] 队列任务 ${job.id} 处理完成`);
    }
    return result;
  } catch (error) {
    console.error(`[通用队列处理器] 队列任务 ${job.id} 处理失败:`, error);
    
    // 如果是文件不存在错误，优雅处理
    if (error.message.includes('文件不存在')) {
      console.warn(`[通用队列处理器] 文件不存在，任务 ${job.id} 已跳过处理`);
      return; // 不抛出异常，优雅退出
    }
    
    // 如果是 Redis 键丢失错误，尝试清理任务
    if (error.message.includes('Missing key for job')) {
      console.warn(`[通用队列处理器] 检测到 Redis 键丢失错误，尝试清理任务 ${job.id}`);
      try {
        await job.remove();
        console.log(`[通用队列处理器] 已清理损坏的任务 ${job.id}`);
      } catch (cleanupError) {
        console.error(`[通用队列处理器] 清理任务 ${job.id} 失败:`, cleanupError.message);
      }
    }
    
    throw error;
  }
});

// 注册实时处理队列处理器（用户请求）
realtimeProcessingQueue.process('process-log', REALTIME_CONCURRENCY, async (job) => {
  console.log(`[实时队列处理器] 开始处理用户请求任务: ${job.id}`);
  
  try {
    const result = await processLogFile(job);
    console.log(`[实时队列处理器] 用户请求任务 ${job.id} 处理完成`);
    return result;
  } catch (error) {
    console.error(`[实时队列处理器] 用户请求任务 ${job.id} 处理失败:`, error);
    
    // 实时处理需要更严格的错误处理
    if (error.message.includes('文件不存在')) {
      console.warn(`[实时队列处理器] 文件不存在，任务 ${job.id} 已跳过处理`);
      return;
    }
    
    if (error.message.includes('Missing key for job')) {
      console.warn(`[实时队列处理器] 检测到 Redis 键丢失错误，尝试清理任务 ${job.id}`);
      try {
        await job.remove();
        console.log(`[实时队列处理器] 已清理损坏的任务 ${job.id}`);
      } catch (cleanupError) {
        console.error(`[实时队列处理器] 清理任务 ${job.id} 失败:`, cleanupError.message);
      }
    }
    
    throw error;
  }
});

// 注册历史处理队列处理器（自动上传）
historicalProcessingQueue.process('process-log', HISTORICAL_CONCURRENCY, async (job) => {
  console.log(`[历史队列处理器] 开始处理自动上传任务: ${job.id}`);
  
  try {
    const result = await processLogFile(job);
    console.log(`[历史队列处理器] 自动上传任务 ${job.id} 处理完成`);
    return result;
  } catch (error) {
    console.error(`[历史队列处理器] 自动上传任务 ${job.id} 处理失败:`, error);
    
    // 历史处理可以更宽松的错误处理
    if (error.message.includes('文件不存在')) {
      console.warn(`[历史队列处理器] 文件不存在，任务 ${job.id} 已跳过处理`);
      return;
    }
    
    // 优雅处理解密失败的情况
    if (error.message.includes('所有') && error.message.includes('行日志解析都失败了')) {
      console.warn(`[历史队列处理器] 解密失败，任务 ${job.id} 已跳过处理（可能是密钥错误或文件格式问题）`);
      
      // 尝试更新日志状态为解密失败
      try {
        const Log = require('../models/log');
        const { logId } = job.data;
        if (logId) {
          await Log.update(
            { status: 'decrypt_failed' },
            { where: { id: logId } }
          );
          console.log(`[历史队列处理器] 已更新日志状态为解密失败: ${logId}`);
        }
      } catch (updateError) {
        console.warn(`[历史队列处理器] 更新日志状态失败:`, updateError.message);
      }
      
      return; // 优雅退出，不抛出异常
    }
    
    if (error.message.includes('Missing key for job')) {
      console.warn(`[历史队列处理器] 检测到 Redis 键丢失错误，尝试清理任务 ${job.id}`);
      try {
        await job.remove();
        console.log(`[历史队列处理器] 已清理损坏的任务 ${job.id}`);
      } catch (cleanupError) {
        console.error(`[历史队列处理器] 清理任务 ${job.id} 失败:`, cleanupError.message);
      }
      return; // 优雅退出
    }
    
    // 处理磁盘空间不足错误
    if (error.message.includes('No space left on device') || 
        error.message.includes('OS errno 28') ||
        (error.original && error.original.message && error.original.message.includes('No space left on device'))) {
      console.error(`❌ [历史队列处理器] 磁盘空间不足，任务 ${job.id} 无法处理`);
      console.error(`   请清理系统临时目录和磁盘空间后重试`);
      console.error(`   临时目录: ${process.env.TMP || process.env.TEMP || 'C:\\Windows\\Temp'}`);
      
      // 尝试更新日志状态为处理失败
      try {
        const Log = require('../models/log');
        const { logId } = job.data;
        if (logId) {
          await Log.update(
            { status: 'processing_failed' },
            { where: { id: logId } }
          );
          console.log(`[历史队列处理器] 已更新日志状态为处理失败: ${logId}`);
        }
      } catch (updateError) {
        console.warn(`[历史队列处理器] 更新日志状态失败:`, updateError.message);
      }
      
      // 延迟重试，等待磁盘空间释放
      // 注意：这里不立即重试，避免频繁失败
      return; // 优雅退出，任务会在队列中等待重试
    }
    
    // 其他错误也优雅处理，避免队列阻塞
    console.warn(`[历史队列处理器] 任务 ${job.id} 处理失败，已跳过: ${error.message}`);
    return;
  }
});

// 注册单个删除处理器
logProcessingQueue.process('delete-single', 1, async (job) => {
  console.log(`开始单个删除任务: ${job.id}`);
  
  try {
    const result = await processSingleDelete(job);
    console.log(`单个删除任务 ${job.id} 完成`);
    return result;
  } catch (error) {
    console.error(`单个删除任务 ${job.id} 失败:`, error);
    throw error;
  }
});

// 注册批量重新解析处理器
logProcessingQueue.process('batch-reparse', 1, async (job) => {
  console.log(`开始批量重新解析任务: ${job.id}`);
  
  try {
    const result = await batchReparseLogs(job);
    console.log(`批量重新解析任务 ${job.id} 完成`);
    return result;
  } catch (error) {
    console.error(`批量重新解析任务 ${job.id} 失败:`, error);
    throw error;
  }
});

// 注册单个重新解析处理器（用于并行化批量任务）
logProcessingQueue.process('reparse-single', CONCURRENCY, async (job) => {
  try {
    return await reparseSingleLog(job);
  } catch (error) {
    console.error(`单个重新解析任务 ${job.id} 失败:`, error);
    throw error;
  }
});

// 注册批量删除处理器
logProcessingQueue.process('batch-delete', 1, async (job) => {
  console.log(`开始批量删除任务: ${job.id}`);
  
  try {
    const result = await batchDeleteLogs(job);
    console.log(`批量删除任务 ${job.id} 完成`);
    return result;
  } catch (error) {
    console.error(`批量删除任务 ${job.id} 失败:`, error);
    throw error;
  }
});

// 注册手术分析处理器
surgeryAnalysisQueue.process('analyze-surgeries', SURGERY_CONCURRENCY, async (job) => {
  try {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[队列处理器] 手术分析任务开始: ${job.id}`);
    }
    const result = await processSurgeryAnalysisJob(job);
    if (process.env.NODE_ENV === 'development') {
      console.log(`[队列处理器] 手术分析任务完成: ${job.id}`);
    }
    return result;
  } catch (error) {
    console.error(`[队列处理器] 手术分析任务 ${job.id} 失败:`, error);
    throw error;
  }
});

// 队列事件监听
logProcessingQueue.on('waiting', (jobId) => {
  console.log(`任务 ${jobId} 等待处理`);
});

logProcessingQueue.on('active', (job) => {
  console.log(`任务 ${job.id} 开始处理`);
});

logProcessingQueue.on('completed', (job, result) => {
  console.log(`任务 ${job.id} 完成，结果:`, result);
});

logProcessingQueue.on('failed', (job, err) => {
  console.error(`任务 ${job.id} 失败:`, err.message);
});

logProcessingQueue.on('stalled', (jobId) => {
  console.warn(`任务 ${jobId} 停滞`);
});

logProcessingQueue.on('error', (error) => {
  console.error('队列错误:', error);
});

// 手术队列事件监听
surgeryAnalysisQueue.on('waiting', (jobId) => {
  console.log(`[手术队列] 任务 ${jobId} 等待处理`);
});

surgeryAnalysisQueue.on('active', (job) => {
  console.log(`[手术队列] 任务 ${job.id} 开始处理`);
});

surgeryAnalysisQueue.on('completed', (job, result) => {
  console.log(`[手术队列] 任务 ${job.id} 完成`);
});

surgeryAnalysisQueue.on('failed', (job, err) => {
  console.error(`[手术队列] 任务 ${job.id} 失败:`, err && err.message);
});

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('收到SIGTERM信号，正在关闭队列...');
  await logProcessingQueue.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('收到SIGINT信号，正在关闭队列...');
  await logProcessingQueue.close();
  process.exit(0);
});

// 角色控制：提供按队列启停的方法（仅影响本进程）
async function startRealtime() {
  console.log('[队列控制] 启用本进程实时处理队列');
  await realtimeProcessingQueue.resume(true);
}

async function stopRealtime() {
  console.log('[队列控制] 暂停本进程实时处理队列');
  await realtimeProcessingQueue.pause(true);
}

async function startHistorical() {
  console.log('[队列控制] 启用本进程历史处理队列');
  await historicalProcessingQueue.resume(true);
}

async function stopHistorical() {
  console.log('[队列控制] 暂停本进程历史处理队列');
  await historicalProcessingQueue.pause(true);
}

async function startLogProcessing() {
  console.log('[队列控制] 启用本进程通用处理队列');
  await logProcessingQueue.resume(true);
}

async function stopLogProcessing() {
  console.log('[队列控制] 暂停本进程通用处理队列');
  await logProcessingQueue.pause(true);
}

async function startSurgery() {
  console.log('[队列控制] 启用本进程手术分析队列');
  await surgeryAnalysisQueue.resume(true);
}

async function stopSurgery() {
  console.log('[队列控制] 暂停本进程手术分析队列');
  await surgeryAnalysisQueue.pause(true);
}

module.exports = {
  logProcessingQueue,
  startRealtime,
  stopRealtime,
  startHistorical,
  stopHistorical,
  startLogProcessing,
  stopLogProcessing,
  startSurgery,
  stopSurgery
};
