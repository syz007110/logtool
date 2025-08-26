const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { sequelize } = require('./models');
const { defineAssociations } = require('./models/associations');
const { postgresqlSequelize, testConnection: testPostgreSQLConnection } = require('./config/postgresql');
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

// 初始化队列系统
try {
  require('./workers/queueProcessor');
  console.log('✅ 队列处理器初始化完成');
} catch (error) {
  console.warn('⚠️ 队列处理器初始化失败:', error.message);
}

const app = express();

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// 静态资源：反馈图片
app.use('/static/feedback', express.static(path.resolve(__dirname, '../uploads/feedback')));

// 路由占位
app.get('/', (req, res) => {
  res.send('logTool backend is running.');
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

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal Server Error' });
});

// 启动服务器并连接数据库
const PORT = process.env.PORT || 3000;
(async () => {
  try {
    await sequelize.authenticate();
    console.log('MySQL数据库连接成功');
    
    // 测试PostgreSQL连接并同步数据库表
    try {
      await testPostgreSQLConnection();
      console.log('PostgreSQL数据库连接成功');
      
      // 同步数据库表结构
      const { syncDatabase } = require('./config/postgresql');
      await syncDatabase(false); // 不强制重建表
      console.log('PostgreSQL数据库表同步完成');
    } catch (postgresError) {
      console.warn('PostgreSQL数据库连接失败:', postgresError.message);
      console.warn('⚠️ 手术分析功能仍可正常工作，但PostgreSQL数据存储功能将不可用');
      console.warn('💡 如需使用PostgreSQL功能，请配置正确的数据库连接信息');
    }
    
    // 定义模型关联
    defineAssociations();
    
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('MySQL数据库连接失败:', error);
  }
})(); 