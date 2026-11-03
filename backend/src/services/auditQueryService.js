const { Op } = require('sequelize');
const AuditLog = require('../models/audit_log');
const { getEventDefinition } = require('../audit/eventDefinitions');

const MAX_PAGE_LIMIT = 100;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const DEFAULT_EXPORT_MAX_ROWS = 10_000;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

class AuditQueryValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuditQueryValidationError';
    this.code = 'AUDIT_QUERY_INVALID';
  }
}

class AuditExportLimitError extends Error {
  constructor(maxRows) {
    super('导出记录数超过允许上限');
    this.name = 'AuditExportLimitError';
    this.code = 'AUDIT_EXPORT_LIMIT_EXCEEDED';
    this.maxRows = maxRows;
  }
}

function asPlainObject(value, fieldName) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AuditQueryValidationError(`${fieldName} 必须是对象`);
  }
  return value;
}

function optionalString(value, fieldName, maxLength, { uppercase = false } = {}) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new AuditQueryValidationError(`${fieldName} 必须是字符串`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new AuditQueryValidationError(`${fieldName} 长度无效`);
  }
  return uppercase ? normalized.toUpperCase() : normalized;
}

function optionalDate(value, fieldName) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !ISO_DATE_TIME.test(value)) {
    throw new AuditQueryValidationError(`${fieldName} 必须是 UTC ISO 8601 时间`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AuditQueryValidationError(`${fieldName} 不是有效时间`);
  return date;
}

function optionalActorUserId(value) {
  if (value == null || value === '') return null;
  const normalized = String(value).trim();
  if (!/^[1-9][0-9]*$/.test(normalized) || !Number.isSafeInteger(Number(normalized)) || Number(normalized) > 2147483647) {
    throw new AuditQueryValidationError('actorUserId 必须是有效的内部用户 ID');
  }
  return normalized;
}

function parsePositiveInteger(value, fieldName, defaultValue, maximum) {
  if (value == null || value === '') return defaultValue;
  const normalized = String(value).trim();
  if (!/^[1-9][0-9]*$/.test(normalized)) {
    throw new AuditQueryValidationError(`${fieldName} 必须是正整数`);
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new AuditQueryValidationError(`${fieldName} 超出允许范围`);
  }
  return parsed;
}

function normalizeFilters(input) {
  const source = asPlainObject(input, 'filters');
  const allowedKeys = new Set(['from', 'to', 'eventCode', 'actorUserId', 'actorUsername']);
  for (const key of Object.keys(source)) {
    if (!allowedKeys.has(key)) throw new AuditQueryValidationError(`filters.${key} 不被支持`);
  }

  const from = optionalDate(source.from, 'from');
  const to = optionalDate(source.to, 'to');
  if (from && to && from >= to) throw new AuditQueryValidationError('from 必须早于 to');

  return {
    from,
    to,
    eventCode: optionalString(source.eventCode, 'eventCode', 100, { uppercase: true }),
    actorUserId: optionalActorUserId(source.actorUserId),
    actorUsername: optionalString(source.actorUsername, 'actorUsername', 100)
  };
}

function filtersFromListQuery(query) {
  const source = asPlainObject(query, 'query');
  const allowedKeys = new Set(['from', 'to', 'eventCode', 'actorUserId', 'actorUsername', 'page', 'limit']);
  for (const key of Object.keys(source)) {
    if (!allowedKeys.has(key)) throw new AuditQueryValidationError(`query.${key} 不被支持`);
  }
  return {
    from: source.from,
    to: source.to,
    eventCode: source.eventCode,
    actorUserId: source.actorUserId,
    actorUsername: source.actorUsername
  };
}

function filtersForAuditEvent(filters) {
  return {
    from: filters.from ? filters.from.toISOString() : null,
    to: filters.to ? filters.to.toISOString() : null,
    eventCode: filters.eventCode,
    actorUserId: filters.actorUserId,
    actorUsername: filters.actorUsername
  };
}

function buildWhere(filters) {
  const where = {};
  if (filters.from || filters.to) {
    where.occurred_at = {};
    if (filters.from) where.occurred_at[Op.gte] = filters.from;
    if (filters.to) where.occurred_at[Op.lt] = filters.to;
  }
  if (filters.eventCode) where.event_code = filters.eventCode;
  if (filters.actorUserId) where.actor_user_id = Number(filters.actorUserId);
  if (filters.actorUsername) where.actor_username = { [Op.like]: `%${filters.actorUsername}%` };
  return where;
}

function asValue(row) {
  return typeof row?.toJSON === 'function' ? row.toJSON() : row;
}

function parseDetails(details) {
  if (details && typeof details === 'object') return details;
  if (typeof details !== 'string') return {};
  try { return JSON.parse(details); } catch (_) { return {}; }
}

function mapAuditLog(row) {
  const source = asValue(row);
  const definition = getEventDefinition(source.event_code);
  const target = source.target_type == null && source.target_id == null
    ? null
    : { type: source.target_type, id: String(source.target_id) };

  return {
    eventId: source.event_id,
    schemaVersion: source.schema_version,
    occurredAt: new Date(source.occurred_at).toISOString(),
    eventCode: source.event_code,
    summary: definition.summary,
    category: source.category,
    outcome: source.outcome,
    reasonCode: source.reason_code,
    actor: {
      type: source.actor_type,
      userId: source.actor_user_id == null ? null : String(source.actor_user_id),
      username: source.actor_username
    },
    target,
    request: {
      requestId: source.request_id,
      ip: source.ip,
      userAgent: source.user_agent
    },
    details: parseDetails(source.details)
  };
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function createAuditCsv(items) {
  const headers = [
    'eventId', 'schemaVersion', 'occurredAt', 'eventCode', 'summary', 'category', 'outcome', 'reasonCode',
    'actorType', 'actorUserId', 'actorUsername', 'targetType', 'targetId',
    'requestId', 'ip', 'userAgent', 'details'
  ];
  const lines = [headers.join(',')];
  for (const item of items) {
    lines.push([
      item.eventId, item.schemaVersion, item.occurredAt, item.eventCode, item.summary, item.category, item.outcome, item.reasonCode,
      item.actor.type, item.actor.userId, item.actor.username, item.target?.type, item.target?.id,
      item.request?.requestId, item.request?.ip, item.request?.userAgent, JSON.stringify(item.details)
    ].map(csvCell).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

function configuredExportMaxRows(value = process.env.AUDIT_EXPORT_MAX_ROWS) {
  if (value == null || value === '') return DEFAULT_EXPORT_MAX_ROWS;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : DEFAULT_EXPORT_MAX_ROWS;
}

function createAuditQueryService({ auditLog = AuditLog, exportMaxRows = configuredExportMaxRows() } = {}) {
  async function list(query = {}) {
    const filters = normalizeFilters(filtersFromListQuery(query));
    const page = parsePositiveInteger(query.page, 'page', DEFAULT_PAGE, Number.MAX_SAFE_INTEGER);
    const limit = parsePositiveInteger(query.limit, 'limit', DEFAULT_LIMIT, MAX_PAGE_LIMIT);
    const { count, rows } = await auditLog.findAndCountAll({
      where: buildWhere(filters),
      order: [['occurred_at', 'DESC'], ['id', 'DESC']],
      offset: (page - 1) * limit,
      limit
    });
    return { items: rows.map(mapAuditLog), total: count, page, limit };
  }

  async function exportCsv(filterInput = {}) {
    const filters = normalizeFilters(filterInput);
    const rows = await auditLog.findAll({
      where: buildWhere(filters),
      order: [['occurred_at', 'DESC'], ['id', 'DESC']],
      limit: exportMaxRows + 1
    });
    if (rows.length > exportMaxRows) throw new AuditExportLimitError(exportMaxRows);
    const items = rows.map(mapAuditLog);
    return { csv: createAuditCsv(items), rowCount: items.length, filters: filtersForAuditEvent(filters) };
  }

  return { list, exportCsv };
}

module.exports = {
  AuditExportLimitError,
  AuditQueryValidationError,
  createAuditCsv,
  createAuditQueryService,
  filtersForAuditEvent,
  filtersFromListQuery,
  mapAuditLog,
  normalizeFilters
};
