const assert = require('node:assert/strict');
const test = require('node:test');
const { AuditExportLimitError, AuditQueryValidationError } = require('./auditQueryService');
const { createAuditExportService } = require('./auditExportService');

const auditContext = Object.freeze({
  actor: { type: 'USER', userId: 7, username: 'admin' },
  request: { requestId: 'req_export', ip: '203.0.113.10', userAgent: 'Test/1.0' }
});
const filters = Object.freeze({ from: null, to: null, eventCode: null, actorUserId: null, actorUsername: null });

test('exports CSV and records success before returning the result', async () => {
  const records = [];
  const service = createAuditExportService({
    queryService: { exportCsv: async () => ({ csv: 'a,b\r\n', rowCount: 1, filters }) },
    audit: { record: async (...args) => { records.push(args); } }
  });

  const result = await service.exportCsv(auditContext, {});

  assert.equal(result.rowCount, 1);
  assert.equal(records.length, 1);
  assert.equal(records[0][0], auditContext);
  assert.deepEqual(records[0][1], {
    eventCode: 'AUDIT.LOGS_EXPORTED', outcome: 'SUCCESS', reasonCode: null, target: null,
    details: { filters, format: 'csv', exportedRowCount: 1 }
  });
});

test('records a failure when export exceeds its limit', async () => {
  const records = [];
  const service = createAuditExportService({
    queryService: { exportCsv: async () => { throw new AuditExportLimitError(10); } },
    audit: { record: async (...args) => { records.push(args); } }
  });

  await assert.rejects(service.exportCsv(auditContext, {}), AuditExportLimitError);

  assert.equal(records.length, 1);
  assert.equal(records[0][1].outcome, 'FAILURE');
  assert.equal(records[0][1].reasonCode, 'AUDIT.EXPORT_LIMIT_EXCEEDED');
  assert.equal(records[0][1].details.exportedRowCount, null);
});

test('does not audit an invalid export request', async () => {
  let recorded = false;
  const service = createAuditExportService({
    queryService: { exportCsv: async () => { throw new AuditQueryValidationError('invalid'); } },
    audit: { record: async () => { recorded = true; } }
  });

  await assert.rejects(service.exportCsv(auditContext, {}), AuditQueryValidationError);
  assert.equal(recorded, false);
});
