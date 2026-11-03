'use strict';

// This migration is the sole source of truth for RBAC structure and catalogue data.
const GROUPS = [
  ['user', '用户管理', 'User management', 10], ['role', '角色管理', 'Role management', 20],
  ['log', '日志管理', 'Log management', 30], ['error_code', '故障码管理', 'Error code management', 40],
  ['fault_case', '故障案例管理', 'Fault case management', 50], ['i18n', '多语言管理', 'Localization', 60],
  ['device', '设备管理', 'Device management', 70], ['history', '历史记录', 'History', 80],
  ['surgery', '手术数据', 'Surgery data', 90], ['data_replay', '数据回放', 'Data replay', 100],
  ['kb', '知识库', 'Knowledge base', 110], ['smart_search', '智能搜索', 'Smart search', 120],
  ['audit', '审计', 'Audit', 130], ['queue', '队列', 'Queue', 140], ['dashboard', '仪表盘', 'Dashboard', 150],
  ['loglevel', '日志级别', 'Log level', 160], ['other', '其他权限', 'Other', 999]
];
const CODES = [
  'user:create','user:read','user:update','user:delete','user:role:assign','role:read','role:manage',
  'error_code:create','error_code:read','error_code:update','error_code:delete','error_code:export',
  'fault_case:create','fault_case:read','fault_case:update','fault_case:delete','fault_case:review','fault_case_config:manage',
  'log:upload','log:read_all','log:read_own','log:parse','log:reparse','log:download','log:delete','log:delete_own',
  'i18n:create','i18n:read','i18n:update','i18n:delete','device:create','device:read','device:update','device:delete',
  'history:read_all','history:read_own','history:export','audit:read','audit:export','queue:read','queue:manage',
  'surgery:analyze','surgery:read','surgery:export','surgery:delete','data_replay:manage','smart_search:use','kb:read','kb:upload','kb:delete','kb:rebuild',
  'dashboard:read','loglevel:manage'
];
const USER_PERMISSION_CODES = ['error_code:read','error_code:export','fault_case:read','log:upload','log:read_own','log:parse','log:download','log:delete_own','i18n:read','history:read_own','surgery:analyze','surgery:read','surgery:export','smart_search:use','kb:read'];

async function hasTable(qi, name) { return (await qi.showAllTables()).map(String).includes(name); }
async function hasColumn(qi, table, column) { return Object.prototype.hasOwnProperty.call(await qi.describeTable(table), column); }
async function addColumn(qi, table, column, definition) { if (!(await hasColumn(qi, table, column))) await qi.addColumn(table, column, definition); }
function groupFor(code) { const key = code.split(':')[0]; return GROUPS.some(([group]) => group === key) ? key : 'other'; }

module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, STRING, BOOLEAN, DATE } = Sequelize;
    if (!(await hasTable(queryInterface, 'permission_groups'))) {
      await queryInterface.createTable('permission_groups', { id: { type: INTEGER, autoIncrement: true, primaryKey: true }, group_key: { type: STRING(64), allowNull: false, unique: true }, name_zh: { type: STRING(100), allowNull: false }, name_en: { type: STRING(100), allowNull: false }, i18n_key: { type: STRING(150), allowNull: false }, sort_order: { type: INTEGER, allowNull: false }, is_active: { type: BOOLEAN, allowNull: false, defaultValue: true }, created_at: { type: DATE(3), allowNull: false }, updated_at: { type: DATE(3), allowNull: false } });
    }
    if (!(await hasTable(queryInterface, 'roles'))) {
      await queryInterface.createTable('roles', { id: { type: INTEGER, autoIncrement: true, primaryKey: true }, code: { type: STRING(64), allowNull: false, unique: true }, name_zh: { type: STRING(100), allowNull: false }, name_en: { type: STRING(100), allowNull: false }, is_system: { type: BOOLEAN, allowNull: false, defaultValue: false }, is_super_admin: { type: BOOLEAN, allowNull: false, defaultValue: false }, scope_type: { type: STRING(32), allowNull: false, defaultValue: 'platform' }, scope_id: { type: INTEGER, allowNull: false, defaultValue: 0 }, created_at: { type: DATE(3), allowNull: false }, updated_at: { type: DATE(3), allowNull: false } });
    } else {
      await addColumn(queryInterface, 'roles', 'code', { type: STRING(64), allowNull: true }); await addColumn(queryInterface, 'roles', 'name_zh', { type: STRING(100), allowNull: true }); await addColumn(queryInterface, 'roles', 'name_en', { type: STRING(100), allowNull: true }); await addColumn(queryInterface, 'roles', 'is_system', { type: BOOLEAN, allowNull: false, defaultValue: false }); await addColumn(queryInterface, 'roles', 'is_super_admin', { type: BOOLEAN, allowNull: false, defaultValue: false }); await addColumn(queryInterface, 'roles', 'created_at', { type: DATE(3), allowNull: true }); await addColumn(queryInterface, 'roles', 'updated_at', { type: DATE(3), allowNull: true });
    }
    if (!(await hasTable(queryInterface, 'permissions'))) {
      await queryInterface.createTable('permissions', { id: { type: INTEGER, autoIncrement: true, primaryKey: true }, code: { type: STRING(100), allowNull: false, unique: true }, name_zh: { type: STRING(100), allowNull: false }, name_en: { type: STRING(100), allowNull: false }, description: { type: STRING(255), allowNull: true }, group_key: { type: STRING(64), allowNull: false }, sort_order: { type: INTEGER, allowNull: false, defaultValue: 100 }, created_at: { type: DATE(3), allowNull: false }, updated_at: { type: DATE(3), allowNull: false } });
    } else {
      await addColumn(queryInterface, 'permissions', 'code', { type: STRING(100), allowNull: true }); await addColumn(queryInterface, 'permissions', 'name_zh', { type: STRING(100), allowNull: true }); await addColumn(queryInterface, 'permissions', 'name_en', { type: STRING(100), allowNull: true }); await addColumn(queryInterface, 'permissions', 'sort_order', { type: INTEGER, allowNull: false, defaultValue: 100 }); await addColumn(queryInterface, 'permissions', 'created_at', { type: DATE(3), allowNull: true }); await addColumn(queryInterface, 'permissions', 'updated_at', { type: DATE(3), allowNull: true });
    }
    if (!(await hasTable(queryInterface, 'user_roles'))) await queryInterface.createTable('user_roles', { user_id: { type: INTEGER, allowNull: false, primaryKey: true, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' }, role_id: { type: INTEGER, allowNull: false, primaryKey: true, references: { model: 'roles', key: 'id' }, onDelete: 'RESTRICT' }, created_at: { type: DATE(3), allowNull: false } });
    else await addColumn(queryInterface, 'user_roles', 'created_at', { type: DATE(3), allowNull: true });
    if (!(await hasTable(queryInterface, 'role_permissions'))) await queryInterface.createTable('role_permissions', { role_id: { type: INTEGER, allowNull: false, primaryKey: true, references: { model: 'roles', key: 'id' }, onDelete: 'CASCADE' }, permission_id: { type: INTEGER, allowNull: false, primaryKey: true, references: { model: 'permissions', key: 'id' }, onDelete: 'CASCADE' }, created_at: { type: DATE(3), allowNull: false } });
    else await addColumn(queryInterface, 'role_permissions', 'created_at', { type: DATE(3), allowNull: true });
    await queryInterface.sequelize.query('CREATE TABLE IF NOT EXISTS rbac_invariant_lock (id TINYINT PRIMARY KEY, CHECK (id = 1)) ENGINE=InnoDB');
    try { await queryInterface.addIndex('roles', ['code'], { name: 'uk_roles_code', unique: true }); } catch (_) {}
    try { await queryInterface.addIndex('permissions', ['code'], { name: 'uk_permissions_code', unique: true }); } catch (_) {}
    try { await queryInterface.addIndex('user_roles', ['role_id'], { name: 'idx_user_roles_role_id' }); } catch (_) {}
    await queryInterface.sequelize.query('INSERT IGNORE INTO rbac_invariant_lock (id) VALUES (1)');
    const now = new Date();
    const legacyRoleName = await hasColumn(queryInterface, 'roles', 'name');
    const legacyPermissionName = await hasColumn(queryInterface, 'permissions', 'name');
    for (const [group_key, name_zh, name_en, sort_order] of GROUPS) await queryInterface.sequelize.query('INSERT INTO permission_groups (group_key,name_zh,name_en,i18n_key,sort_order,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name_zh=VALUES(name_zh),name_en=VALUES(name_en),sort_order=VALUES(sort_order),is_active=VALUES(is_active),updated_at=VALUES(updated_at)', { replacements: [group_key, name_zh, name_en, `roles.permissionGroups.${group_key}`, sort_order, true, now, now] });
    for (const [index, code] of CODES.entries()) { const columns = legacyPermissionName ? 'name,code,name_zh,name_en,description,group_key,sort_order,created_at,updated_at' : 'code,name_zh,name_en,description,group_key,sort_order,created_at,updated_at'; const values = legacyPermissionName ? [code, code, code, code, null, groupFor(code), index + 1, now, now] : [code, code, code, null, groupFor(code), index + 1, now, now]; await queryInterface.sequelize.query(`INSERT INTO permissions (${columns}) VALUES (${values.map(() => '?').join(',')}) ON DUPLICATE KEY UPDATE name_zh=VALUES(name_zh),name_en=VALUES(name_en),group_key=VALUES(group_key),sort_order=VALUES(sort_order),updated_at=VALUES(updated_at)`, { replacements: values }); }
    for (const [code, zh, en, superAdmin] of [['super_admin', '超级管理员', 'Super Administrator', true], ['user', '普通用户', 'User', false]]) { const columns = legacyRoleName ? 'name,code,name_zh,name_en,is_system,is_super_admin,scope_type,scope_id,created_at,updated_at' : 'code,name_zh,name_en,is_system,is_super_admin,scope_type,scope_id,created_at,updated_at'; const values = legacyRoleName ? [code, code, zh, en, true, superAdmin, 'platform', 0, now, now] : [code, zh, en, true, superAdmin, 'platform', 0, now, now]; await queryInterface.sequelize.query(`INSERT INTO roles (${columns}) VALUES (${values.map(() => '?').join(',')}) ON DUPLICATE KEY UPDATE code=VALUES(code)`, { replacements: values }); }
    await queryInterface.sequelize.query('INSERT IGNORE INTO role_permissions (role_id,permission_id,created_at) SELECT r.id,p.id,? FROM roles r JOIN permissions p ON p.code IN (?) WHERE r.code = \'user\'', { replacements: [now, USER_PERMISSION_CODES] });
  },
  async down() { throw new Error('RBAC schema migration is not automatically reversible.'); }
};
