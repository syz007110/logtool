const TERMINAL_STATUSES = new Set(['completed', 'failed', 'degraded']);

const ALLOWED_TRANSITIONS = {
  queued: new Set(['running', 'failed']),
  running: new Set(['retry_wait', 'completed', 'failed', 'degraded']),
  retry_wait: new Set(['running', 'failed']),
  completed: new Set(),
  failed: new Set(),
  degraded: new Set()
};

function isStateDebugEnabled() {
  const raw = String(process.env.AGENT_RUNTIME_STATE_DEBUG || 'true').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function stateLog(event, payload = {}) {
  if (!isStateDebugEnabled()) return;
  console.log('[agent-runtime-state]', {
    event: String(event || ''),
    ...payload
  });
}

function canTransition(fromStatus, toStatus) {
  const from = String(fromStatus || '').trim();
  const to = String(toStatus || '').trim();
  const allowed = ALLOWED_TRANSITIONS[from];
  const result = Boolean(allowed && allowed.has(to));
  stateLog('CAN_TRANSITION', { fromStatus: from, toStatus: to, result });
  return result;
}

function assertTransition(fromStatus, toStatus) {
  const ok = canTransition(fromStatus, toStatus);
  if (!ok) {
    stateLog('TRANSITION_REJECTED', { fromStatus, toStatus, reason: 'illegal_transition' });
    throw new Error(`illegal task transition: ${fromStatus} -> ${toStatus}`);
  }
  stateLog('TRANSITION_ACCEPTED', { fromStatus, toStatus });
}

function isTerminalStatus(status) {
  const normalized = String(status || '').trim();
  const terminal = TERMINAL_STATUSES.has(normalized);
  stateLog('CHECK_TERMINAL', { status: normalized, terminal });
  return terminal;
}

module.exports = {
  canTransition,
  assertTransition,
  isTerminalStatus
};
