const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isValidLogFileName,
  isSystemInfoName,
  extractDeviceIdFromText,
  extractMacAddressFromText,
  resolveNextAction,
  buildSummaryMessage
} = require('./attachmentScanHelper');

test('isValidLogFileName validates strict medbot names', () => {
  assert.equal(isValidLogFileName('2026080412_log.medbot'), true);
  assert.equal(isValidLogFileName('2026080412.medbot'), false);
});

test('isSystemInfoName matches systeminfo file name', () => {
  assert.equal(isSystemInfoName('SystemInfo.txt'), true);
  assert.equal(isSystemInfoName('system.txt'), false);
});

test('extractors read device id and key from text', () => {
  assert.equal(extractDeviceIdFromText('设备编号 4371-01'), '4371-01');
  assert.equal(extractMacAddressFromText('密钥 00-01-05-77-6a-09'), '00-01-05-77-6a-09');
});

test('resolveNextAction picks required follow-up', () => {
  assert.equal(resolveNextAction({ logsFound: 2, logsReady: 0, logsMissingKey: 0, logsMissingDeviceId: 1 }), 'ask_for_device_id');
  assert.equal(resolveNextAction({ logsFound: 2, logsReady: 1, logsMissingKey: 1, logsMissingDeviceId: 0 }), 'ask_for_key');
  assert.equal(resolveNextAction({ logsFound: 2, logsReady: 2, logsMissingKey: 0, logsMissingDeviceId: 0 }), 'continue');
});

test('buildSummaryMessage does not report missing key when no logs were found', () => {
  assert.equal(
    buildSummaryMessage({
      logsFound: 0,
      logsReady: 0,
      logsMissingKey: 0,
      logsMissingDeviceId: 0,
      deviceId: null,
      keyStatus: null
    }),
    '未识别到可处理的日志文件，当前附件不是可上传的日志文件或日志压缩包。'
  );
});
