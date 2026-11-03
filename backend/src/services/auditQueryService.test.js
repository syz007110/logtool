const assert = require('node:assert/strict');
const test = require('node:test');
const { Op } = require('sequelize');
const {
  AuditExportLimitError,
  AuditQueryValidationError,
  createAuditQueryService
} = require('./auditQueryService');

function auditRow(overrides = {}) {
  return {
    id: 10,
    event_id: '01K8ABCDEF1234567890ABCDEFG',
    schema_version: 1,
    occurred_at: new Date('2026-11-02T01:02:03.004Z'),
    event_code: 'AUDIT.LOGS_EXPORTED',
    category: 'audit',
    outcome: 'SUCCESS',
    reason_code: null,
    actor_type: 'USER',
    actor_user_id: 7,
    actor_username: 'Admin',
    target_type: null,
    target_id: null,
    request_id: 'req_01K8',
    ip: '203.0.113.10',
    user_agent: 'LogtoolTest/1.0',
    details: { filters: {}, format: 'csv', exportedRowCount: 1 },
    ...overrides
  };
}

test('lists audit logs with documented filters, pagination, and public field mapping', async () => {
  let options;
  const service = createAuditQueryService({
    auditLog: {
      findAndCountAll: async (input) => {
        options = input;
        return { count: 1, rows: [auditRow()] };
      }
    }
  });

  const result = await service.list({
    from: '2026-11-01T00:00:00.000Z',
    to: '2026-11-03T00:00:00.000Z',
    eventCode: 'audit.logs_exported',
    actorUserId: '7',
    actorUsername: 'adm',
    page: '2',
    limit: '50'
  });

  assert.equal(options.where.event_code, 'AUDIT.LOGS_EXPORTED');
  assert.equal(options.where.actor_user_id, 7);
  assert.equal(options.where.actor_username[Op.like], '%adm%');
  assert.deepEqual(options.order, [['occurred_at', 'DESC'], ['id', 'DESC']]);
  assert.equal(options.offset, 50);
  assert.equal(result.items[0].eventId, '01K8ABCDEF1234567890ABCDEFG');
  assert.equal(result.items[0].summary, '导出审计记录');
  assert.equal(result.items[0].actor.userId, '7');
  assert.equal(result.items[0].target, null);
  assert.equal(result.items[0].occurredAt, '2026-11-02T01:02:03.004Z');
});

test('rejects invalid filters and pagination rather than silently changing the request', async () => {
  const service = createAuditQueryService({ auditLog: {} });
  await assert.rejects(service.list({ from: '2026-11-03T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' }), AuditQueryValidationError);
  await assert.rejects(service.list({ limit: '101' }), AuditQueryValidationError);
  await assert.rejects(service.list({ unknown: 'value' }), AuditQueryValidationError);
});

test('creates a complete UTF-8 CSV export and returns normalized filters for the audit event', async () => {
  let options;
  const service = createAuditQueryService({
    exportMaxRows: 2,
    auditLog: {
      findAll: async (input) => {
        options = input;
        return [auditRow({ actor_username: '张三', details: { note: 'a,b' } })];
      }
    }
  });

  const result = await service.exportCsv({ eventCode: 'audit.logs_exported' });
  assert.equal(options.limit, 3);
  assert.match(result.csv, /eventId,schemaVersion/);
  assert.match(result.csv, /AUDIT\.LOGS_EXPORTED/);
  assert.match(result.csv, /张三/);
  assert.deepEqual(result.filters, {
    from: null,
    to: null,
    eventCode: 'AUDIT.LOGS_EXPORTED',
    actorUserId: null,
    actorUsername: null
  });
});

test('does not silently truncate an audit export', async () => {
  const service = createAuditQueryService({
    exportMaxRows: 1,
    auditLog: { findAll: async () => [auditRow(), auditRow({ id: 11 })] }
  });
  await assert.rejects(service.exportCsv({}), AuditExportLimitError);
});
