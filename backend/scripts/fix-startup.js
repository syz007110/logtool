#!/usr/bin/env node

/**
 * 启动问题修复脚本
 * 解决速率限制和缓存初始化问题
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 启动问题修复脚本...\n');

// 检查并创建 .env 文件
const envPath = path.join(__dirname, '../.env');
if (!fs.existsSync(envPath)) {
  console.log('📝 创建 .env 配置文件...');
  
  const envContent = `# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_NAME=logtool
DB_USER=root
DB_PASSWORD=
DB_DIALECT=mysql

# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# 队列配置
QUEUE_CONCURRENCY=3

# 速率限制配置
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=10
RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS=false
RATE_LIMIT_SKIP_FAILED_REQUESTS=false

# 缓存配置
CACHE_ENABLED=false
CACHE_TTL_SECONDS=300
CACHE_MAX_KEYS=1000

# 搜索优化配置
SEARCH_MAX_CONCURRENT=5
SEARCH_TIMEOUT_MS=30000
SEARCH_CACHE_ENABLED=false

# 其他配置
NODE_ENV=development
PORT=3000
JWT_SECRET=your-secret-key
`;
  
  try {
    fs.writeFileSync(envPath, envContent);
    console.log('✅ .env 文件创建成功');
  } catch (error) {
    console.error('❌ .env 文件创建失败:', error.message);
  }
} else {
  console.log('✅ .env 文件已存在');
}

// 检查依赖包
console.log('\n📦 检查依赖包...');
const packagePath = path.join(__dirname, '../package.json');
if (fs.existsSync(packagePath)) {
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const requiredDeps = ['express-rate-limit', 'redis'];
  
  const missingDeps = requiredDeps.filter(dep => !packageJson.dependencies[dep]);
  
  if (missingDeps.length > 0) {
    console.log('⚠️  缺少以下依赖包:', missingDeps.join(', '));
    console.log('💡 请运行: npm install ' + missingDeps.join(' '));
  } else {
    console.log('✅ 所有必需依赖包已安装');
  }
} else {
  console.error('❌ package.json 文件不存在');
}

// 提供启动建议
console.log('\n🚀 启动建议:');
console.log('1. 如果Redis不可用，系统会自动禁用缓存功能');
console.log('2. 如果速率限制器创建失败，系统会自动降级到无限制模式');
console.log('3. 建议先启动Redis服务: redis-server');
console.log('4. 然后启动应用: npm start');

console.log('\n✅ 修复脚本执行完成！');
