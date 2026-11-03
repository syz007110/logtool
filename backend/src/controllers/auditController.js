const { ulid } = require('ulid');
const { listPublicEventDefinitions } = require('../audit/eventDefinitions');
const { auditService } = require('../services/auditService');
const {
  AuditExportLimitError,
  AuditQueryValidationError,
  createAuditQueryService,
  filtersForAuditEvent,
  normalizeFilters
} = require('../services/auditQueryService');

const auditQueryService = createAuditQueryService();

function requestIdFor(req) {
  const candidate = String(req.requestId || req.headers?.['x-request-id'] || '').trim();
  return candidate.slice(0, 64) || ulid();
}

function sendError(res, status, code, message, requestId) {
  return res.status(status).json({ code, message, requestId });
}

function ensureRequestId(req, res, next) {
  req.requestId = requestIdFor(req);
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

async function recordExportFailure(req, filters, reasonCode) {
  try {
    await auditService.record(req, {
      eventCode: 'AUDIT.LOGS_EXPORTED',
      outcome: 'FAILURE',
      reasonCode,
      target: null,
      details: { filters, format: 'csv', exportedRowCount: null }
    });
  } catch (error) {
    console.error('[audit] failed to record export failure event', error);
  }
}

async function listAuditLogs(req, res) {
  try {
    return res.json(await auditQueryService.list(req.query));
  } catch (error) {
    if (error instanceof AuditQueryValidationError) {
      return sendError(res, 400, error.code, error.message, req.requestId);
    }
    console.error('[audit] list failed', error);
    return sendError(res, 500, 'INTERNAL_ERROR', '查询审计记录失败', req.requestId);
  }
}

async function exportAuditLogs(req, res) {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : null;
  if (!body || Object.keys(body).some((key) => !['filters', 'format'].includes(key)) || (body.format != null && body.format !== 'csv')) {
    return sendError(res, 400, 'AUDIT_QUERY_INVALID', '导出请求格式无效', req.requestId);
  }

  let result;
  try {
    result = await auditQueryService.exportCsv(body.filters || {});
  } catch (error) {
    if (error instanceof AuditQueryValidationError) {
      return sendError(res, 400, error.code, error.message, req.requestId);
    }
    if (error instanceof AuditExportLimitError) {
      // filters 已在服务中完成校验；用于失败审计的值只包含已允许的字段。
      const filters = normalizeFilters(body.filters || {});
      await recordExportFailure(req, filtersForAuditEvent(filters), 'AUDIT.EXPORT_LIMIT_EXCEEDED');
      return sendError(res, 422, error.code, error.message, req.requestId);
    }
    console.error('[audit] export generation failed', error);
    // 未能取得标准化筛选条件时使用空筛选条件，仍符合事件 details 白名单。
    await recordExportFailure(req, { from: null, to: null, eventCode: null, actorUserId: null, actorUsername: null }, 'AUDIT.EXPORT_GENERATION_FAILED');
    return sendError(res, 500, 'INTERNAL_ERROR', '导出审计记录失败', req.requestId);
  }

  try {
    // 写入成功审计记录必须发生在任何响应头或响应体提交之前。
    await auditService.record(req, {
      eventCode: 'AUDIT.LOGS_EXPORTED',
      outcome: 'SUCCESS',
      reasonCode: null,
      target: null,
      details: { filters: result.filters, format: 'csv', exportedRowCount: result.rowCount }
    });
  } catch (error) {
    console.error('[audit] export audit record failed', error);
    return sendError(res, 500, 'INTERNAL_ERROR', '导出审计记录失败', req.requestId);
  }

  const filename = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  res.status(200);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(result.csv);
}

function listAuditEventDefinitions(req, res) {
  return res.json({ items: listPublicEventDefinitions() });
}

module.exports = {
  ensureRequestId,
  exportAuditLogs,
  listAuditEventDefinitions,
  listAuditLogs
};
