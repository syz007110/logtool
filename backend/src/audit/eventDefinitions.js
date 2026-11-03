const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { AuditValidationError } = require('./validation');

const OUTCOMES = new Set(['SUCCESS', 'DENIED', 'FAILURE']);
const ACTOR_TYPES = new Set(['USER', 'ANONYMOUS', 'SYSTEM']);
const TARGET_TYPES = new Set(['USER', 'ROLE', 'PERMISSION', 'CONFIG', 'AUDIT_LOG', 'REPORT', 'DATA_RECORD']);
const TARGET_POLICIES = Object.freeze({
  REQUIRED: 'REQUIRED',
  OPTIONAL: 'OPTIONAL',
  NONE: 'NONE'
});

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);

const NON_EMPTY_STRING = Object.freeze({ type: 'string', minLength: 1, maxLength: 100, pattern: '\\S' });
const ROLE_CODES_SCHEMA = Object.freeze({
  type: 'array',
  minItems: 1,
  items: { type: 'string', minLength: 1, maxLength: 50, pattern: '\\S' }
});

const EXPORT_FILTERS_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['from', 'to', 'eventCode', 'actorUserId', 'actorUsername'],
  properties: {
    from: { type: ['string', 'null'], format: 'date-time' },
    to: { type: ['string', 'null'], format: 'date-time' },
    eventCode: { type: ['string', 'null'], minLength: 1, maxLength: 100 },
    actorUserId: { type: ['string', 'null'], pattern: '^[1-9][0-9]*$' },
    actorUsername: { type: ['string', 'null'], minLength: 1, maxLength: 100 }
  }
});

function createExportDetailsSchema(exportedRowCount) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['filters', 'format', 'exportedRowCount'],
    properties: {
      filters: EXPORT_FILTERS_SCHEMA,
      format: { const: 'csv' },
      exportedRowCount
    }
  };
}

function formatSchemaErrors(errors = []) {
  return errors
    .map((error) => `${error.instancePath || 'details'} ${error.message || 'is invalid'}`)
    .join('; ');
}

function createEventDefinition({ category, summary, targetPolicy, allowedTargetTypes = [], outcomes }) {
  if (!Object.values(TARGET_POLICIES).includes(targetPolicy)) {
    throw new Error(`Unsupported audit target policy: ${targetPolicy}`);
  }

  const compiledOutcomes = Object.fromEntries(
    Object.entries(outcomes).map(([outcome, outcomeDefinition]) => {
      if (!OUTCOMES.has(outcome)) {
        throw new Error(`Unsupported audit outcome in definition: ${outcome}`);
      }

      const validate = ajv.compile(outcomeDefinition.detailsSchema);
      return [outcome, Object.freeze({
        reasonCodes: new Set(outcomeDefinition.reasonCodes),
        validate
      })];
    })
  );

  return Object.freeze({
    category,
    summary,
    targetPolicy,
    allowedTargetTypes: new Set(allowedTargetTypes),
    outcomes: Object.freeze(compiledOutcomes),
    validateDetails(details, outcome) {
      const outcomeDefinition = compiledOutcomes[outcome];
      if (!outcomeDefinition?.validate(details)) {
        throw new AuditValidationError(`details does not match the ${outcome} schema: ${formatSchemaErrors(outcomeDefinition?.validate.errors)}`);
      }
      return details;
    }
  });
}

const AUDIT_EVENT_DEFINITIONS = Object.freeze({
  'RBAC.ROLE_CREATED': createEventDefinition({ category: 'rbac', summary: '创建自定义角色', targetPolicy: TARGET_POLICIES.REQUIRED, allowedTargetTypes: ['ROLE'], outcomes: { SUCCESS: { reasonCodes: [null], detailsSchema: { type: 'object', additionalProperties: false, required: ['roleCode'], properties: { roleCode: NON_EMPTY_STRING } } } } }),
  'RBAC.ROLE_UPDATED': createEventDefinition({ category: 'rbac', summary: '更新角色', targetPolicy: TARGET_POLICIES.REQUIRED, allowedTargetTypes: ['ROLE'], outcomes: { SUCCESS: { reasonCodes: [null], detailsSchema: { type: 'object', additionalProperties: false, required: ['roleCode'], properties: { roleCode: NON_EMPTY_STRING } } } } }),
  'RBAC.ROLE_DELETED': createEventDefinition({ category: 'rbac', summary: '删除角色', targetPolicy: TARGET_POLICIES.REQUIRED, allowedTargetTypes: ['ROLE'], outcomes: { SUCCESS: { reasonCodes: [null], detailsSchema: { type: 'object', additionalProperties: false, required: ['roleCode'], properties: { roleCode: NON_EMPTY_STRING } } } } }),
  'RBAC.ROLE_PERMISSIONS_UPDATED': createEventDefinition({ category: 'rbac', summary: '更新角色权限', targetPolicy: TARGET_POLICIES.REQUIRED, allowedTargetTypes: ['ROLE'], outcomes: { SUCCESS: { reasonCodes: [null], detailsSchema: { type: 'object', additionalProperties: false, required: ['before', 'after'], properties: { before: { type: 'object' }, after: { type: 'object' } } } } } }),
  'RBAC.USER_ROLE_REASSIGNED': createEventDefinition({
    category: 'rbac',
    summary: '用户角色重新分配',
    targetPolicy: TARGET_POLICIES.REQUIRED,
    allowedTargetTypes: ['USER'],
    outcomes: {
      SUCCESS: {
        reasonCodes: [null],
        detailsSchema: {
          type: 'object',
          additionalProperties: false,
          required: ['before', 'after'],
          properties: {
            before: {
              type: 'object',
              additionalProperties: false,
              required: ['roleCodes'],
              properties: { roleCodes: ROLE_CODES_SCHEMA }
            },
            after: {
              type: 'object',
              additionalProperties: false,
              required: ['roleCodes'],
              properties: { roleCodes: ROLE_CODES_SCHEMA }
            }
          }
        }
      }
    }
  }),
  'RBAC.SUPER_ADMIN_ROLE_REASSIGNED': createEventDefinition({
    category: 'rbac', summary: '重新分配超级管理员角色', targetPolicy: TARGET_POLICIES.REQUIRED, allowedTargetTypes: ['USER'], outcomes: { SUCCESS: { reasonCodes: [null], detailsSchema: { type: 'object', additionalProperties: false, required: ['before', 'after'], properties: { before: { type: 'object', additionalProperties: false, required: ['roleCodes'], properties: { roleCodes: ROLE_CODES_SCHEMA } }, after: { type: 'object', additionalProperties: false, required: ['roleCodes'], properties: { roleCodes: ROLE_CODES_SCHEMA } } } } } }
  }),
  'RBAC.LAST_SUPER_ADMIN_PROTECTED': createEventDefinition({
    category: 'rbac',
    summary: '保护最后一个超级管理员',
    targetPolicy: TARGET_POLICIES.REQUIRED,
    allowedTargetTypes: ['USER'],
    outcomes: {
      DENIED: {
        reasonCodes: ['RBAC.LAST_SUPER_ADMIN_PROTECTED'],
        detailsSchema: {
          type: 'object',
          additionalProperties: false,
          required: ['context'],
          properties: {
            context: {
              type: 'object',
              additionalProperties: false,
              required: ['attemptedAction', 'remainingActiveSuperAdminCount'],
              properties: {
                attemptedAction: NON_EMPTY_STRING,
                remainingActiveSuperAdminCount: { type: 'integer', minimum: 1 }
              }
            }
          }
        }
      }
    }
  }),
  'AUDIT.LOGS_EXPORTED': createEventDefinition({
    category: 'audit',
    summary: '导出审计记录',
    targetPolicy: TARGET_POLICIES.NONE,
    outcomes: {
      SUCCESS: {
        reasonCodes: [null],
        detailsSchema: createExportDetailsSchema({ type: 'integer', minimum: 0 })
      },
      FAILURE: {
        reasonCodes: ['AUDIT.EXPORT_LIMIT_EXCEEDED', 'AUDIT.EXPORT_GENERATION_FAILED'],
        detailsSchema: createExportDetailsSchema({ type: 'null' })
      }
    }
  })
});

function getEventDefinition(eventCode) {
  const definition = AUDIT_EVENT_DEFINITIONS[eventCode];
  if (!definition) {
    throw new AuditValidationError(`Unsupported audit eventCode: ${eventCode}`);
  }
  return definition;
}

function listPublicEventDefinitions() {
  return Object.entries(AUDIT_EVENT_DEFINITIONS).map(([eventCode, definition]) => ({
    eventCode,
    category: definition.category,
    summary: definition.summary
  }));
}

module.exports = {
  ACTOR_TYPES,
  AUDIT_EVENT_DEFINITIONS,
  OUTCOMES,
  TARGET_POLICIES,
  TARGET_TYPES,
  getEventDefinition,
  listPublicEventDefinitions
};
