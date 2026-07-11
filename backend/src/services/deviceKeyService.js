/**
 * 设备密钥选择与写回服务
 * - 按小时匹配 device_keys
 * - 不再回退 devices.device_key
 */

const DeviceKey = require('../models/deviceKey');
const { Op } = require('sequelize');
const { sequelize } = require('../models');

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** 截断到小时（本地时区），秒/分置 0 */
function floorToHour(input) {
  const d = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`无效时间: ${input}`);
  }
  d.setMinutes(0, 0, 0);
  return d;
}

/** 本地时间格式化为 MySQL DATETIME（到小时） */
function formatDateTimeHour(input) {
  const d = floorToHour(input);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:00:00`;
}

function parseToDate(input) {
  if (input == null || input === '') return null;
  if (input instanceof Date) return new Date(input.getTime());
  const s = String(input).trim().replace('T', ' ');
  const d = new Date(s.includes('-') && !s.includes(':') ? `${s} 00:00:00` : s);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`无效时间: ${input}`);
  }
  return d;
}

function normalizeRangeBound(input, { required = false, label = '时间' } = {}) {
  if (input == null || input === '') {
    if (required) throw new Error(`${label}不能为空`);
    return null;
  }
  return formatDateTimeHour(parseToDate(input));
}

/** 半开区间 [from, to) 是否相交；to/null 表示永久 */
function rangesOverlap(fromA, toA, fromB, toB) {
  const a0 = parseToDate(fromA).getTime();
  const a1 = toA == null || toA === '' ? Number.POSITIVE_INFINITY : parseToDate(toA).getTime();
  const b0 = parseToDate(fromB).getTime();
  const b1 = toB == null || toB === '' ? Number.POSITIVE_INFINITY : parseToDate(toB).getTime();
  return a0 < b1 && b0 < a1;
}

function assertValidRange(fromDate, toDate) {
  const from = normalizeRangeBound(fromDate, { required: true, label: '生效起始时间' });
  const to = normalizeRangeBound(toDate, { required: false });
  if (to != null && parseToDate(from).getTime() >= parseToDate(to).getTime()) {
    throw new Error('生效起始时间必须早于结束时间');
  }
  return { from, to };
}

/**
 * 校验同一设备区间不交叉
 * @param {string} deviceId
 * @param {string} from
 * @param {string|null} to
 * @param {number|null} excludeId
 */
async function assertNoOverlap(deviceId, from, to, excludeId = null) {
  const where = { device_id: deviceId };
  if (excludeId != null) {
    where.id = { [Op.ne]: excludeId };
  }
  const others = await DeviceKey.findAll({ where });
  for (const row of others) {
    if (rangesOverlap(from, to, row.valid_from_date, row.valid_to_date)) {
      throw new Error(`密钥生效时间段与已有密钥(ID=${row.id})交叉`);
    }
  }
}

async function getKeyRecordForDeviceAndDate(deviceId, logDate) {
  if (!deviceId || deviceId === '0000-00') {
    return null;
  }

  const target = floorToHour(logDate || new Date());
  const dateTimeStr = formatDateTimeHour(target);

  const matchingKeys = await DeviceKey.findAll({
    where: {
      device_id: deviceId,
      [Op.and]: [
        { valid_from_date: { [Op.lte]: dateTimeStr } },
        {
          [Op.or]: [
            { valid_to_date: null },
            { valid_to_date: { [Op.gt]: dateTimeStr } }
          ]
        }
      ]
    },
    order: [
      ['priority', 'DESC'],
      ['valid_from_date', 'DESC']
    ],
    limit: 1
  });

  return matchingKeys.length > 0 ? matchingKeys[0] : null;
}

/**
 * 根据设备编号和日志时间选择密钥（仅 device_keys，精确到小时）
 */
async function getKeyForDeviceAndDate(deviceId, logDate) {
  try {
    const record = await getKeyRecordForDeviceAndDate(deviceId, logDate);
    if (record) {
      const dateTimeStr = formatDateTimeHour(logDate || new Date());
      console.log(`✅ 找到设备 ${deviceId} 在 ${dateTimeStr} 的密钥: ${record.key_value.substring(0, 8)}...`);
      return record.key_value;
    }
    console.log(`❌ 未找到设备 ${deviceId} 在对应时间的密钥`);
    return null;
  } catch (error) {
    console.error(`获取设备 ${deviceId} 密钥失败:`, error.message);
    return null;
  }
}

async function countDeviceKeys(deviceId) {
  if (!deviceId) return 0;
  return DeviceKey.count({ where: { device_id: deviceId } });
}

async function findDeviceIdByKeyValue(keyValue) {
  if (!keyValue) return null;
  const row = await DeviceKey.findOne({
    where: { key_value: keyValue },
    order: [['valid_from_date', 'DESC']]
  });
  return row ? row.device_id : null;
}

async function findNextKeyStart(deviceId, fromHour, excludeId = null) {
  const fromStr = formatDateTimeHour(fromHour);
  const where = {
    device_id: deviceId,
    valid_from_date: { [Op.gt]: fromStr }
  };
  if (excludeId != null) {
    where.id = { [Op.ne]: excludeId };
  }
  const next = await DeviceKey.findOne({
    where,
    order: [['valid_from_date', 'ASC']]
  });
  return next;
}

/**
 * 用户密钥解密成功后写回 device_keys
 * - 表为空：1970-01-01 00:00:00 ~ 永久
 * - 表非空：插入 [日志小时, 后续第一条起始)，并收窄前一条终止到日志小时
 */
async function writebackUserKeyFromUpload({ deviceId, keyValue, logTime }) {
  if (!deviceId || deviceId === '0000-00' || !keyValue) {
    return null;
  }

  const count = await countDeviceKeys(deviceId);
  if (count === 0) {
    const created = await addDeviceKey(
      deviceId,
      keyValue,
      '1970-01-01 00:00:00',
      null,
      'auto-init from upload',
      0,
      null,
      { skipOverlapCheck: false }
    );
    console.log(`✅ 首次初始化设备 ${deviceId} 密钥为 1970~永久`);
    return created;
  }

  const hour = floorToHour(logTime || new Date());
  const hourStr = formatDateTimeHour(hour);
  const matched = await getKeyRecordForDeviceAndDate(deviceId, hour);

  return sequelize.transaction(async (transaction) => {
    if (matched) {
      const matchedFrom = floorToHour(matched.valid_from_date);
      if (matchedFrom.getTime() >= hour.getTime()) {
        console.warn(
          `⚠️ 无法收窄密钥 ID=${matched.id}：其起始 ${formatDateTimeHour(matchedFrom)} >= 日志时间 ${hourStr}，跳过自动写回`
        );
        return null;
      }

      const next = await findNextKeyStart(deviceId, hour, matched.id);
      const newTo = next ? formatDateTimeHour(next.valid_from_date) : null;

      await matched.update({ valid_to_date: hourStr }, { transaction });

      const created = await DeviceKey.create({
        device_id: deviceId,
        key_value: keyValue,
        valid_from_date: hourStr,
        valid_to_date: newTo,
        description: 'auto-split from upload',
        priority: 0,
        created_by: null
      }, { transaction });

      console.log(`✅ 已切段写回设备 ${deviceId} 密钥：${hourStr} ~ ${newTo || '永久'}，并收窄旧密钥 ID=${matched.id}`);
      return created;
    }

    // 有密钥但当前时刻无覆盖：插入 [hour, nextStart)，不写 1970
    const next = await findNextKeyStart(deviceId, hour);
    const newTo = next ? formatDateTimeHour(next.valid_from_date) : null;
    await assertNoOverlap(deviceId, hourStr, newTo);

    const created = await DeviceKey.create({
      device_id: deviceId,
      key_value: keyValue,
      valid_from_date: hourStr,
      valid_to_date: newTo,
      description: 'auto-fill gap from upload',
      priority: 0,
      created_by: null
    }, { transaction });

    console.log(`✅ 已补空洞写回设备 ${deviceId} 密钥：${hourStr} ~ ${newTo || '永久'}`);
    return created;
  });
}

async function getDeviceKeys(deviceId) {
  if (!deviceId || deviceId === '0000-00') {
    return [];
  }

  try {
    return await DeviceKey.findAll({
      where: { device_id: deviceId },
      order: [
        ['valid_from_date', 'ASC'],
        ['priority', 'DESC']
      ]
    });
  } catch (error) {
    console.error(`获取设备 ${deviceId} 的密钥列表失败:`, error.message);
    return [];
  }
}

async function addDeviceKey(
  deviceId,
  keyValue,
  validFrom,
  validTo = null,
  description = '',
  priority = 0,
  createdBy = null,
  options = {}
) {
  const { from, to } = assertValidRange(validFrom, validTo);
  if (!options.skipOverlapCheck) {
    await assertNoOverlap(deviceId, from, to);
  }

  const key = await DeviceKey.create({
    device_id: deviceId,
    key_value: keyValue,
    valid_from_date: from,
    valid_to_date: to,
    description,
    priority,
    created_by: createdBy
  });

  console.log(`✅ 已为设备 ${deviceId} 添加密钥: ${keyValue.substring(0, 8)}...`);
  return key;
}

async function updateDeviceKey(keyId, updates) {
  const key = await DeviceKey.findByPk(keyId);
  if (!key) {
    throw new Error('密钥不存在');
  }

  const nextFrom = updates.valid_from_date !== undefined
    ? normalizeRangeBound(updates.valid_from_date, { required: true, label: '生效起始时间' })
    : formatDateTimeHour(key.valid_from_date);
  const nextTo = updates.valid_to_date !== undefined
    ? normalizeRangeBound(updates.valid_to_date, { required: false })
    : (key.valid_to_date == null ? null : formatDateTimeHour(key.valid_to_date));

  assertValidRange(nextFrom, nextTo);
  await assertNoOverlap(key.device_id, nextFrom, nextTo, key.id);

  const payload = { ...updates };
  if (updates.valid_from_date !== undefined) payload.valid_from_date = nextFrom;
  if (updates.valid_to_date !== undefined) payload.valid_to_date = nextTo;

  await key.update(payload);
  console.log(`✅ 已更新密钥 ID ${keyId}`);
  return key;
}

async function deleteDeviceKey(keyId) {
  const key = await DeviceKey.findByPk(keyId);
  if (!key) {
    throw new Error('密钥不存在');
  }
  await key.destroy();
  console.log(`✅ 已删除密钥 ID ${keyId}`);
  return true;
}

module.exports = {
  getKeyForDeviceAndDate,
  getKeyRecordForDeviceAndDate,
  getDeviceKeys,
  addDeviceKey,
  updateDeviceKey,
  deleteDeviceKey,
  writebackUserKeyFromUpload,
  countDeviceKeys,
  findDeviceIdByKeyValue,
  floorToHour,
  formatDateTimeHour,
  assertValidRange,
  assertNoOverlap,
  rangesOverlap
};
