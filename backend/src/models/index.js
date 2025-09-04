// 防止重复初始化数据库连接
const processKey = `db_${process.pid}`;
if (global[processKey]) {
  console.log(`[进程 ${process.pid}] 数据库连接已初始化，跳过重复初始化`);
  module.exports = global[processKey];
  return;
}

const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'mysql',
    logging: false,
    charset: 'utf8mb4',
    define: {
      freezeTableName: true,
      timestamps: false
    },
    dialectOptions: {
      charset: 'utf8mb4',
      supportBigNumbers: true,
      bigNumberStrings: true
    },
    // 添加连接池配置
    pool: {
      max: 20,           // 最大连接数
      min: 5,            // 最小连接数
      acquire: 60000,    // 获取连接超时时间（毫秒）
      idle: 10000        // 连接空闲时间（毫秒）
    }
  }
);

// 存储到全局变量，避免重复初始化
global[processKey] = { sequelize, Sequelize };
module.exports = { sequelize, Sequelize }; 