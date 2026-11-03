const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '../../..');
const backendRoot = path.resolve(__dirname, '../..');
const composeFile = path.resolve(projectRoot, 'docker-compose.test.yml');
const composeArgs = ['compose', '--project-name', 'logtool-test', '-f', composeFile];

function run(command, args) {
  const result = spawnSync(command, args, { cwd: projectRoot, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed`);
}

try {
  run('docker', [...composeArgs, 'down', '-v', '--remove-orphans']);
  run('docker', [...composeArgs, 'up', '-d', '--wait']);
  const result = spawnSync('npm', ['run', 'test:integration'], { cwd: backendRoot, stdio: 'inherit', env: process.env });
  if (result.status !== 0) throw new Error('npm run test:integration failed');
} finally {
  try { run('docker', [...composeArgs, 'down', '-v', '--remove-orphans']); } catch (_) {}
}
