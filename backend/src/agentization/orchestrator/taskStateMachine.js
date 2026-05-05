const TERMINAL_STATUSES = new Set(['completed', 'failed', 'degraded']);

const ALLOWED_TRANSITIONS = {
  queued: new Set(['running', 'failed']),
  running: new Set(['retry_wait', 'completed', 'failed', 'degraded']),
  retry_wait: new Set(['running', 'failed']),
  completed: new Set(),
  failed: new Set(),
  degraded: new Set()
};

function canTransition(fromStatus, toStatus) {
  const from = String(fromStatus || '').trim();
  const to = String(toStatus || '').trim();
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.has(to);
}

function assertTransition(fromStatus, toStatus) {
  if (!canTransition(fromStatus, toStatus)) {
    throw new Error(`illegal task transition: ${fromStatus} -> ${toStatus}`);
  }
}

function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(String(status || '').trim());
}

module.exports = {
  canTransition,
  assertTransition,
  isTerminalStatus
};
