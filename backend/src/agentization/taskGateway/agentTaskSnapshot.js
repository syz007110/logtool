function parseRequestSnapshot(taskRow) {
  const raw = taskRow?.request_snapshot;
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch (_) {
    return {};
  }
}

function isDeferredChannelDelivery(taskRow) {
  const snapshot = parseRequestSnapshot(taskRow);
  return snapshot?.delivery?.deferred === true;
}

module.exports = {
  parseRequestSnapshot,
  isDeferredChannelDelivery
};
