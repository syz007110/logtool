const Queue = require('bull');

// Redis连接配置
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || null,
  db: process.env.REDIS_DB || 0
};

// 队列配置
const queueOptions = {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: parseInt(process.env.QUEUE_MAX_ATTEMPTS) || 3, // 重试次数
    backoff: {
      type: 'exponential',
      delay: parseInt(process.env.QUEUE_BACKOFF_DELAY) || 2000 // 初始延迟
    },
    removeOnComplete: 100, // 保留最近100个完成的任务
    removeOnFail: 50, // 保留最近50个失败的任务
    timeout: parseInt(process.env.QUEUE_TIMEOUT_MS) || 300000 // 任务超时时间：5分钟
  }
};

// 创建队列实例
const logProcessingQueue = new Queue('log-processing', queueOptions);

// 实时处理队列（用户请求）- 高优先级
const realtimeProcessingQueue = new Queue('realtime-processing', {
  ...queueOptions,
  defaultJobOptions: {
    ...queueOptions.defaultJobOptions,
    priority: 10, // 高优先级
    timeout: parseInt(process.env.REALTIME_QUEUE_TIMEOUT_MS) || 300000, // 5分钟
    removeOnComplete: 50,
    removeOnFail: 25
  }
});

// 历史处理队列（自动上传）- 低优先级
const historicalProcessingQueue = new Queue('historical-processing', {
  ...queueOptions,
  defaultJobOptions: {
    ...queueOptions.defaultJobOptions,
    priority: 1, // 低优先级
    timeout: parseInt(process.env.HISTORICAL_QUEUE_TIMEOUT_MS) || 600000, // 10分钟
    removeOnComplete: 200,
    removeOnFail: 100
  }
});

// 手术分析队列（与日志处理分离，避免相互影响）
const surgeryAnalysisQueue = new Queue('surgery-analysis', {
  ...queueOptions,
  defaultJobOptions: {
    ...queueOptions.defaultJobOptions,
    // 手术统计分析可能更耗时，适当放宽超时时间
    timeout: parseInt(process.env.SURGERY_QUEUE_TIMEOUT_MS) || 600000,
    removeOnComplete: 200,
    removeOnFail: 100
  }
});

// 队列事件监听
logProcessingQueue.on('error', (error) => {
  console.error('[队列] 队列错误:', error);
});

logProcessingQueue.on('failed', (job, err) => {
  console.error('[队列] 任务失败:', job.id, err.message);
});

// 实时处理队列事件监听
realtimeProcessingQueue.on('error', (error) => {
  console.error('[实时队列] 队列错误:', error);
});

realtimeProcessingQueue.on('failed', (job, err) => {
  console.error('[实时队列] 任务失败:', job.id, err.message);
});

// 历史处理队列事件监听
historicalProcessingQueue.on('error', (error) => {
  console.error('[历史队列] 队列错误:', error);
});

historicalProcessingQueue.on('failed', (job, err) => {
  console.error('[历史队列] 任务失败:', job.id, err.message);
});

// 手术分析队列事件监听
surgeryAnalysisQueue.on('error', (error) => {
  console.error('[手术分析队列] 队列错误:', error);
});

surgeryAnalysisQueue.on('failed', (job, err) => {
  console.error('[手术分析队列] 任务失败:', job.id, err.message);
});

// 通用队列完成事件监听
logProcessingQueue.on('completed', (job) => {
  console.log(`[队列] 任务 ${job.id} 完成`);
});

realtimeProcessingQueue.on('completed', (job) => {
  console.log(`[实时队列] 任务 ${job.id} 完成`);
});

historicalProcessingQueue.on('completed', (job) => {
  console.log(`[历史队列] 任务 ${job.id} 完成`);
});

surgeryAnalysisQueue.on('completed', (job) => {
  console.log(`[手术分析队列] 任务 ${job.id} 完成`);
});

logProcessingQueue.on('stalled', (job) => {
  console.warn(`[队列] 任务 ${job.id} 停滞`);
});

module.exports = {
  logProcessingQueue,
  realtimeProcessingQueue,
  historicalProcessingQueue,
  surgeryAnalysisQueue,
  redisConfig,
  queueOptions
};
