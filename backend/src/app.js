const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { sequelize } = require('./models');
const { defineAssociations } = require('./models/associations');
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

// 加载环境变量
dotenv.config({ path: '../.env' });

const app = express();

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use('/api/auth', authRouter);
app.use('/api/operation-logs', operationLogsRouter);

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
    console.log('数据库连接成功');
    
    // 定义模型关联
    defineAssociations();
    
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('数据库连接失败:', error);
  }
})(); 