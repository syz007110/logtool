/**
 * 设备编号提取器
 * 统一规则：字母或数字 + 单个连字符 + 字母或数字（如 4371-01、ABC-12、block4-4、5G-07）
 */

const DEVICE_ID_REGEX = /^[0-9A-Za-z]+-[0-9A-Za-z]+$/;
const DEVICE_ID_EXTRACT_REGEX = /(?<![0-9A-Za-z-])[0-9A-Za-z]+-[0-9A-Za-z]+(?![0-9A-Za-z-])/;

function splitPathParts(folderPath) {
  return String(folderPath).split(/[/\\]/).filter(Boolean);
}

function matchDeviceIdInSegment(part) {
  if (!part) return null;
  if (DEVICE_ID_REGEX.test(part)) return part;
  const nameWithoutExt = part.replace(/\.[^/.]+$/, '');
  if (nameWithoutExt && DEVICE_ID_REGEX.test(nameWithoutExt)) return nameWithoutExt;
  const match = part.match(DEVICE_ID_EXTRACT_REGEX);
  return match ? match[0] : null;
}

/**
 * 从文件夹路径中提取设备编号
 * @param {string} folderPath - 文件夹路径
 * @returns {string|null} - 提取到的设备编号，未找到返回null
 */
function extractDeviceIdFromPath(folderPath) {
  if (!folderPath || typeof folderPath !== 'string') {
    return null;
  }

  const pathParts = splitPathParts(folderPath);

  for (let i = pathParts.length - 1; i >= 0; i -= 1) {
    const found = matchDeviceIdInSegment(pathParts[i]);
    if (found) return found;
  }

  return null;
}

/**
 * 验证设备编号格式
 * @param {string} deviceId - 设备编号
 * @returns {boolean} - 是否有效
 */
function validateDeviceId(deviceId) {
  if (!deviceId || typeof deviceId !== 'string') {
    return false;
  }
  return DEVICE_ID_REGEX.test(deviceId);
}

/**
 * 从文件名中提取设备编号
 * @param {string} fileName - 文件名
 * @returns {string|null} - 提取到的设备编号，未找到返回null
 */
function extractDeviceIdFromFileName(fileName) {
  if (!fileName || typeof fileName !== 'string') {
    return null;
  }

  return matchDeviceIdInSegment(fileName);
}

/**
 * 检查设备编号是否在数据库中存在
 * @param {string} deviceId - 设备编号
 * @returns {Promise<boolean>} - 是否存在
 */
async function checkDeviceExists(deviceId) {
  try {
    const Device = require('../models/device');
    const device = await Device.findOne({ where: { device_id: deviceId } });
    return !!device;
  } catch (error) {
    console.error('检查设备是否存在失败:', error);
    return false;
  }
}

/**
 * 从设备编号获取设备信息
 * @param {string} deviceId - 设备编号
 * @returns {Promise<Object|null>} - 设备信息，未找到返回null
 */
async function getDeviceInfo(deviceId) {
  try {
    const Device = require('../models/device');
    const device = await Device.findOne({ where: { device_id: deviceId } });
    return device;
  } catch (error) {
    console.error('获取设备信息失败:', error);
    return null;
  }
}

module.exports = {
  extractDeviceIdFromPath,
  validateDeviceId,
  extractDeviceIdFromFileName,
  checkDeviceExists,
  getDeviceInfo,
  DEVICE_ID_REGEX,
  DEVICE_ID_EXTRACT_REGEX
};
