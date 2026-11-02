'use strict';

const AUDIT_LOGS_DDL = `
CREATE TABLE audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  schema_version TINYINT UNSIGNED NOT NULL DEFAULT 1,
  occurred_at DATETIME(3) NOT NULL COMMENT 'AuditService 以 UTC 写入',
  event_code VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  category VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  outcome VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  reason_code VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NULL,
  actor_type VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  actor_user_id INT NULL COMMENT '事件发生时的内部用户 ID',
  actor_username VARCHAR(100) NULL COMMENT '事件发生时的用户名快照',
  target_type VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  target_id VARCHAR(128) NULL,
  request_id VARCHAR(64) NULL,
  ip VARCHAR(45) NULL,
  user_agent TEXT NULL,
  details JSON NOT NULL,
  CONSTRAINT uq_audit_logs_event_id UNIQUE (event_id),
  INDEX idx_audit_occurred_at (occurred_at),
  INDEX idx_audit_event_time (event_code, occurred_at),
  INDEX idx_audit_actor_time (actor_user_id, occurred_at),
  INDEX idx_audit_target_time (target_type, target_id, occurred_at),
  INDEX idx_audit_request_id (request_id),
  INDEX idx_audit_category_outcome_time (category, outcome, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const EXPECTED_COLUMNS = new Set([
  'id',
  'event_id',
  'schema_version',
  'occurred_at',
  'event_code',
  'category',
  'outcome',
  'reason_code',
  'actor_type',
  'actor_user_id',
  'actor_username',
  'target_type',
  'target_id',
  'request_id',
  'ip',
  'user_agent',
  'details'
]);

const EXPECTED_INDEXES = new Set([
  'PRIMARY',
  'uq_audit_logs_event_id',
  'idx_audit_occurred_at',
  'idx_audit_event_time',
  'idx_audit_actor_time',
  'idx_audit_target_time',
  'idx_audit_request_id',
  'idx_audit_category_outcome_time'
]);

async function validateAuditLogsTable(queryInterface) {
  const [columns] = await queryInterface.sequelize.query('SHOW COLUMNS FROM audit_logs');
  const [indexes] = await queryInterface.sequelize.query('SHOW INDEX FROM audit_logs');
  const actualColumns = new Set(columns.map((column) => column.Field));
  const actualIndexes = new Set(indexes.map((index) => index.Key_name));

  const missingColumns = [...EXPECTED_COLUMNS].filter((column) => !actualColumns.has(column));
  const missingIndexes = [...EXPECTED_INDEXES].filter((index) => !actualIndexes.has(index));

  if (missingColumns.length || missingIndexes.length) {
    throw new Error(
      `audit_logs exists but is incompatible: missing columns [${missingColumns.join(', ')}], missing indexes [${missingIndexes.join(', ')}]`
    );
  }
}

module.exports = {
  async up(queryInterface) {
    const [tables] = await queryInterface.sequelize.query("SHOW TABLES LIKE 'audit_logs'");

    if (tables.length === 0) {
      await queryInterface.sequelize.query(AUDIT_LOGS_DDL);
    }

    await validateAuditLogsTable(queryInterface);
  },

  async down() {
    throw new Error(
      'Refusing to drop audit_logs automatically. Restore a database backup to roll back this migration.'
    );
  }
};
