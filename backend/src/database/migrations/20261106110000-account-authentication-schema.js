'use strict';

async function hasTable(queryInterface, table) {
  return (await queryInterface.showAllTables()).map(String).includes(table);
}

async function hasColumn(queryInterface, table, column) {
  return Object.prototype.hasOwnProperty.call(await queryInterface.describeTable(table), column);
}

async function addColumnIfMissing(queryInterface, table, column, definition) {
  if (!(await hasColumn(queryInterface, table, column))) {
    await queryInterface.addColumn(table, column, definition);
  }
}

async function addIndexIfMissing(queryInterface, table, fields, options) {
  try {
    await queryInterface.addIndex(table, fields, options);
  } catch (error) {
    // Migrations are deliberately repeatable for installations whose old runtime
    // sync() call already created this index/table.
    if (!/duplicate|exists|already/i.test(String(error.message))) throw error;
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const { STRING, BOOLEAN, DATE, INTEGER, BIGINT } = Sequelize;
    if (!(await hasTable(queryInterface, 'users'))) throw new Error('users table is required before account authentication migration');

    await queryInterface.changeColumn('users', 'password_hash', { type: STRING(255), allowNull: true });
    await queryInterface.changeColumn('users', 'dingtalk_unionid', { type: STRING(128), allowNull: true });
    await queryInterface.changeColumn('users', 'dingtalk_userid', { type: STRING(128), allowNull: true });
    await addColumnIfMissing(queryInterface, 'users', 'local_login_enabled', { type: BOOLEAN, allowNull: false, defaultValue: false });
    await addColumnIfMissing(queryInterface, 'users', 'dingtalk_corp_id', { type: STRING(128), allowNull: true });
    await addColumnIfMissing(queryInterface, 'users', 'dingtalk_bound_at', { type: DATE(3), allowNull: true });
    await addIndexIfMissing(queryInterface, 'users', ['dingtalk_unionid'], { name: 'uq_users_dingtalk_unionid', unique: true });
    await addIndexIfMissing(queryInterface, 'users', ['dingtalk_corp_id', 'dingtalk_userid'], { name: 'uq_users_dingtalk_corp_user', unique: true });

    // The application validates this too. MySQL 8 enforces CHECK constraints;
    // deployments on older MySQL must be upgraded rather than silently weakening it.
    try {
      await queryInterface.sequelize.query(`ALTER TABLE users ADD CONSTRAINT ck_users_dingtalk_identity_pair CHECK ((dingtalk_corp_id IS NULL AND dingtalk_userid IS NULL) OR (dingtalk_corp_id IS NOT NULL AND dingtalk_userid IS NOT NULL))`);
    } catch (error) {
      if (!/duplicate|exists|already/i.test(String(error.message))) throw error;
    }

    if (!(await hasTable(queryInterface, 'refresh_tokens'))) {
      await queryInterface.createTable('refresh_tokens', {
        id: { type: BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
        user_id: { type: INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        token_hash: { type: STRING(128), allowNull: false },
        remember_me: { type: BOOLEAN, allowNull: false, defaultValue: false },
        expires_at: { type: DATE(3), allowNull: false },
        revoked_at: { type: DATE(3), allowNull: true },
        replaced_by: { type: BIGINT.UNSIGNED, allowNull: true },
        device_info: { type: STRING(255), allowNull: true },
        ip_address: { type: STRING(64), allowNull: true },
        created_at: { type: DATE(3), allowNull: false }
      });
    }
    await addIndexIfMissing(queryInterface, 'refresh_tokens', ['token_hash'], { name: 'uq_refresh_tokens_hash', unique: true });
    await addIndexIfMissing(queryInterface, 'refresh_tokens', ['user_id', 'revoked_at', 'expires_at'], { name: 'idx_refresh_tokens_active_user' });
  },
  async down() { throw new Error('Account authentication schema migration is not automatically reversible.'); }
};
