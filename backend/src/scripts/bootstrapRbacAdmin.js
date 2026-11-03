const bcrypt = require('bcryptjs');
const { sequelize } = require('../models');
const User = require('../models/user');
const Role = require('../models/role');
const UserRole = require('../models/user_role');

function argument(name) { const index = process.argv.indexOf(`--${name}`); return index >= 0 ? String(process.argv[index + 1] || '').trim() : ''; }
function readPassword() { return new Promise((resolve) => { let value = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', (chunk) => { value += chunk; }); process.stdin.on('end', () => resolve(value.trim())); }); }
async function main() {
  const username = argument('username');
  const email = argument('email') || null;
  if (!username) throw new Error('Usage: npm run rbac:bootstrap-admin -- --username <username> [--email <email>] [--password-stdin]');
  await sequelize.transaction(async (transaction) => {
    await sequelize.query('SELECT id FROM rbac_invariant_lock WHERE id=1 FOR UPDATE', { transaction });
    const superRole = await Role.findOne({ where: { code: 'super_admin' }, transaction });
    if (!superRole) throw new Error('RBAC system roles are not initialized; run migrations first.');
    const [existing] = await sequelize.query('SELECT COUNT(DISTINCT u.id) AS total FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.is_active=TRUE AND r.is_super_admin=TRUE', { transaction });
    if (Number(existing[0]?.total || 0) > 0) return;
    let user = await User.findOne({ where: { username }, transaction });
    if (!user) {
      const password = process.argv.includes('--password-stdin') ? await readPassword() : '';
      if (!password) throw new Error('Creating a user requires --password-stdin.');
      user = await User.create({ username, email, password_hash: await bcrypt.hash(password, 12), is_active: true, must_change_password: true }, { transaction });
    }
    await UserRole.findOrCreate({ where: { user_id: user.id, role_id: superRole.id }, defaults: { created_at: new Date() }, transaction });
    process.stdout.write(`Bootstrap super administrator is ${user.username} (id=${user.id}).\n`);
  });
}
main().then(() => sequelize.close()).catch(async (error) => { console.error(error.message); await sequelize.close(); process.exitCode = 1; });
