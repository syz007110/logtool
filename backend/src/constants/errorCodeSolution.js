const ERROR_CODE_SOLUTION_VALUES = Object.freeze([
  'recoverable',
  'unrecoverable',
  'ignorable',
  'tip',
  'log'
]);

const LEGACY_ERROR_CODE_SOLUTION_ALIASES = Object.freeze({
  tips: 'tip'
});

const DEFAULT_ERROR_CODE_SOLUTION = 'tip';

function normalizeErrorCodeSolution(value, fallback = DEFAULT_ERROR_CODE_SOLUTION) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return fallback;

  const normalized = LEGACY_ERROR_CODE_SOLUTION_ALIASES[raw] || raw;
  if (!ERROR_CODE_SOLUTION_VALUES.includes(normalized)) {
    throw new Error(`无效的处理措施枚举值: ${raw}`);
  }
  return normalized;
}

function isErrorCodeSolution(value) {
  try {
    normalizeErrorCodeSolution(value);
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  DEFAULT_ERROR_CODE_SOLUTION,
  ERROR_CODE_SOLUTION_VALUES,
  normalizeErrorCodeSolution,
  isErrorCodeSolution
};
