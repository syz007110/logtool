const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDecryptKeyCascade, DEFAULT_KEY } = require('./decryptUtils');

test('cascade with db key is db → user → default', () => {
  assert.deepEqual(
    buildDecryptKeyCascade({
      dbKey: 'db-key-value',
      userKey: 'user-key-value'
    }),
    [
      { key: 'db-key-value', source: 'db' },
      { key: 'user-key-value', source: 'user' },
      { key: DEFAULT_KEY, source: 'default' }
    ]
  );
});

test('cascade without db key is user → default', () => {
  assert.deepEqual(
    buildDecryptKeyCascade({
      dbKey: null,
      userKey: 'user-key-value'
    }),
    [
      { key: 'user-key-value', source: 'user' },
      { key: DEFAULT_KEY, source: 'default' }
    ]
  );
});

test('cascade skips empty user key', () => {
  assert.deepEqual(
    buildDecryptKeyCascade({
      dbKey: 'db-key-value',
      userKey: '   '
    }),
    [
      { key: 'db-key-value', source: 'db' },
      { key: DEFAULT_KEY, source: 'default' }
    ]
  );
});
