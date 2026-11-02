class AuditValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuditValidationError';
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertExactObject(value, allowedKeys, path) {
  if (!isPlainObject(value)) {
    throw new AuditValidationError(`${path} must be an object`);
  }

  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      throw new AuditValidationError(`${path}.${key} is not allowed`);
    }
  }
}

function assertNonEmptyString(value, path, maxLength = 100) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new AuditValidationError(`${path} must be a non-empty string with at most ${maxLength} characters`);
  }
  return value.trim();
}

function assertStringArray(value, path) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AuditValidationError(`${path} must be a non-empty string array`);
  }
  return value.map((entry, index) => assertNonEmptyString(entry, `${path}[${index}]`, 50));
}

module.exports = {
  AuditValidationError,
  assertExactObject,
  assertNonEmptyString,
  assertStringArray,
  isPlainObject
};
