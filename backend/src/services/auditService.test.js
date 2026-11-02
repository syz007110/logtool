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
    user: { id: 7, username: 'admin' },
    ip: '203.0.113.10',
    headers: {
      'x-request-id': 'req_01K8',
      'user-agent': 'LogtoolTest/1.0'
    }
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
