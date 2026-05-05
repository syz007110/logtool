const RETRYABLE_ERROR_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'EAI_AGAIN',
  'TOOL_TIMEOUT',
  'UPSTREAM_5XX',
  'TOOL_RATE_LIMITED',
  'TASK_TIMEOUT'
]);

function isRetryableError(error) {
  if (!error) return false;
  if (error.retryable === true) return true;
  const code = String(error.code || '').trim().toUpperCase();
  if (RETRYABLE_ERROR_CODES.has(code)) return true;
  const status = Number(error.status || error.statusCode);
  if (Number.isFinite(status) && status >= 500 && status <= 599) return true;
  return false;
}

function computeBackoffMs(attempt, baseMs) {
  const safeAttempt = Math.max(1, Number(attempt) || 1);
  const safeBase = Math.max(1, Number(baseMs) || 1);
  const jitter = Math.floor(Math.random() * safeBase);
  return (safeBase * (2 ** (safeAttempt - 1))) + jitter;
}

module.exports = {
  isRetryableError,
  computeBackoffMs
};
