const fs = require('fs/promises');
const path = require('path');
const { spawnSync } = require('child_process');
const mysql = require('mysql2/promise');
const { loadTestEnvironment, assertTestDatabaseEnvironment } = require('../testing/testEnvironment');

function runNode(args) {
  const result = spawnSync(process.execPath, args, { cwd: path.resolve(__dirname, '../..'), env: process.env, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Command failed: node ${args.join(' ')}`);
}

async function main() {
  loadTestEnvironment();
  assertTestDatabaseEnvironment();

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true
  });
  try {
    const [existing] = await connection.query("SHOW TABLES LIKE 'users'");
    if (existing.length > 0) {
      throw new Error('logtool_test is not empty. Recreate the test MySQL container before bootstrapping.');
    }
    const schema = await fs.readFile(path.resolve(__dirname, '../../../infrastructure/database/mysql/init.sql'), 'utf8');
    await connection.query(schema);
  } finally {
    await connection.end();
  }

  runNode(['node_modules/sequelize-cli/lib/sequelize', 'db:migrate', '--env', 'test']);
}

main().catch((error) => {
  console.error('Integration database bootstrap failed:', error.message);
  process.exit(1);
});
