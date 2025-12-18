/**
 * 设备编号提取器
 * 支持多种设备编号格式，与现有系统完全一致
 */

// 设备编号验证正则表达式
// 支持两种格式：
// 1. 5G-数字 格式（如：5G-07）
// 2. 4xxx-xx 纯数字格式（如：4371-01），首位数字必须是4
const DEVICE_ID_REGEX = /^(5G-\d+|4\d{3}-\d{2})$/;

// 用于从字符串中提取设备编号的正则表达式（允许在字符串中匹配）
const DEVICE_ID_EXTRACT_REGEX = /(5G-\d+|4\d{3}-\d{2})/;

/**
 * 从文件夹路径中提取设备编号
 * @param {string} folderPath - 文件夹路径
 * @returns {string|null} - 提取到的设备编号，未找到返回null
 */
function extractDeviceIdFromPath(folderPath) {
  if (!folderPath || typeof folderPath !== 'string') {
    return null;
  }

  const pathParts = folderPath.split(/[/\\]/);
  
  // 从路径的各个部分中查找匹配的设备编号
  for (const part of pathParts) {
    if (part && DEVICE_ID_REGEX.test(part)) {
      return part;
    }
    
    // 如果完整部分不匹配，尝试从部分中提取设备编号
    const match = part.match(DEVICE_ID_EXTRACT_REGEX);
    if (match) {
      return match[0];
    }
  }
  
  return null;
}

/**
 * 验证设备编号格式（与现有系统完全一致）
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

  // 移除文件扩展名
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
  
  // 尝试从文件名中提取设备编号
  if (DEVICE_ID_REGEX.test(nameWithoutExt)) {
    return nameWithoutExt;
  }

  // 尝试从文件名中查找匹配的模式
  const match = nameWithoutExt.match(DEVICE_ID_REGEX);
  if (match) {
    return match[0];
  }

  return null;
}

/**
 * 获取支持的设备编号格式示例
 * @returns {Array} - 支持的格式示例
 */
function getSupportedDeviceIdFormats() {
  return [
    '5G-07',      // 5G-数字格式
    '5G-01',      // 5G-数字格式
    '5G-99',      // 5G-数字格式
    '4371-01',    // 4xxx-xx格式（首位必须是4）
    '4234-56',    // 4xxx-xx格式（首位必须是4）
    '4999-99'     // 4xxx-xx格式（首位必须是4）
  ];
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
  getSupportedDeviceIdFormats,
  checkDeviceExists,
  getDeviceInfo,
  DEVICE_ID_REGEX
};
