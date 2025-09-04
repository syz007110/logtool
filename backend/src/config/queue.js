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

// 队列事件监听
logProcessingQueue.on('error', (error) => {
  console.error('[队列] 队列错误:', error);
});

logProcessingQueue.on('failed', (job, err) => {
  console.error(`[队列] 任务 ${job.id} 失败:`, err.message);
});

logProcessingQueue.on('completed', (job) => {
  console.log(`[队列] 任务 ${job.id} 完成`);
});

logProcessingQueue.on('stalled', (job) => {
  console.warn(`[队列] 任务 ${job.id} 停滞`);
});

module.exports = {
  logProcessingQueue,
  redisConfig,
  queueOptions
};
