/**
 * 安装监控功能依赖
 * 用于安装chokidar等监控相关的依赖包
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('🔧 开始安装监控功能依赖...');

try {
  // 安装chokidar依赖
  console.log('📦 安装 chokidar...');
  execSync('npm install chokidar@^3.5.3', { 
    stdio: 'inherit',
    cwd: path.resolve(__dirname)
  });
  
  console.log('✅ 监控功能依赖安装完成');
  console.log('💡 现在可以启动监控服务了');
  
} catch (error) {
  console.error('❌ 安装依赖失败:', error.message);
  console.log('💡 请手动运行: npm install chokidar@^3.5.3');
  process.exit(1);
}
