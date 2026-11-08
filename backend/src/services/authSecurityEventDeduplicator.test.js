const test = require('node:test');
const assert = require('node:assert/strict');
const { REFRESH_TOKEN_REUSE_TTL_SECONDS, keyForRefreshTokenReuse, shouldRecordRefreshTokenReuse } = require('./authSecurityEventDeduplicator');

test('refresh-token reuse audit is recorded once per user and five-minute window', async () => {
  const calls = [];
  const cache = { isConnected: true, cacheConfig: { enabled: true }, client: { set: async (...args) => { calls.push(args); return calls.length === 1 ? 'OK' : null; } } };
  assert.equal(await shouldRecordRefreshTokenReuse(42, { cache }), true);
  assert.equal(await shouldRecordRefreshTokenReuse(42, { cache }), false);
  assert.deepEqual(calls[0], [keyForRefreshTokenReuse(42), '1', { NX: true, EX: REFRESH_TOKEN_REUSE_TTL_SECONDS }]);
});

test('refresh-token reuse audit fails open when Redis is unavailable', async () => {
  assert.equal(await shouldRecordRefreshTokenReuse(42, { cache: { isConnected: false } }), true);
  assert.equal(await shouldRecordRefreshTokenReuse(42, { cache: { isConnected: true, cacheConfig: { enabled: true }, client: { set: async () => { throw new Error('down'); } } } }), true);
});
