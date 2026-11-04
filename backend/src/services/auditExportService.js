const {
  AuditExportLimitError,
  AuditQueryValidationError,
  createAuditQueryService,
  filtersForAuditEvent,
  normalizeFilters
} = require('./auditQueryService');
const { auditService } = require('./auditService');

const EMPTY_FILTERS = Object.freeze({
  from: null,
  to: null,
  eventCode: null,
  actorUserId: null,
  actorUsername: null
});

function exportEvent({ outcome, reasonCode = null, filters, exportedRowCount }) {
  return {
    eventCode: 'AUDIT.LOGS_EXPORTED',
    outcome,
    reasonCode,
    target: null,
    details: { filters, format: 'csv', exportedRowCount }
  };
}

function createAuditExportService({ queryService = createAuditQueryService(), audit = auditService } = {}) {
  async function recordFailure(auditContext, filters, reasonCode) {
    try {
      await audit.record(auditContext, exportEvent({
        outcome: 'FAILURE',
        reasonCode,
        filters,
        exportedRowCount: null
      }));
    } catch (error) {
      console.error('[audit] failed to record export failure event', error);
    }
  }

  async function exportCsv(auditContext, filterInput = {}) {
    let result;
    try {
      result = await queryService.exportCsv(filterInput);
    } catch (error) {
      if (error instanceof AuditQueryValidationError) throw error;
      if (error instanceof AuditExportLimitError) {
        await recordFailure(auditContext, filtersForAuditEvent(normalizeFilters(filterInput)), 'AUDIT.EXPORT_LIMIT_EXCEEDED');
        throw error;
      }
      await recordFailure(auditContext, EMPTY_FILTERS, 'AUDIT.EXPORT_GENERATION_FAILED');
      throw error;
    }

    await audit.record(auditContext, exportEvent({
      outcome: 'SUCCESS',
      filters: result.filters,
      exportedRowCount: result.rowCount
    }));
    return result;
  }

  return { exportCsv };
}

module.exports = { createAuditExportService };
