const cluster = require('cluster');
const ClusterManager = require('./cluster/clusterManager');
const WorkerProcess = require('./workers/workerProcess');

// 全局集群管理器实例
global.clusterManager = null;

if (cluster.isMaster) {
  // 主进程
  console.log('='.repeat(60));
  console.log('🚀 日志工具多进程集群启动');
  console.log('='.repeat(60));
  
  const clusterManager = new ClusterManager();
  global.clusterManager = clusterManager;
  
  // 启动主进程
  clusterManager.startMaster();
  
  // 主进程创建独立的HTTP服务器，不加载app.js
  const express = require('express');
  const cors = require('cors');
  const dotenv = require('dotenv');
  const path = require('path');
  
  // 加载环境变量
  dotenv.config({ path: path.resolve(__dirname, '.env') });
  
  const app = express();
  const PORT = process.env.PORT || 3000;
  
  // 配置CORS
  app.use(cors({
    origin: [
      'http://localhost:8080',
      'http://127.0.0.1:8080',
      'http://10.129.44.141:8080',
      'http://10.129.44.141:3000'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  }));
  
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  
  // 基础路由
  app.get('/', (req, res) => {
    res.send('logTool backend is running in cluster mode.');
  });
  
  // 启动HTTP服务器
  app.listen(PORT, () => {
    console.log(`[主进程] 🚀 HTTP服务器启动成功，端口: ${PORT}`);
    console.log(`[主进程] 📊 集群模式已启用，工作进程数: ${clusterManager.numWorkers}`);
  });
  
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
  // 工作进程
  const workerId = parseInt(process.env.WORKER_ID) || 0;
  const workerType = process.env.WORKER_TYPE || 'unknown';
  
  // 工作进程运行队列处理任务
  try {
    console.log(`[工作进程 ${workerId}] 启动，类型: ${workerType}, PID: ${process.pid}`);
    
    // 工作进程只启动队列处理器，不加载app.js
    console.log(`[工作进程 ${workerId}] 开始启动队列工作进程...`);
    const WorkerProcess = require('./workers/workerProcess');
    const workerProcess = new WorkerProcess(workerId);
    workerProcess.start();
    
    console.log(`[工作进程 ${workerId}] 队列工作进程启动完成`);
    
  } catch (error) {
    console.error(`[工作进程 ${workerId}] 启动失败:`, error);
    process.exit(1);
  }
}

// 导出集群管理器（供其他模块使用）
module.exports = {
  clusterManager: global.clusterManager
};
