const { AuditValidationError, assertExactObject, assertNonEmptyString, assertStringArray } = require('./validation');

const OUTCOMES = new Set(['SUCCESS', 'DENIED', 'FAILURE']);
const ACTOR_TYPES = new Set(['USER', 'ANONYMOUS', 'SYSTEM']);
const TARGET_TYPES = new Set(['USER', 'ROLE', 'PERMISSION', 'CONFIG', 'AUDIT_LOG', 'REPORT', 'DATA_RECORD']);

function validateRoleReassignmentDetails(details) {
  assertExactObject(details, ['before', 'after'], 'details');
  assertExactObject(details.before, ['roleCodes'], 'details.before');
  assertExactObject(details.after, ['roleCodes'], 'details.after');

  return {
    before: { roleCodes: assertStringArray(details.before.roleCodes, 'details.before.roleCodes') },
    after: { roleCodes: assertStringArray(details.after.roleCodes, 'details.after.roleCodes') }
  };
}

function validateLastSuperAdminProtectedDetails(details) {
  assertExactObject(details, ['context'], 'details');
  assertExactObject(details.context, ['attemptedAction', 'remainingActiveSuperAdminCount'], 'details.context');

  const count = details.context.remainingActiveSuperAdminCount;
  if (!Number.isInteger(count) || count < 1) {
    throw new AuditValidationError('details.context.remainingActiveSuperAdminCount must be a positive integer');
  }

  return {
    context: {
      attemptedAction: assertNonEmptyString(details.context.attemptedAction, 'details.context.attemptedAction'),
      remainingActiveSuperAdminCount: count
    }
  };
}

const AUDIT_EVENT_DEFINITIONS = Object.freeze({
  'RBAC.USER_ROLE_REASSIGNED': Object.freeze({
    category: 'rbac',
    allowedOutcomes: new Set(['SUCCESS']),
    allowedReasonCodes: new Set(),
    allowedTargetTypes: new Set(['USER']),
    validateDetails: validateRoleReassignmentDetails
  }),
  'RBAC.LAST_SUPER_ADMIN_PROTECTED': Object.freeze({
    category: 'rbac',
    allowedOutcomes: new Set(['DENIED']),
    allowedReasonCodes: new Set(['RBAC.LAST_SUPER_ADMIN_PROTECTED']),
    allowedTargetTypes: new Set(['USER']),
    validateDetails: validateLastSuperAdminProtectedDetails
  })
});

function getEventDefinition(eventCode) {
  const definition = AUDIT_EVENT_DEFINITIONS[eventCode];
  if (!definition) {
    throw new AuditValidationError(`Unsupported audit eventCode: ${eventCode}`);
  }
  return definition;
}

module.exports = {
  ACTOR_TYPES,
  AUDIT_EVENT_DEFINITIONS,
  OUTCOMES,
  TARGET_TYPES,
  getEventDefinition
};
