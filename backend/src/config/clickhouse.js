const { createClient } = require('@clickhouse/client');
const dotenv = require('dotenv');
const path = require('path');

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * ClickHouse数据库配置
 * 用于存储海量日志条目数据（log_entries）
 */
const clickhouseConfig = {
  development: {
    url: process.env.CLICKHOUSE_HOST || 'http://localhost:8123',
    database: process.env.CLICKHOUSE_DB || 'logtool',
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
    // ClickHouse连接选项
    clickhouse_settings: {
      // 启用异步插入以提高性能
      async_insert: 1,
      wait_for_async_insert: 0,
      async_insert_max_data_size: 10485760, // 10MB
      async_insert_busy_timeout_ms: 200,
      async_insert_stale_timeout_ms: 0,
      // 批量插入优化
      max_insert_block_size: 1048576, // 1MB
      // 查询超时
      max_execution_time: 300
    },
    // 请求超时
    request_timeout: 300000, // 5分钟
    // 压缩请求
    compression: {
      request: true,
      response: true
    }
  },
  test: {
    url: process.env.CLICKHOUSE_HOST || 'http://localhost:8123',
    database: process.env.CLICKHOUSE_DB || 'logtool_test',
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
    clickhouse_settings: {
      async_insert: 1,
      wait_for_async_insert: 0
    },
    request_timeout: 30000
  },
  production: {
    url: process.env.CLICKHOUSE_HOST,
    database: process.env.CLICKHOUSE_DB,
    username: process.env.CLICKHOUSE_USER,
    password: process.env.CLICKHOUSE_PASSWORD,
    clickhouse_settings: {
      async_insert: 1,
      wait_for_async_insert: 0,
      async_insert_max_data_size: 10485760,
      async_insert_busy_timeout_ms: 200,
      max_insert_block_size: 1048576,
      max_execution_time: 600
    },
    request_timeout: 600000, // 10分钟
    compression: {
      request: true,
      response: true
    }
  }
};

const env = process.env.NODE_ENV || 'development';
const config = clickhouseConfig[env];

// 创建ClickHouse客户端
let clickhouseClient = null;

const getClickHouseClient = () => {
  if (!clickhouseClient) {
    // 调试信息：打印实际使用的配置（隐藏密码）
    if (process.env.NODE_ENV === 'development') {
      console.log('🔧 ClickHouse 配置:', {
        url: config.url,
        database: config.database,
        username: config.username,
        password: config.password ? '***' : '(空)'
      });
    }
    
    clickhouseClient = createClient({
      url: config.url,
      database: config.database,
      username: config.username,
      password: config.password,
      clickhouse_settings: config.clickhouse_settings,
      request_timeout: config.request_timeout,
      compression: config.compression
    });
  }
  return clickhouseClient;
};

// 测试连接
const testConnection = async () => {
  try {
    // 打印配置信息用于调试
    console.log('🔍 测试 ClickHouse 连接...');
    console.log('   环境变量 CLICKHOUSE_HOST:', process.env.CLICKHOUSE_HOST || '(未设置)');
    console.log('   实际使用的 URL:', config.url);
    
    const client = getClickHouseClient();
    const result = await client.query({
      query: 'SELECT version() as version',
      format: 'JSONEachRow'
    });
    const data = await result.json();
    console.log('✅ ClickHouse连接成功');
    console.log('   ClickHouse 版本:', data[0]?.version || '未知');
    return true;
  } catch (error) {
    console.error('❌ ClickHouse数据库连接失败:', error.message);
    console.error('   错误详情:', error);
    throw error;
  }
};

// 关闭连接
const closeConnection = async () => {
  if (clickhouseClient) {
    await clickhouseClient.close();
    clickhouseClient = null;
    console.log('ClickHouse连接已关闭');
  }
};

module.exports = {
  getClickHouseClient,
  testConnection,
  closeConnection,
  config
};


