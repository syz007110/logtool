const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
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

function setCommonCleanupEnv() {
  process.env.TMP_CLEANUP_DISABLED = 'false';
  process.env.FAULT_CASE_TMP_CLEANUP_DISABLED = 'true';
  process.env.TECH_SOLUTION_TMP_CLEANUP_DISABLED = 'true';
  process.env.MOTION_DATA_TMP_CLEANUP_DISABLED = 'true';
  process.env.TMP_CLEANUP_INTERVAL_MIN = '9999';
  process.env.TMP_CLEANUP_TTL_HOURS = '1';
}

test('temp cleaner deletes expired local agent assets', async () => {
  const oldEnv = { ...process.env };
  process.env.STORAGE = 'local';
  process.env.AGENT_ASSET_LOCAL_DIR = path.resolve(__dirname, '../uploads/agent-assets-test');
  setCommonCleanupEnv();

  clearModule('../src/config/storageMode');
  clearModule('../src/config/agentAssetStorage');
  clearModule('../src/services/tempCleanupService');
  const storage = loadFresh('../src/config/agentAssetStorage');
  const tempDir = storage.ensureTempDir();
  const oldFile = path.join(tempDir, 'old.txt');
  const freshFile = path.join(tempDir, 'fresh.txt');
  fs.writeFileSync(oldFile, 'old');
  fs.writeFileSync(freshFile, 'fresh');
  const now = Date.now();
  const oldDate = new Date(now - 2 * 60 * 60 * 1000);
  fs.utimesSync(oldFile, oldDate, oldDate);

  const { startTempCleanupJob } = loadFresh('../src/services/tempCleanupService');
  const job = startTempCleanupJob();
  await job.runOnce();
  job.stop();

  assert.equal(fs.existsSync(oldFile), false);
  assert.equal(fs.existsSync(freshFile), true);

  fs.rmSync(path.resolve(__dirname, '../uploads/agent-assets-test'), { recursive: true, force: true });
  process.env = oldEnv;
});

test('temp cleaner deletes expired oss agent assets by prefix', async () => {
  const oldEnv = { ...process.env };
  process.env.STORAGE = 'oss';
  process.env.AGENT_ASSET_TMP_PREFIX = 'agent-assets/tmp/';
  setCommonCleanupEnv();

  clearModule('../src/config/storageMode');
  clearModule('../src/config/agentAssetStorage');
  clearModule('../src/services/tempCleanupService');
  const storage = loadFresh('../src/config/agentAssetStorage');
  const deletedKeys = [];
  let listCalled = 0;
  storage.getOssClient = async () => ({
    list: async () => {
      listCalled += 1;
      return {
        objects: [{ name: 'agent-assets/tmp/2026/04/20/a.png', lastModified: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() }],
        isTruncated: false,
        nextMarker: null
      };
    },
    deleteMulti: async (keys) => {
      deletedKeys.push(...keys);
      return { deleted: keys.map((k) => ({ name: k })) };
    }
  });

  const { startTempCleanupJob } = loadFresh('../src/services/tempCleanupService');
  const job = startTempCleanupJob();
  await job.runOnce();
  job.stop();

  assert.equal(listCalled > 0, true);
  assert.deepEqual(deletedKeys, ['agent-assets/tmp/2026/04/20/a.png']);
  process.env = oldEnv;
});
