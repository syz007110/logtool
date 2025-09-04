// 防止重复初始化 - 使用进程级别的检查
const processKey = `app_${process.pid}`;
if (global[processKey]) {
  console.log(`[进程 ${process.pid}] 应用已初始化，跳过重复初始化`);
  const app = require('express')();
  module.exports = app;
  return;
}

global[processKey] = true;
console.log(`[进程 ${process.pid}] 开始初始化应用...`);

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { sequelize } = require('./models');
const { defineAssociations } = require('./models/associations');
const { postgresqlSequelize, testConnection: testPostgreSQLConnection } = require('./config/postgresql');
const { createRateLimitersWithFallback } = require('./config/rateLimit');
const { cacheManager } = require('./config/cache');
const authRouter = require('./routes/auth');
const errorCodesRouter = require('./routes/errorCodes');
const i18nErrorCodesRouter = require('./routes/i18nErrorCodes');
const xmlExportRouter = require('./routes/xmlExport');
const i18nRouter = require('./routes/i18n');
const usersRouter = require('./routes/users');
const rolesRouter = require('./routes/roles');
const userRolesRouter = require('./routes/userRoles');
const operationLogsRouter = require('./routes/operationLogs');
const logsRouter = require('./routes/logs');
const surgeryStatisticsRouter = require('./routes/surgeryStatistics');
const devicesRouter = require('./routes/devices');
const motionDataRouter = require('./routes/motionData');
const feedbackRouter = require('./routes/feedback');
const dashboardRouter = require('./routes/dashboard');
const explanationsRouter = require('./routes/explanations');
const queueRouter = require('./routes/queue');
const websocketService = require('./services/websocketService');

// 初始化队列系统
try {
  require('./workers/queueProcessor');
  console.log('✅ 队列处理器初始化完成');
} catch (error) {
  console.warn('⚠️ 队列处理器初始化失败:', error.message);
}

// 初始化缓存系统
try {
  cacheManager.connect().then(success => {
    if (success) {
      console.log('✅ Redis缓存系统初始化完成');
    } else {
      console.warn('⚠️ Redis缓存系统初始化失败，将使用内存缓存');
    }
  });
} catch (error) {
  console.warn('⚠️ 缓存系统初始化失败:', error.message);
}

const app = express();

// 配置代理信任（解决X-Forwarded-For头部问题）
app.set('trust proxy', 1);

// 创建速率限制器（带降级机制）
const rateLimiters = createRateLimitersWithFallback();

// 中间件
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

// 应用通用速率限制（可通过环境变量禁用）
app.use('/api', rateLimiters.general);
app.use('/api', rateLimiters.userSpecific);
console.log('✅ 速率限制已启用');

// 静态资源：反馈图片
app.use('/static/feedback', express.static(path.resolve(__dirname, '../uploads/feedback')));

// 路由占位
app.get('/', (req, res) => {
  res.send('logTool backend is running.');
});

// 健康检查接口（不受速率限制）
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    cache: cacheManager.isConnected ? 'connected' : 'disconnected'
  });
});

// 缓存状态接口（不受速率限制）
app.get('/api/cache/status', async (req, res) => {
  try {
    const stats = await cacheManager.getStats();
    res.json({
      status: 'ok',
      cache: stats || { connected: cacheManager.isConnected }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// WebSocket 状态接口（不受速率限制）
app.get('/api/websocket/status', (req, res) => {
  try {
    const stats = websocketService.getStats();
    res.json({
      status: 'ok',
      websocket: {
        ...stats,
        serverAddress: req.get('host'),
        clientOrigin: req.get('origin')
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// TODO: 挂载各模块路由
app.use('/api/users', usersRouter);
app.use('/api/roles', rolesRouter);
app.use('/api/user-roles', userRolesRouter);
app.use('/api/error-codes', errorCodesRouter);
app.use('/api/i18n-error-codes', i18nErrorCodesRouter);
app.use('/api/i18n', i18nRouter);
app.use('/api/xml-export', xmlExportRouter);
app.use('/api/logs', logsRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/motion-data', motionDataRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/auth', authRouter);
app.use('/api/operation-logs', operationLogsRouter);
app.use('/api/surgery-statistics', surgeryStatisticsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/explanations', explanationsRouter);
app.use('/api/queue', queueRouter);

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal Server Error' });
});

// 启动服务器并连接数据库
const PORT = process.env.PORT || 3000;

// 检查是否在集群模式下运行
const isClusterMode = process.env.WORKER_ID !== undefined;
const isMainProcess = !isClusterMode || process.env.WORKER_ID === '0';

if (isMainProcess) {
  // 主进程或非集群模式：启动完整的服务器
  const serverProcessKey = `server_${process.pid}`;
  if (global[serverProcessKey]) {
    console.log(`[进程 ${process.pid}] 服务器已启动，跳过重复启动`);
  } else {
    global[serverProcessKey] = true;
    
    (async () => {
      try {
        await sequelize.authenticate();
        console.log(`[进程 ${process.pid}] MySQL数据库连接成功`);
        
        // 测试PostgreSQL连接并同步数据库表
        try {
          await testPostgreSQLConnection();
          console.log(`[进程 ${process.pid}] PostgreSQL数据库连接成功`);
          
          // 同步PostgreSQL表结构（仅同步，不创建索引）
          // 注意：所有索引都通过SQL脚本统一管理，这里只同步表结构
          const { syncDatabase } = require('./config/postgresql');
          await syncDatabase(false); // 不强制重建表，不创建索引
          console.log(`[进程 ${process.pid}] PostgreSQL数据库表同步完成（仅同步表结构）`);
        } catch (postgresError) {
          console.warn(`[进程 ${process.pid}] PostgreSQL数据库连接失败:`, postgresError.message);
          console.warn('⚠️ 手术分析功能仍可正常工作，但PostgreSQL数据存储功能将不可用');
          console.warn('💡 如需使用PostgreSQL功能，请配置正确的数据库连接信息');
        }
        
        // 定义模型关联
        defineAssociations();
        
        // 启动HTTP服务器
        const server = app.listen(PORT, () => {
          console.log(`[进程 ${process.pid}] 🚀 服务器启动成功，端口: ${PORT}`);
          console.log(`[进程 ${process.pid}] 📊 速率限制: ${process.env.RATE_LIMIT_MAX_REQUESTS || 10} 次/分钟`);
          console.log(`[进程 ${process.pid}] 💾 缓存状态: ${cacheManager.isConnected ? '已启用' : '已禁用'}`);
          
          // 初始化 WebSocket 服务
          websocketService.initialize(server);
          console.log(`[进程 ${process.pid}] 🔌 WebSocket 服务已启动`);
        });
      } catch (error) {
        console.error(`[进程 ${process.pid}] ❌ 服务器启动失败:`, error);
        process.exit(1);
      }
    })();
  }
} else {
  // 工作进程：跳过所有服务器启动逻辑
  console.log(`[进程 ${process.pid}] 工作进程，跳过服务器启动和数据库连接`);
}

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('收到SIGTERM信号，正在优雅关闭...');
  await cacheManager.disconnect();
  await sequelize.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('收到SIGINT信号，正在优雅关闭...');
  await cacheManager.disconnect();
  await sequelize.close();
  process.exit(0);
});

module.exports = app; 