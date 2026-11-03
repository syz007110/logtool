const path = require('path');
const dotenv = require('dotenv');

function loadTestEnvironment() {
  dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
  // 必须在其他模块加载 backend/.env 前固定测试进程的无副作用配置。
  process.env.NODE_ENV = 'test';
  process.env.CACHE_ENABLED = 'false';
  process.env.AUTO_CACHE_CLEANUP = 'false';
  process.env.ENABLE_API_DOCS = 'false';
}

function assertTestDatabaseEnvironment() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Refusing database test setup: NODE_ENV must be test.');
  }
  if (process.env.DB_NAME !== 'logtool_test') {
    throw new Error('Refusing database test setup: DB_NAME must be exactly logtool_test.');
  }
  for (const key of ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET']) {
    if (!process.env[key]) throw new Error(`Missing required test environment variable: ${key}`);
  }
}

module.exports = { assertTestDatabaseEnvironment, loadTestEnvironment };
