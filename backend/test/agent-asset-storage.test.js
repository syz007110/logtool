const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

function loadFresh(modulePath) {
  const full = require.resolve(modulePath);
  delete require.cache[full];
  return require(modulePath);
}

function clearModule(modulePath) {
  try {
    const full = require.resolve(modulePath);
    delete require.cache[full];
  } catch (_) {}
}

test('agentAssetStorage builds local temp paths and oss temp object key', () => {
  const oldEnv = { ...process.env };
  process.env.STORAGE = 'local';
  process.env.AGENT_ASSET_OSS_PREFIX = 'agent-assets/';
  process.env.AGENT_ASSET_TMP_PREFIX = 'agent-assets/tmp/';
  process.env.AGENT_ASSET_PUBLIC_BASE = '/static/agent-assets';

  clearModule('../src/config/storageMode');
  clearModule('../src/config/agentAssetStorage');
  const storage = loadFresh('../src/config/agentAssetStorage');
  const tempDir = storage.ensureTempDir();

  assert.equal(storage.STORAGE, 'local');
  assert.equal(storage.buildTempLocalUrl('a.png'), '/static/agent-assets/tmp/a.png');
  assert.ok(tempDir.endsWith(path.join('uploads', 'agent-assets', 'tmp')));

  const objectKey = storage.buildTempOssObjectKey('a.png');
  assert.match(objectKey, /^agent-assets\/tmp\/\d{4}\/\d{2}\/\d{2}\/a\.png$/);

  process.env = oldEnv;
});
