const { ulid } = require('ulid');
const { listPublicEventDefinitions } = require('../audit/eventDefinitions');
const { fromHttpRequest } = require('../audit/httpAuditContext');
const {
  AuditExportLimitError,
  AuditQueryValidationError,
  createAuditQueryService
} = require('../services/auditQueryService');
const { createAuditExportService } = require('../services/auditExportService');

const auditQueryService = createAuditQueryService();
const auditExportService = createAuditExportService({ queryService: auditQueryService });

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
    result = await auditExportService.exportCsv(fromHttpRequest(req), body.filters || {});
  } catch (error) {
    if (error instanceof AuditQueryValidationError) {
      return sendError(res, 400, error.code, error.message, req.requestId);
    }
    if (error instanceof AuditExportLimitError) {
      return sendError(res, 422, error.code, error.message, req.requestId);
    }
    console.error('[audit] export generation failed', error);
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
