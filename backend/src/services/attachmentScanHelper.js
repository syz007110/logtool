const path = require('path');

const LOG_FILE_REGEX = /^\d{10}_log\.medbot$/i;
const SYSTEM_INFO_REGEX = /^systeminfo\.txt$/i;
const DEVICE_ID_EXTRACT_REGEX = /(5G-\d+|4\d{3}-\d{2})/i;
const MAC_ADDRESS_REGEX = /([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})/;

function normalizeName(value) {
  return String(value || '').trim();
}

function isArchiveName(filename) {
  const lower = normalizeName(filename).toLowerCase();
  return lower.endsWith('.zip') || lower.endsWith('.7z');
}

function isSystemInfoName(filename) {
  return SYSTEM_INFO_REGEX.test(path.basename(normalizeName(filename)));
}

function isValidLogFileName(filename) {
  return LOG_FILE_REGEX.test(path.basename(normalizeName(filename)));
}

function extractDeviceIdFromText(value) {
  const match = normalizeName(value).match(DEVICE_ID_EXTRACT_REGEX);
  return match ? String(match[1] || match[0]).toUpperCase() : '';
}

function extractMacAddressFromText(value) {
  const match = normalizeName(value).match(MAC_ADDRESS_REGEX);
  return match ? String(match[0]).replace(/:/g, '-').toLowerCase() : '';
}

function resolveNextAction({ logsFound, logsReady, logsMissingKey, logsMissingDeviceId, missingFields = [] }) {
  if (logsMissingDeviceId > 0 || missingFields.includes('deviceId')) return 'ask_for_device_id';
  if (logsMissingKey > 0 || missingFields.includes('decryptKey')) return 'ask_for_key';
  if (missingFields.includes('deviceModelId')) return 'ask_for_device_model';
  if (missingFields.includes('seriesId')) return 'ask_for_series';
  if (logsFound < 1) return 'continue';
  if (logsMissingDeviceId > 0) return 'ask_for_device_id';
  if (logsMissingKey > 0) return 'ask_for_key';
  if (logsReady > 0) return 'continue';
  return 'continue';
}

function humanizeNextAction(nextAction) {
  const action = normalizeName(nextAction);
  if (action === 'ask_for_device_id') return '追问设备编号';
  if (action === 'ask_for_key') return '追问密钥';
  if (action === 'ask_for_device_model') return '追问设备型号';
  if (action === 'ask_for_series') return '追问设备系列';
  return '继续';
}

function humanizeKeyStatus(keyStatus) {
  const status = normalizeName(keyStatus);
  if (status === 'valid') return '可用';
  if (status === 'invalid') return '非法';
  return '缺失';
}

function buildSummaryMessage({ logsFound, deviceId, keyStatus, nextAction }) {
  if (Number(logsFound || 0) < 1) {
    return '未识别到可处理的日志文件，当前附件不是可上传的日志文件或日志压缩包。';
  }
  const normalizedDeviceId = normalizeName(deviceId) || '未知设备';
  return `共识别到${normalizedDeviceId}的${Number(logsFound || 0)}个日志文件，密钥${humanizeKeyStatus(keyStatus)}，下一步动作是${humanizeNextAction(nextAction)}`;
}

module.exports = {
  LOG_FILE_REGEX,
  SYSTEM_INFO_REGEX,
  DEVICE_ID_EXTRACT_REGEX,
  MAC_ADDRESS_REGEX,
  normalizeName,
  isArchiveName,
  isSystemInfoName,
  isValidLogFileName,
  extractDeviceIdFromText,
  extractMacAddressFromText,
  resolveNextAction,
  humanizeNextAction,
  humanizeKeyStatus,
  buildSummaryMessage
};
