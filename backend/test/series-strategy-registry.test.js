const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const registryPath = path.resolve(__dirname, '../src/seriesStrategies/registry.js');
const { CAPABILITIES } = require('../src/seriesStrategies/capabilities');

test('SR supports motion_parse and surgery_analyze', () => {
  delete require.cache[registryPath];
  const { resolve, getCapabilities } = require(registryPath);
  assert.equal(resolve('SR', CAPABILITIES.MOTION_PARSE).supported, true);
  assert.equal(resolve('sr', CAPABILITIES.SURGERY_ANALYZE).supported, true);
  assert.deepEqual(getCapabilities('SR'), {
    motion_parse: true,
    surgery_analyze: true
  });
});

test('unknown series is unsupported for both capabilities', () => {
  delete require.cache[registryPath];
  const { resolve, getCapabilities } = require(registryPath);
  assert.equal(resolve('SA', CAPABILITIES.MOTION_PARSE).supported, false);
  assert.equal(resolve('SA', CAPABILITIES.SURGERY_ANALYZE).supported, false);
  assert.deepEqual(getCapabilities('SA'), {
    motion_parse: false,
    surgery_analyze: false
  });
});

test('assertSeriesCapability throws SERIES_FEATURE_UNSUPPORTED for SA', () => {
  delete require.cache[registryPath];
  const { assertSeriesCapability } = require(registryPath);
  assert.throws(
    () => assertSeriesCapability('SA', CAPABILITIES.MOTION_PARSE),
    (err) => err && err.code === 'SERIES_FEATURE_UNSUPPORTED' && err.statusCode === 403
  );
});

test('assertSeriesCapability returns strategy for SR', () => {
  delete require.cache[registryPath];
  const { assertSeriesCapability } = require(registryPath);
  const strategy = assertSeriesCapability('SR', CAPABILITIES.MOTION_PARSE);
  assert.equal(strategy.supported, true);
  assert.equal(strategy.id, 'sr-motion-parse');
});
