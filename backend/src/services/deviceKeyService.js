/**
 * 设备密钥选择服务
 * 根据设备编号和日志时间选择正确的密钥
 */

const DeviceKey = require('../models/deviceKey');
const Device = require('../models/device');
const { Op } = require('sequelize');

/**
 * 根据设备编号和日志时间选择正确的密钥
 * @param {string} deviceId - 设备编号
 * @param {Date|string} logDate - 日志日期（从文件名或内容提取）
 * @returns {Promise<string|null>} 返回密钥值，找不到返回null
 */
async function getKeyForDeviceAndDate(deviceId, logDate) {
  if (!deviceId || deviceId === '0000-00') {
    return null;
  }

  try {
    // 将 logDate 转换为 Date 对象
    let targetDate;
    if (logDate instanceof Date) {
      targetDate = logDate;
    } else if (typeof logDate === 'string') {
      targetDate = new Date(logDate);
      if (isNaN(targetDate.getTime())) {
        console.warn(`无效的日志日期: ${logDate}`);
        return null;
      }
    } else {
      // 如果没有提供日期，使用当前日期
      targetDate = new Date();
    }

    // 转换为日期字符串（只取日期部分，忽略时间）
    const dateStr = targetDate.toISOString().split('T')[0];

    // 查询匹配时间范围的密钥
    // 条件：valid_from_date <= logDate AND (valid_to_date IS NULL OR valid_to_date > logDate)
    const matchingKeys = await DeviceKey.findAll({
      where: {
        device_id: deviceId,
        [Op.and]: [
          { valid_from_date: { [Op.lte]: dateStr } },
          {
            [Op.or]: [
              { valid_to_date: null },
              { valid_to_date: { [Op.gt]: dateStr } }
            ]
          }
        ]
      },
      order: [
        ['priority', 'DESC'],  // 优先级高的在前
        ['valid_from_date', 'DESC']  // 时间范围起始日期新的在前
      ],
      limit: 1
    });

    if (matchingKeys.length > 0) {
      const key = matchingKeys[0].key_value;
      console.log(`✅ 找到设备 ${deviceId} 在 ${dateStr} 的密钥: ${key.substring(0, 8)}...`);
      return key;
    }

    // 如果没有匹配的时间范围，回退到 devices.device_key（向后兼容）
    console.log(`⚠️ 未找到设备 ${deviceId} 在 ${dateStr} 的匹配密钥，尝试使用默认密钥`);
    const device = await Device.findOne({ where: { device_id: deviceId } });
    if (device && device.device_key) {
      console.log(`✅ 使用设备 ${deviceId} 的默认密钥: ${device.device_key.substring(0, 8)}...`);
      return device.device_key;
    }

    console.log(`❌ 未找到设备 ${deviceId} 的密钥`);
    return null;
  } catch (error) {
    console.error(`获取设备 ${deviceId} 密钥失败:`, error.message);
    // 出错时也尝试回退到默认密钥
    try {
      const device = await Device.findOne({ where: { device_id: deviceId } });
      if (device && device.device_key) {
        return device.device_key;
      }
    } catch (fallbackError) {
      console.error('回退到默认密钥也失败:', fallbackError.message);
    }
    return null;
  }
}

/**
 * 获取设备的所有密钥（用于管理界面）
 * @param {string} deviceId - 设备编号
 * @returns {Promise<Array>} 返回密钥列表，按时间排序
 */
async function getDeviceKeys(deviceId) {
  if (!deviceId || deviceId === '0000-00') {
    return [];
  }

  try {
    const keys = await DeviceKey.findAll({
      where: { device_id: deviceId },
      order: [
        ['valid_from_date', 'ASC'],
        ['priority', 'DESC']
      ]
    });
    return keys;
  } catch (error) {
    console.error(`获取设备 ${deviceId} 的密钥列表失败:`, error.message);
    return [];
  }
}

/**
 * 添加设备密钥
 * @param {string} deviceId - 设备编号
 * @param {string} keyValue - 密钥值
 * @param {string|Date} validFrom - 生效起始日期
 * @param {string|Date|null} validTo - 生效结束日期（null表示永久有效）
 * @param {string} description - 密钥描述
 * @param {number} priority - 优先级（默认0）
 * @param {number} createdBy - 创建者ID（可选）
 * @returns {Promise<Object>} 创建的密钥记录
 */
async function addDeviceKey(deviceId, keyValue, validFrom, validTo = null, description = '', priority = 0, createdBy = null) {
  try {
    // 转换日期格式
    const fromDate = validFrom instanceof Date ? validFrom.toISOString().split('T')[0] : validFrom;
    const toDate = validTo ? (validTo instanceof Date ? validTo.toISOString().split('T')[0] : validTo) : null;

    const key = await DeviceKey.create({
      device_id: deviceId,
      key_value: keyValue,
      valid_from_date: fromDate,
      valid_to_date: toDate,
      description,
      priority,
      created_by: createdBy
    });

    console.log(`✅ 已为设备 ${deviceId} 添加密钥: ${keyValue.substring(0, 8)}...`);
    return key;
  } catch (error) {
    console.error(`添加设备密钥失败:`, error.message);
    throw error;
  }
}

/**
 * 更新设备密钥
 * @param {number} keyId - 密钥ID
 * @param {Object} updates - 更新字段
 * @returns {Promise<Object>} 更新后的密钥记录
 */
async function updateDeviceKey(keyId, updates) {
  try {
    const key = await DeviceKey.findByPk(keyId);
    if (!key) {
      throw new Error('密钥不存在');
    }

    // 转换日期格式
    if (updates.valid_from_date instanceof Date) {
      updates.valid_from_date = updates.valid_from_date.toISOString().split('T')[0];
    }
    if (updates.valid_to_date !== undefined) {
      if (updates.valid_to_date === null) {
        updates.valid_to_date = null;
      } else if (updates.valid_to_date instanceof Date) {
        updates.valid_to_date = updates.valid_to_date.toISOString().split('T')[0];
      }
    }

    await key.update(updates);
    console.log(`✅ 已更新密钥 ID ${keyId}`);
    return key;
  } catch (error) {
    console.error(`更新设备密钥失败:`, error.message);
    throw error;
  }
}

/**
 * 删除设备密钥
 * @param {number} keyId - 密钥ID
 * @returns {Promise<boolean>} 是否删除成功
 */
async function deleteDeviceKey(keyId) {
  try {
    const key = await DeviceKey.findByPk(keyId);
    if (!key) {
      throw new Error('密钥不存在');
    }

    await key.destroy();
    console.log(`✅ 已删除密钥 ID ${keyId}`);
    return true;
  } catch (error) {
    console.error(`删除设备密钥失败:`, error.message);
    throw error;
  }
}

module.exports = {
  getKeyForDeviceAndDate,
  getDeviceKeys,
  addDeviceKey,
  updateDeviceKey,
  deleteDeviceKey
};

