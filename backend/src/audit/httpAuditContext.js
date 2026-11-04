const { ulid } = require('ulid');

function compactString(value, maxLength) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function fromHttpRequest(req, { generateRequestId = ulid } = {}) {
  const userId = Number(req?.user?.id);
  const requestId = compactString(
    req?.requestId || req?.id || req?.headers?.['x-request-id'],
    64
  ) || generateRequestId();

  return {
    actor: Number.isInteger(userId) && userId > 0
      ? { type: 'USER', userId, username: compactString(req.user?.username, 100) }
      : { type: req ? 'ANONYMOUS' : 'SYSTEM', userId: null, username: null },
    request: {
      requestId,
      ip: compactString(req?.ip, 45),
      userAgent: compactString(req?.get?.('user-agent') || req?.headers?.['user-agent'], 4096)
    }
  };
}

module.exports = { fromHttpRequest };
