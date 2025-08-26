#!/usr/bin/env node

/**
 * 日志处理队列工作进程启动脚本
 * 用于启动独立的队列处理进程
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// 设置环境变量
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

console.log('启动日志处理队列工作进程...');
console.log('环境:', process.env.NODE_ENV);
console.log('Redis配置:', {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  db: process.env.REDIS_DB || 0
});

// 启动队列处理器
require('./src/workers/queueProcessor');

console.log('队列工作进程已启动，等待任务...');
