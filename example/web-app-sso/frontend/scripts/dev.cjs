const { spawn } = require('child_process');

// 解析命令行参数
const args = process.argv.slice(2);
let clientId = '';
args.forEach(arg => {
  if (arg.startsWith('--clientId=')) clientId = arg.split('=')[1];
});

// 拼接环境变量并启动 Vite
const env = { ...process.env, VITE_CLIENT_ID: clientId };
const vite = spawn('npm', ['run', 'dev:raw'], { stdio: 'inherit', env });

vite.on('close', code => process.exit(code)); 