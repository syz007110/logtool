const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { loadTestEnvironment, assertTestDatabaseEnvironment } = require('../testing/testEnvironment');

const backendRoot = path.resolve(__dirname, '../..');
const integrationDirectory = path.resolve(backendRoot, 'test/integration');

function findTestFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findTestFiles(entryPath);
      return entry.isFile() && entry.name.endsWith('.test.js') ? [entryPath] : [];
    })
    .sort();
}

function main() {
  loadTestEnvironment();
  assertTestDatabaseEnvironment();

  const testFiles = findTestFiles(integrationDirectory)
    .map((file) => path.relative(backendRoot, file));
  if (testFiles.length === 0) throw new Error('No integration test files were found.');

  const result = spawnSync(
    process.execPath,
    ['--require', './src/testing/loadTestEnvironment.js', '--test', '--test-concurrency=1', '--test-force-exit', ...testFiles],
    { cwd: backendRoot, env: process.env, stdio: 'inherit' }
  );
  process.exitCode = result.status ?? 1;
}

try {
  main();
} catch (error) {
  console.error('Integration test runner failed:', error.message);
  process.exitCode = 1;
}
