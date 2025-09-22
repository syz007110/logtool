/**
 * 智能集群启动器
 * 集成增强的集群管理器和智能调度器
 */

const cluster = require('cluster');
const path = require('path');
const dotenv = require('dotenv');

// 加载环境变量（确保指向 backend/.env）
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const EnhancedClusterManager = require('./enhancedClusterManager');
const SmartWorker = require('../workers/smartWorker');

// 全局集群管理器实例
global.clusterManager = null;

if (cluster.isMaster) {
  // 主进程
  console.log('='.repeat(60));
  console.log('🧠 智能集群启动器');
  console.log('='.repeat(60));
  
  // 检查是否启用智能调度
  const intelligentSchedulerEnabled = process.env.INTELLIGENT_SCHEDULER_ENABLED === 'true';
  
  if (intelligentSchedulerEnabled) {
    console.log('🚀 启用智能调度模式');
    const clusterManager = new EnhancedClusterManager();
    global.clusterManager = clusterManager;
    // ENV 校验与冗余警告
    try {
      const warn = (msg) => console.warn(`[ENV] ${msg}`);
      // 检查 WORKER_PROCESSES 是否为可解析数字
      if (process.env.WORKER_PROCESSES && isNaN(parseInt(process.env.WORKER_PROCESSES))) {
        warn('WORKER_PROCESSES 非数字，已回退为CPU核心数');
      }
      // 检查峰值/非峰值时间与配比是否配置但未启用智能调度
      const timeKeys = ['PEAK_HOURS_START','PEAK_HOURS_END','OFF_PEAK_HOURS_START','OFF_PEAK_HOURS_END'];
      const allocKeys = ['PEAK_HISTORY_LOG_WORKERS','PEAK_USER_REQUEST_WORKERS','OFF_PEAK_HISTORY_LOG_WORKERS','OFF_PEAK_USER_REQUEST_WORKERS'];
      [...timeKeys, ...allocKeys].forEach(k => {
        if (process.env[k] === undefined) return;
      });
    } catch(_) {}
  } else {
    console.log('📊 启用传统集群模式');
    const ClusterManager = require('./clusterManager');
    const clusterManager = new ClusterManager();
    global.clusterManager = clusterManager;
  }
  
  // 启动主进程
  clusterManager.startMaster();
  
  // 主进程加载 app.js 启动完整服务（HTTP + DB + WebSocket）
  require('../app');
  console.log('[主进程] 已加载应用服务（HTTP/DB/WebSocket）');

  // 最新需求：主进程仅监控与投递，不参与任何队列消费
  try {
    const qp = require('../workers/queueProcessor');
    Promise.resolve()
      .then(() => qp.stopRealtime())
      .then(() => qp.stopHistorical())
      .then(() => qp.stopLogProcessing())
      .then(() => qp.stopSurgery())
      .then(() => console.log('[主进程] 已设置为仅监控与投递（不消费队列）'))
      .catch(err => console.warn('[主进程] 设置为不消费队列失败:', err && err.message));
  } catch (e) {
    console.warn('[主进程] 加载队列控制器失败，跳过队列参与:', e && e.message);
  }
  
  // 优雅关闭处理
  const gracefulShutdown = async (signal) => {
    console.log(`\n[主进程] 收到 ${signal} 信号，开始优雅关闭...`);
    
    try {
      await clusterManager.gracefulShutdown();
      console.log('[主进程] 优雅关闭完成，退出进程');
      process.exit(0);
    } catch (error) {
      console.error('[主进程] 优雅关闭失败:', error);
      process.exit(1);
    }
  };
  
  // 监听关闭信号
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  
  // 监听未捕获的异常
  process.on('uncaughtException', async (error) => {
    console.error('[主进程] 未捕获的异常:', error);
    
    try {
      await clusterManager.gracefulShutdown();
    } catch (shutdownError) {
      console.error('[主进程] 异常关闭失败:', shutdownError);
    }
    
    process.exit(1);
  });
  
  // 监听未处理的Promise拒绝
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[主进程] 未处理的Promise拒绝:', reason);
  });
  
  console.log('[主进程] 启动完成，等待工作进程就绪...');
  
} else {
  // 工作进程也需要加载环境变量（确保指向 backend/.env）
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
  
  // 工作进程
  const workerId = parseInt(process.env.WORKER_ID) || 0;
  const workerType = process.env.WORKER_TYPE || 'smart';
  const processType = process.env.PROCESS_TYPE || 'mixed';
  const intelligentSchedulerEnabled = process.env.INTELLIGENT_SCHEDULER_ENABLED === 'true';
  
  try {
    console.log(`[工作进程 ${workerId}] 启动，类型: ${workerType}, 进程类型: ${processType}, PID: ${process.pid}`);
    
    if (intelligentSchedulerEnabled && workerType === 'smart') {
      // 智能工作进程
      console.log(`[智能工作进程 ${workerId}] 启动智能工作进程`);
      const smartWorker = new SmartWorker(workerId);
      smartWorker.start();
      console.log(`[智能工作进程 ${workerId}] 智能工作进程启动完成`);
    } else {
      // 传统工作进程
      console.log(`[传统工作进程 ${workerId}] 启动传统工作进程，进程类型: ${processType}`);
      const WorkerProcess = require('../workers/workerProcess');
      const workerProcess = new WorkerProcess(workerId, processType);
      workerProcess.start();
      console.log(`[传统工作进程 ${workerId}] 传统工作进程启动完成`);
    }
    
  } catch (error) {
    console.error(`[工作进程 ${workerId}] 启动失败:`, error);
    process.exit(1);
  }
}

// 导出集群管理器（供其他模块使用）
module.exports = {
  clusterManager: global.clusterManager
};
