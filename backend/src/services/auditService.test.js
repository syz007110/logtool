const assert = require('node:assert/strict');
const test = require('node:test');

const { createAuditService, AuditValidationError } = require('./auditService');

function createServiceHarness() {
  const rows = [];
  const auditLog = {
    async create(row, options) {
      rows.push({ row, options });
      return row;
    }
  };

  const service = createAuditService({
    auditLog,
    generateEventId: () => '01K8ABCDEF1234567890ABCDEFG',
    now: () => new Date('2026-10-31T08:30:00.000Z')
  });

  return { service, rows };
}

test('records a role reassignment with request and actor context', async () => {
  const { service, rows } = createServiceHarness();

  await service.record({
    actor: { type: 'USER', userId: 7, username: 'admin' },
    request: { requestId: 'req_01K8', ip: '203.0.113.10', userAgent: 'LogtoolTest/1.0' }
  }, {
    eventCode: 'RBAC.USER_ROLE_REASSIGNED',
    outcome: 'SUCCESS',
    reasonCode: null,
    target: { type: 'USER', id: '101' },
    details: {
      before: { roleCodes: ['user'] },
      after: { roleCodes: ['reviewer'] }
    }
  });

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].row, {
    event_id: '01K8ABCDEF1234567890ABCDEFG',
    schema_version: 1,
    occurred_at: new Date('2026-10-31T08:30:00.000Z'),
    event_code: 'RBAC.USER_ROLE_REASSIGNED',
    category: 'rbac',
    outcome: 'SUCCESS',
    reason_code: null,
    actor_type: 'USER',
    actor_user_id: 7,
    actor_username: 'admin',
    target_type: 'USER',
    target_id: '101',
    request_id: 'req_01K8',
    ip: '203.0.113.10',
    user_agent: 'LogtoolTest/1.0',
    details: {
      before: { roleCodes: ['user'] },
      after: { roleCodes: ['reviewer'] }
    }
  });
});

test('rejects non-sensitive event details outside the event whitelist', async () => {
  const { service, rows } = createServiceHarness();

  await assert.rejects(
    service.record(null, {
      eventCode: 'RBAC.USER_ROLE_REASSIGNED',
      outcome: 'SUCCESS',
      reasonCode: null,
      target: { type: 'USER', id: '101' },
      details: {
        before: { roleCodes: ['user'] },
        after: { roleCodes: ['reviewer'] },
        unexpected: 'must-not-be-stored'
      }
    }),
    AuditValidationError
  );

  assert.equal(rows.length, 0);
});

test('removes sensitive detail fields before validating and persisting', async () => {
  const rows = [];
  const warnings = [];
  const service = createAuditService({
    auditLog: { create: async (row) => { rows.push(row); return row; } },
    generateEventId: () => '01K8ABCDEF1234567890ABCDEFG',
    now: () => new Date('2026-10-31T08:30:00.000Z'),
    logger: { warn: (...args) => warnings.push(args) }
  });

  await service.record(null, {
    eventCode: 'RBAC.USER_ROLE_REASSIGNED',
    outcome: 'SUCCESS',
    reasonCode: null,
    target: { type: 'USER', id: '101' },
    details: {
      before: { roleCodes: ['user'] },
      after: { roleCodes: ['reviewer'] },
      password: 'must-not-be-stored'
    }
  });

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].details, {
    before: { roleCodes: ['user'] },
    after: { roleCodes: ['reviewer'] }
  });
  assert.equal(warnings.length, 1);
});

test('requires the protected-super-admin reason code for a denied event', async () => {
  const { service, rows } = createServiceHarness();

  await assert.rejects(
    service.record(null, {
      eventCode: 'RBAC.LAST_SUPER_ADMIN_PROTECTED',
      outcome: 'DENIED',
      reasonCode: 'RBAC.UNRELATED_REASON',
      target: { type: 'USER', id: '1' },
      details: {
        context: {
          attemptedAction: 'USER_DEACTIVATE',
          remainingActiveSuperAdminCount: 1
        }
      }
    }),
    AuditValidationError
  );

  assert.equal(rows.length, 0);
});

test('records an audit export with an exact success details schema and no target', async () => {
  const { service, rows } = createServiceHarness();

  await service.record({
    actor: { type: 'USER', userId: 7, username: 'admin' },
    request: { requestId: 'req_export', ip: null, userAgent: null }
  }, {
    eventCode: 'AUDIT.LOGS_EXPORTED',
    outcome: 'SUCCESS',
    reasonCode: null,
    target: null,
    details: {
      filters: {
        from: '2026-10-31T00:00:00.000Z',
        to: '2026-11-01T00:00:00.000Z',
        eventCode: null,
        actorUserId: null,
        actorUsername: null
      },
      format: 'csv',
      exportedRowCount: 42
    }
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].row.event_code, 'AUDIT.LOGS_EXPORTED');
  assert.equal(rows[0].row.category, 'audit');
  assert.equal(rows[0].row.target_type, null);
  assert.equal(rows[0].row.target_id, null);
  assert.equal(rows[0].row.details.exportedRowCount, 42);
});

test('rejects audit export details outside the event schema and non-null targets', async () => {
  const { service, rows } = createServiceHarness();
  const details = {
    filters: {
      from: null,
      to: null,
      eventCode: null,
      actorUserId: null,
      actorUsername: null
    },
    format: 'csv',
    exportedRowCount: 1
  };

  await assert.rejects(
    service.record(null, {
      eventCode: 'AUDIT.LOGS_EXPORTED',
      outcome: 'SUCCESS',
      reasonCode: null,
      target: { type: 'AUDIT_LOG', id: 'fake' },
      details
    }),
    AuditValidationError
  );

  await assert.rejects(
    service.record(null, {
      eventCode: 'AUDIT.LOGS_EXPORTED',
      outcome: 'SUCCESS',
      reasonCode: null,
      target: null,
      details: { ...details, unexpected: true }
    }),
    AuditValidationError
  );

  assert.equal(rows.length, 0);
});

test('requires null exportedRowCount for failed audit exports', async () => {
  const { service, rows } = createServiceHarness();
  const filters = {
    from: null,
    to: null,
    eventCode: null,
    actorUserId: null,
    actorUsername: null
  };

  await assert.rejects(
    service.record(null, {
      eventCode: 'AUDIT.LOGS_EXPORTED',
      outcome: 'FAILURE',
      reasonCode: 'AUDIT.EXPORT_LIMIT_EXCEEDED',
      target: null,
      details: { filters, format: 'csv', exportedRowCount: 0 }
    }),
    AuditValidationError
  );

  await service.record(null, {
    eventCode: 'AUDIT.LOGS_EXPORTED',
    outcome: 'FAILURE',
    reasonCode: 'AUDIT.EXPORT_LIMIT_EXCEEDED',
    target: null,
    details: { filters, format: 'csv', exportedRowCount: null }
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].row.reason_code, 'AUDIT.EXPORT_LIMIT_EXCEEDED');
});
