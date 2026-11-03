const assert = require('node:assert/strict');
const test = require('node:test');
const jwt = require('jsonwebtoken');

const { createApp } = require('../../src/createApp');
const { sequelize } = require('../../src/models');
const { defineAssociations } = require('../../src/models/associations');
const User = require('../../src/models/user');
const Role = require('../../src/models/role');
const UserRole = require('../../src/models/user_role');
const AuditLog = require('../../src/models/audit_log');

const TEST_ADMIN_ID = 91001;
const TEST_USER_ID = 91002;
let server;
let baseUrl;

function tokenFor(user) {
  return jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '5m' });
}

async function request(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const contentType = response.headers.get('content-type') || '';
  return {
    status: response.status,
    headers: response.headers,
    body: contentType.includes('application/json') ? await response.json() : await response.text()
  };
}

async function insertSourceAuditRecord(sequence) {
  await AuditLog.create({
    event_id: `01J000000000000000000000${String(sequence).padStart(2, '0')}`,
    schema_version: 1,
    occurred_at: new Date(`2026-11-0${sequence}T01:02:03.000Z`),
    event_code: 'AUDIT.LOGS_EXPORTED',
    category: 'audit',
    outcome: 'SUCCESS',
    reason_code: null,
    actor_type: 'SYSTEM',
    actor_user_id: null,
    actor_username: null,
    target_type: null,
    target_id: null,
    request_id: null,
    ip: null,
    user_agent: null,
    details: {
      filters: { from: null, to: null, eventCode: null, actorUserId: null, actorUsername: null },
      format: 'csv',
      exportedRowCount: 0
    }
  });
}

async function resetDatabase() {
  await AuditLog.destroy({ where: {}, truncate: true });
  await UserRole.destroy({ where: { user_id: [TEST_ADMIN_ID, TEST_USER_ID] } });
  await User.destroy({ where: { id: [TEST_ADMIN_ID, TEST_USER_ID] } });

  const adminRole = await Role.findOne({ where: { code: 'super_admin' } });
  const userRole = await Role.findOne({ where: { code: 'user' } });
  assert.ok(adminRole, 'migration must create the super_admin role');
  assert.ok(userRole, 'bootstrap must create the user role');

  const admin = await User.create({ id: TEST_ADMIN_ID, username: 'audit-test-admin', password_hash: 'not-used-by-jwt-test' });
  const user = await User.create({ id: TEST_USER_ID, username: 'audit-test-user', password_hash: 'not-used-by-jwt-test' });
  await UserRole.bulkCreate([
    { user_id: admin.id, role_id: adminRole.id, created_at: new Date() },
    { user_id: user.id, role_id: userRole.id, created_at: new Date() }
  ]);
  return { admin, user };
}

test.before(async () => {
  defineAssociations();
  await sequelize.authenticate();
  const app = createApp({ testMode: true });
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await sequelize.close();
});

test('audit APIs enforce independent permissions', { concurrency: false }, async () => {
  const { user } = await resetDatabase();
  const response = await request('/api/audit-logs', { token: tokenFor(user) });

  assert.equal(response.status, 403);
  assert.equal(response.body.code, 'FORBIDDEN');
  assert.equal(response.body.requestId.length > 0, true);
});

test('invalid export requests return 400 without an audit side effect', { concurrency: false }, async () => {
  const { admin } = await resetDatabase();
  const response = await request('/api/audit-logs/export', {
    method: 'POST',
    token: tokenFor(admin),
    body: { format: 'xlsx' }
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'AUDIT_QUERY_INVALID');
  assert.equal(await AuditLog.count(), 0);
});

test('successful export returns CSV and writes SUCCESS before the response completes', { concurrency: false }, async () => {
  const { admin } = await resetDatabase();
  await insertSourceAuditRecord(1);
  const response = await request('/api/audit-logs/export', {
    method: 'POST',
    token: tokenFor(admin),
    body: { format: 'csv', filters: {} }
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/csv/);
  assert.match(response.body, /eventId,schemaVersion/);
  const auditEvent = await AuditLog.findOne({ where: { event_code: 'AUDIT.LOGS_EXPORTED', outcome: 'SUCCESS' }, order: [['id', 'DESC']] });
  assert.ok(auditEvent);
  assert.equal(auditEvent.target_type, null);
  assert.equal(auditEvent.details.exportedRowCount, 1);
});

test('export above the configured limit returns 422 and writes FAILURE', { concurrency: false }, async () => {
  const { admin } = await resetDatabase();
  await insertSourceAuditRecord(1);
  await insertSourceAuditRecord(2);
  const response = await request('/api/audit-logs/export', {
    method: 'POST',
    token: tokenFor(admin),
    body: { format: 'csv', filters: {} }
  });

  assert.equal(response.status, 422);
  assert.equal(response.body.code, 'AUDIT_EXPORT_LIMIT_EXCEEDED');
  const auditEvent = await AuditLog.findOne({ where: { event_code: 'AUDIT.LOGS_EXPORTED', outcome: 'FAILURE' }, order: [['id', 'DESC']] });
  assert.ok(auditEvent);
  assert.equal(auditEvent.reason_code, 'AUDIT.EXPORT_LIMIT_EXCEEDED');
  assert.equal(auditEvent.details.exportedRowCount, null);
});
