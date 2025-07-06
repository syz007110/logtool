const dotenv = require('dotenv');
const path = require('path');

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '.env') });

console.log('=== 环境变量检查 ===\n');

console.log('当前工作目录:', process.cwd());
console.log('.env 文件路径:', path.join(__dirname, '.env'));
console.log();

console.log('环境变量:');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? '已设置' : '未设置');
console.log('DB_HOST:', process.env.DB_HOST || '未设置');
console.log('DB_PORT:', process.env.DB_PORT || '未设置');
console.log('DB_USER:', process.env.DB_USER || '未设置');
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '已设置' : '未设置');
console.log('DB_NAME:', process.env.DB_NAME || '未设置');
console.log('PORT:', process.env.PORT || '未设置');
console.log('NODE_ENV:', process.env.NODE_ENV || '未设置');

// 检查.env文件是否存在
const fs = require('fs');
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  console.log('\n✅ .env 文件存在');
  console.log('文件内容预览:');
  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
  lines.forEach(line => {
    const [key] = line.split('=');
    console.log(`  ${key}`);
  });
} else {
  console.log('\n❌ .env 文件不存在');
  console.log('请创建 .env 文件并设置必要的环境变量');
} 