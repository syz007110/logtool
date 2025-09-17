const { logProcessingQueue, surgeryAnalysisQueue } = require('../config/queue');
const { processSurgeryAnalysisJob } = require('./surgeryProcessor');
const { processLogFile } = require('./logProcessor');
const { batchReparseLogs, batchDeleteLogs, processSingleDelete } = require('./batchProcessor');
const Log = require('../models/log');
const websocketService = require('../services/websocketService');

// 设置并发处理数量
const CONCURRENCY = parseInt(process.env.QUEUE_CONCURRENCY) || 3;

  console.log(`[队列系统] 启动日志处理队列，并发数: ${CONCURRENCY}`);
const SURGERY_CONCURRENCY = parseInt(process.env.SURGERY_QUEUE_CONCURRENCY) || 3;
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

// 注册队列处理器
logProcessingQueue.process('process-log', CONCURRENCY, async (job) => {
      // 减少冗余日志，只在开发环境下输出
    if (process.env.NODE_ENV === 'development') {
      console.log(`[队列处理器] 开始处理队列任务: ${job.id}`);
    }
  
  try {
    const result = await processLogFile(job);
    // 减少冗余日志，只在开发环境下输出
    if (process.env.NODE_ENV === 'development') {
      console.log(`[队列处理器] 队列任务 ${job.id} 处理完成`);
    }
    return result;
  } catch (error) {
    console.error(`[队列处理器] 队列任务 ${job.id} 处理失败:`, error);
    
    // 如果是 Redis 键丢失错误，尝试清理任务
    if (error.message.includes('Missing key for job')) {
      console.warn(`[队列处理器] 检测到 Redis 键丢失错误，尝试清理任务 ${job.id}`);
      try {
        await job.remove();
        console.log(`[队列处理器] 已清理损坏的任务 ${job.id}`);
      } catch (cleanupError) {
        console.error(`[队列处理器] 清理任务 ${job.id} 失败:`, cleanupError.message);
      }
    }
    
    throw error;
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

module.exports = {
  logProcessingQueue
};
