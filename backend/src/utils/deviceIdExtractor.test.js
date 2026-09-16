const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  validateDeviceId,
  extractDeviceIdFromPath,
  extractDeviceIdFromFileName
} = require('./deviceIdExtractor');

describe('validateDeviceId', () => {
  it('accepts alphanumeric ids with a single hyphen', () => {
    assert.equal(validateDeviceId('4371-01'), true);
    assert.equal(validateDeviceId('4372-8MMS'), true);
    assert.equal(validateDeviceId('5G-07'), true);
    assert.equal(validateDeviceId('ABC-12'), true);
    assert.equal(validateDeviceId('block4-4'), true);
    assert.equal(validateDeviceId('0000-00'), true);
  });

  it('rejects ids without exactly one hyphen group', () => {
    assert.equal(validateDeviceId('block44'), false);
    assert.equal(validateDeviceId('00-01-05-77-6a-09'), false);
    assert.equal(validateDeviceId(''), false);
    assert.equal(validateDeviceId(null), false);
  });
});

describe('extractDeviceIdFromPath', () => {
  it('prefers the innermost matching path segment', () => {
    assert.equal(extractDeviceIdFromPath('C:/logs/2024-01/block4-4/file.medbot'), 'block4-4');
    assert.equal(extractDeviceIdFromPath('D:/data/4371-01/2026080412_log.medbot'), '4371-01');
  });

  it('does not treat a MAC address as a device id', () => {
    assert.equal(extractDeviceIdFromPath('C:/keys/00-01-05-77-6a-09/log.medbot'), null);
  });
});

describe('extractDeviceIdFromFileName', () => {
  it('reads device id from archive or log names', () => {
    assert.equal(extractDeviceIdFromFileName('block4-4.zip'), 'block4-4');
    assert.equal(extractDeviceIdFromFileName('4371-01'), '4371-01');
  });
});
