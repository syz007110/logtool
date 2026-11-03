'use strict';

module.exports = {
  async up(queryInterface) {
    const db = queryInterface.sequelize;
    const roleColumns = await queryInterface.describeTable('roles');
    if (!Object.prototype.hasOwnProperty.call(roleColumns, 'name')) return;
    const transaction = await db.transaction();
    try {
      const [legacy] = await db.query("SELECT DISTINCT ur.user_id FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE r.code IS NULL AND LOWER(TRIM(r.name)) = 'admin'", { transaction });
      const [users] = await db.query('SELECT id FROM users', { transaction });
      if (!users.length) { await transaction.commit(); return; }
      if (!legacy.length) throw new Error('RBAC migration requires at least one legacy admin user or an explicit bootstrap administrator.');
      const adminIds = legacy.map((row) => row.user_id);
      await db.query('DELETE FROM user_roles', { transaction });
      for (const userId of adminIds) await db.query("INSERT INTO user_roles (user_id,role_id,created_at) SELECT ?,r.id,UTC_TIMESTAMP(3) FROM roles r WHERE r.code='super_admin'", { replacements: [userId], transaction });
      for (const user of users) if (!adminIds.includes(user.id)) await db.query("INSERT INTO user_roles (user_id,role_id,created_at) SELECT ?,r.id,UTC_TIMESTAMP(3) FROM roles r WHERE r.code='user'", { replacements: [user.id], transaction });
      await transaction.commit();
    } catch (error) { await transaction.rollback(); throw error; }
  },
  async down() { throw new Error('Legacy RBAC assignment migration is not reversible.'); }
};
