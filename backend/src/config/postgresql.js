const { Sequelize } = require('sequelize');

/**
 * PostgreSQL数据库配置
 * 用于存储手术结构化数据
 */
const postgresqlConfig = {
  development: {
    username: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'password',
    database: process.env.POSTGRES_DB || 'surgery_analytics',
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    dialect: 'postgres',
    logging: console.log,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true
    },
    dialectOptions: {
      ssl: false
      // 不设置时区，让TIMESTAMP字段按原始时间存储和读取（无时区转换）
    }
    // 不设置timezone，让TIMESTAMP字段按原始时间处理（无时区转换）
  },
  test: {
    username: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_TEST_DB || 'surgery_analytics_test',
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true
    },
    dialectOptions: {
      ssl: false
      // 不设置时区，让TIMESTAMP字段按原始时间存储和读取（无时区转换）
    }
    // 不设置timezone，让TIMESTAMP字段按原始时间处理（无时区转换）
  },
  production: {
    username: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT || 5432,
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 10,
      min: 2,
      acquire: 30000,
      idle: 10000
    },
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true
    },
    dialectOptions: {
      ssl: false
      // 不设置时区，让TIMESTAMP字段按原始时间存储和读取（无时区转换）
    }
    // 不设置timezone，让TIMESTAMP字段按原始时间处理（无时区转换）
  }
};

const env = process.env.NODE_ENV || 'development';
const config = postgresqlConfig[env];

// 创建PostgreSQL连接
const postgresqlSequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  {
    host: config.host,
    port: config.port,
    dialect: config.dialect,
    logging: config.logging,
    pool: config.pool,
    define: config.define,
    dialectOptions: config.dialectOptions
  }
);

// 测试连接
const testConnection = async () => {
  try {
    await postgresqlSequelize.authenticate();
  } catch (error) {
    console.error('PostgreSQL数据库连接失败:', error);
    throw error;
  }
};

// 同步数据库表结构 - 只同步表结构，不创建索引
const syncDatabase = async (force = false) => {
  try {
    // 使用 alter: false 避免自动修改表结构和创建索引
    await postgresqlSequelize.sync({ 
      force: false,  // 不强制重建表
      alter: false   // 不自动修改表结构，避免创建不必要的索引
    });
    console.log('PostgreSQL表结构同步完成（仅同步，不创建索引）');
  } catch (error) {
    console.error('PostgreSQL数据库表同步失败:', error);
    throw error;
  }
};

module.exports = {
  postgresqlSequelize,
  testConnection,
  syncDatabase,
  config
};
