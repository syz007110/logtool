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

module.exports = { sequelize, Sequelize }; 