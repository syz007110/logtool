const { ulid } = require('ulid');
const AuditLog = require('../models/audit_log');
const { ACTOR_TYPES, OUTCOMES, TARGET_POLICIES, TARGET_TYPES, getEventDefinition } = require('../audit/eventDefinitions');
const { AuditValidationError, assertNonEmptyString, isPlainObject } = require('../audit/validation');

const SCHEMA_VERSION = 1;
const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'oldpassword',
  'newpassword',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'cookie',
  'captcha',
  'captchaanswer',
  'dingtalkauthcode',
  'authorizationcode',
  'mobile',
  'unionid'
]);

function compactString(value, maxLength) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function sanitizeSensitiveValues(value, path = 'details', removed = []) {
  if (Array.isArray(value)) {
    return value.map((entry, index) => sanitizeSensitiveValues(entry, `${path}[${index}]`, removed));
  }

  if (!isPlainObject(value)) return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => {
        const sensitive = SENSITIVE_KEYS.has(key.toLowerCase());
        if (sensitive) removed.push(`${path}.${key}`);
        return !sensitive;
      })
      .map(([key, nestedValue]) => [key, sanitizeSensitiveValues(nestedValue, `${path}.${key}`, removed)])
  );
}

function buildActor(auditContext) {
  const source = auditContext?.actor || { type: 'SYSTEM', userId: null, username: null };
  const actorType = String(source.type || '').trim().toUpperCase();
  if (!ACTOR_TYPES.has(actorType)) throw new AuditValidationError('actor.type is invalid');
  const userId = Number(source.userId);
  if (actorType === 'USER' && (!Number.isInteger(userId) || userId <= 0)) {
    throw new AuditValidationError('actor.userId is required for USER actor');
  }
  return {
    actor_type: actorType,
    actor_user_id: actorType === 'USER' ? userId : null,
    actor_username: compactString(source.username, 100)
  };
}

function buildRequest(auditContext, generateEventId) {
  const source = auditContext?.request;
  if (!source) return { request_id: null, ip: null, user_agent: null };
  return {
    request_id: compactString(source.requestId, 64) || generateEventId(),
    ip: compactString(source.ip, 45),
    user_agent: compactString(source.userAgent, 4096)
  };
}

function buildTarget(target, definition) {
  if (definition.targetPolicy === TARGET_POLICIES.NONE) {
    if (target != null) {
      throw new AuditValidationError('target must be null for this event');
    }
    return { target_type: null, target_id: null };
  }

  if (target == null && definition.targetPolicy === TARGET_POLICIES.OPTIONAL) {
    return { target_type: null, target_id: null };
  }

  if (!isPlainObject(target)) {
    throw new AuditValidationError('target must be an object');
  }

  const targetType = assertNonEmptyString(target.type, 'target.type', 32).toUpperCase();
  const targetId = assertNonEmptyString(String(target.id ?? ''), 'target.id', 128);

  if (!TARGET_TYPES.has(targetType) || !definition.allowedTargetTypes.has(targetType)) {
    throw new AuditValidationError(`target.type is not allowed for this event: ${targetType}`);
  }

  return { target_type: targetType, target_id: targetId };
}

function validateEventInput(input) {
  if (!isPlainObject(input)) {
    throw new AuditValidationError('audit event input must be an object');
  }

  const eventCode = assertNonEmptyString(input.eventCode, 'eventCode', 100).toUpperCase();
  const definition = getEventDefinition(eventCode);
  const outcome = assertNonEmptyString(input.outcome, 'outcome', 16).toUpperCase();

  const outcomeDefinition = definition.outcomes[outcome];
  if (!OUTCOMES.has(outcome) || !outcomeDefinition) {
    throw new AuditValidationError(`outcome is not allowed for ${eventCode}: ${outcome}`);
  }

  const reasonCode = input.reasonCode == null ? null : assertNonEmptyString(input.reasonCode, 'reasonCode', 100).toUpperCase();
  if (!outcomeDefinition.reasonCodes.has(reasonCode)) {
    throw new AuditValidationError(`reasonCode is not allowed for ${eventCode}: ${reasonCode}`);
  }

  return { eventCode, definition, outcome, reasonCode };
}

function createAuditService({ auditLog = AuditLog, generateEventId = ulid, now = () => new Date(), logger = console } = {}) {
  async function record(auditContext, input, { transaction } = {}) {
    const { eventCode, definition, outcome, reasonCode } = validateEventInput(input);
    const removedSensitiveValues = [];
    const sanitizedInputDetails = sanitizeSensitiveValues(input.details, 'details', removedSensitiveValues);
    const sanitizedDetails = definition.validateDetails(sanitizedInputDetails, outcome);
    const target = buildTarget(input.target, definition);
    const actor = buildActor(auditContext);
    const request = buildRequest(auditContext, generateEventId);

    if (removedSensitiveValues.length > 0) {
      logger.warn?.('[audit] sensitive fields removed before persistence', { eventCode, paths: removedSensitiveValues });
    }

    const row = {
      event_id: generateEventId(),
      schema_version: SCHEMA_VERSION,
      occurred_at: now(),
      event_code: eventCode,
      category: definition.category,
      outcome,
      reason_code: reasonCode,
      ...actor,
      ...target,
      ...request,
      details: sanitizedDetails
    };

    return auditLog.create(row, transaction ? { transaction } : undefined);
  }

  return { record };
}

const auditService = createAuditService();

module.exports = {
  ACTOR_TYPES,
  AuditValidationError,
  SCHEMA_VERSION,
  createAuditService,
  auditService
};
