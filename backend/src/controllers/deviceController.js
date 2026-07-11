const Device = require('../models/device');
const DeviceKey = require('../models/deviceKey');
const Log = require('../models/log');
const HospitalMaster = require('../models/hospital_master');
const DeviceModelDict = require('../models/device_model_dict');
const GeoRegion = require('../models/geo_region');
const { Op } = require('sequelize');
const { logOperation } = require('../utils/operationLogger');
const { getDeviceKeys, addDeviceKey, updateDeviceKey, deleteDeviceKey, getKeyForDeviceAndDate, findDeviceIdByKeyValue } = require('../services/deviceKeyService');
const { normalizePagination, MAX_PAGE_SIZE } = require('../constants/pagination');
const DeviceSeriesDict = require('../models/device_series_dict');

async function validateDeviceModelSeriesPair({ device_model, series_id }) {
  const normalizedModel = String(device_model || '').trim();
  if (!normalizedModel) {
    return { ok: true };
  }
  if (series_id === undefined || series_id === null || series_id === '') {
    return { ok: true };
  }

  const seriesIdNum = Number(series_id);
  if (!Number.isInteger(seriesIdNum) || seriesIdNum <= 0) {
    return { ok: false, status: 400, message: 'series_id 必须为正整数' };
  }

  const matchedModel = await DeviceModelDict.findOne({
    where: {
      device_model: normalizedModel,
      series_id: seriesIdNum
    }
  });
  if (!matchedModel) {
    return { ok: false, status: 400, message: '所选设备型号不属于当前设备系列' };
  }

  return { ok: true, seriesIdNum };
}

function buildDeviceModelSeriesMap(models = []) {
  const map = new Map();
  for (const item of models) {
    const data = typeof item?.toJSON === 'function' ? item.toJSON() : item;
    const key = `${data?.series_id || ''}::${data?.device_model || ''}`;
    map.set(key, data);
  }
  return map;
}

// 列表
const listDevices = async (req, res) => {
  try {
    const { search = '', country_code, region_code, hospital_id, series_id } = req.query;
    const { page, limit } = normalizePagination(req.query.page, req.query.limit, MAX_PAGE_SIZE.STANDARD);
    const where = {};
    const hospitalWhere = {};
    let modelSeriesMap = new Map();
    if (country_code) hospitalWhere.country_code = String(country_code).trim();
    if (region_code) hospitalWhere.region_code = String(region_code).trim();
    if (hospital_id !== undefined && hospital_id !== null && hospital_id !== '') {
      const hospitalIdNum = Number(hospital_id);
      if (!Number.isFinite(hospitalIdNum) || hospitalIdNum <= 0) {
        return res.status(400).json({ message: 'hospital_id 必须为正整数' });
      }
      where.hospital_id = hospitalIdNum;
    }
    if (series_id !== undefined && series_id !== null && series_id !== '') {
      const seriesIdNum = Number(series_id);
      if (!Number.isInteger(seriesIdNum) || seriesIdNum <= 0) {
        return res.status(400).json({ message: 'series_id 必须为正整数' });
      }
      where.series_id = seriesIdNum;
    }

    if (search) {
      const like = { [Op.like]: `%${search}%` };
      const searchOr = [
        { device_id: like },
        { device_model: like },
        { device_key: like }
      ];
      const matchedHospitals = await HospitalMaster.findAll({
        attributes: ['id'],
        where: { hospital_name_std: like },
        limit: 2000
      });
      const matchedHospitalIds = matchedHospitals.map(item => item.id);
      if (matchedHospitalIds.length > 0) {
        searchOr.push({ hospital_id: { [Op.in]: matchedHospitalIds } });
      }
      where[Op.or] = searchOr;
    }

    const includeHospital = {
      model: HospitalMaster,
      as: 'HospitalMaster',
      attributes: ['id', 'hospital_code', 'hospital_name_std', 'country_code', 'region_code', 'status'],
      include: [{ model: GeoRegion, as: 'Region', attributes: ['region_code', 'region_name'], required: false }],
      required: Object.keys(hospitalWhere).length > 0
    };
    if (Object.keys(hospitalWhere).length > 0) {
      includeHospital.where = hospitalWhere;
    }

    const { count: total, rows: devices } = await Device.findAndCountAll({
      where,
      include: [includeHospital],
      offset: (page - 1) * limit,
      limit,
      order: [['updated_at', 'DESC']],
      distinct: true
    });

    if (modelSeriesMap.size === 0) {
      const distinctModels = Array.from(new Set(devices.map(item => item.device_model).filter(Boolean)));
      if (distinctModels.length > 0) {
        const matchedModels = await DeviceModelDict.findAll({
          attributes: ['device_model', 'series_id'],
          where: { device_model: { [Op.in]: distinctModels } },
          include: [{
            model: DeviceSeriesDict,
            as: 'DeviceSeries',
            attributes: ['id', 'series_code', 'series_name_zh', 'series_name_en'],
            required: false
          }]
        });
        modelSeriesMap = buildDeviceModelSeriesMap(matchedModels);
      }
    }

    const result = devices.map(item => {
      const data = item.toJSON();
      const hospitalInfo = data.HospitalMaster || null;
      const regionInfo = hospitalInfo?.Region || null;
      const modelInfo = modelSeriesMap.get(`${data.series_id || ''}::${data.device_model || ''}`) || null;
      const seriesInfo = modelInfo?.DeviceSeries || null;
      return {
        ...data,
        hospital_id: data.hospital_id || hospitalInfo?.id || null,
        hospital_code: data.hospital_code || hospitalInfo?.hospital_code || null,
        hospital_name: hospitalInfo?.hospital_name_std || '',
        country_code: hospitalInfo?.country_code || null,
        region_code: hospitalInfo?.region_code || null,
        region_name: regionInfo?.region_name || null,
        series_id: data.series_id || modelInfo?.series_id || null,
        series_code: seriesInfo?.series_code || null,
        series_name_zh: seriesInfo?.series_name_zh || null,
        series_name_en: seriesInfo?.series_name_en || null
      };
    });

    res.json({ devices: result, total });
  } catch (e) {
    res.status(500).json({ message: req.t('device.listFailed'), error: e.message });
  }
};

// 创建
const createDevice = async (req, res) => {
  try {
    const { device_id, device_model, hospital_id, series_id } = req.body;
    if (!device_id) return res.status(400).json({ message: req.t('device.requiredId') });
    // 简单格式校验：与日志相同规则
    const deviceIdRegex = /^[0-9A-Za-z]+-[0-9A-Za-z]+$/;
    if (!deviceIdRegex.test(device_id)) {
      return res.status(400).json({ message: req.t('device.invalidIdFormat') });
    }
    const existed = await Device.findOne({ where: { device_id } });
    if (existed) return res.status(409).json({ message: req.t('device.idExists') });

    const seriesValidation = await validateDeviceModelSeriesPair({ device_model, series_id });
    if (!seriesValidation.ok) {
      return res.status(seriesValidation.status).json({ message: seriesValidation.message });
    }

    let resolvedHospitalId = null;
    let resolvedHospitalCode = null;
    if (hospital_id !== undefined && hospital_id !== null && hospital_id !== '') {
      const hospitalIdNum = Number(hospital_id);
      if (!Number.isFinite(hospitalIdNum) || hospitalIdNum <= 0) {
        return res.status(400).json({ message: 'hospital_id 必须为正整数' });
      }
      const hospitalRecord = await HospitalMaster.findByPk(hospitalIdNum);
      if (!hospitalRecord) {
        return res.status(400).json({ message: '医院不存在' });
      }
      resolvedHospitalId = hospitalRecord.id;
      resolvedHospitalCode = hospitalRecord.hospital_code;
    }

    const createPayload = {
      device_id,
      device_model,
      series_id: seriesValidation.seriesIdNum ?? null,
      // 密钥改由 device_keys 管理，基础信息不再写入 devices.device_key
      device_key: null,
      hospital_id: resolvedHospitalId,
      created_at: new Date(),
      updated_at: new Date()
    };
    if (Object.prototype.hasOwnProperty.call(Device.rawAttributes, 'hospital_code')) {
      createPayload.hospital_code = resolvedHospitalCode;
    }
    // 兼容历史字段：不再维护医院名称归属
    if (Object.prototype.hasOwnProperty.call(Device.rawAttributes, 'hospital')) {
      createPayload.hospital = null;
    }
    const record = await Device.create(createPayload);

    // 操作日志
    try {
      await logOperation({
        operation: '创建设备',
        description: `创建设备: ${device_id}`,
        user_id: req.user?.id,
        username: req.user?.username,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        details: {
          device_id,
          device_model,
          series_id: seriesValidation.seriesIdNum ?? null,
          hospital_id: resolvedHospitalId,
          hospital_code: resolvedHospitalCode
        }
      });
    } catch (logErr) {
      console.warn('记录操作日志失败（创建设备）:', logErr.message);
    }

    res.json({ device: record, message: req.t('shared.created') });
  } catch (e) {
    res.status(500).json({ message: req.t('device.createFailed'), error: e.message });
  }
};

// 更新
const updateDevice = async (req, res) => {
  try {
    const { id } = req.params;
    const { device_id, device_model, hospital_id, series_id } = req.body;
    const device = await Device.findByPk(id);
    if (!device) return res.status(404).json({ message: req.t('device.notFound') });
    if (device_id && device_id !== device.device_id) {
      const deviceIdRegex = /^[0-9A-Za-z]+-[0-9A-Za-z]+$/;
      if (!deviceIdRegex.test(device_id)) {
        return res.status(400).json({ message: req.t('device.invalidIdFormat') });
      }
      const existed = await Device.findOne({ where: { device_id } });
      if (existed) return res.status(409).json({ message: req.t('device.idExists') });
    }

    const nextDeviceModel = device_model ?? device.device_model;
    const seriesValidation = await validateDeviceModelSeriesPair({ device_model: nextDeviceModel, series_id });
    if (!seriesValidation.ok) {
      return res.status(seriesValidation.status).json({ message: seriesValidation.message });
    }

    let nextHospitalId = device.hospital_id;
    let nextHospitalCode = Object.prototype.hasOwnProperty.call(device, 'hospital_code') ? device.hospital_code : null;
    const hasHospitalIdField = Object.prototype.hasOwnProperty.call(req.body, 'hospital_id');
    if (hasHospitalIdField) {
      if (hospital_id === null || hospital_id === '') {
        nextHospitalId = null;
        nextHospitalCode = null;
      } else {
        const hospitalIdNum = Number(hospital_id);
        if (!Number.isFinite(hospitalIdNum) || hospitalIdNum <= 0) {
          return res.status(400).json({ message: 'hospital_id 必须为正整数' });
        }
        const hospitalRecord = await HospitalMaster.findByPk(hospitalIdNum);
        if (!hospitalRecord) {
          return res.status(400).json({ message: '医院不存在' });
        }
        nextHospitalId = hospitalRecord.id;
        nextHospitalCode = hospitalRecord.hospital_code;
      }
    }

    device.device_id = device_id ?? device.device_id;
    device.device_model = device_model ?? device.device_model;
    if (series_id !== undefined) {
      device.series_id = seriesValidation.seriesIdNum ?? null;
    }
    // 密钥改由 device_keys 管理，更新基础信息时不再改 devices.device_key
    device.hospital_id = nextHospitalId;
    if (Object.prototype.hasOwnProperty.call(device, 'hospital_code')) {
      device.hospital_code = nextHospitalCode;
    }
    // 兼容历史字段：不再维护医院名称归属
    if (Object.prototype.hasOwnProperty.call(device, 'hospital')) {
      device.hospital = null;
    }
    device.updated_at = new Date();
    await device.save();

    // 操作日志
    try {
      await logOperation({
        operation: '更新设备',
        description: `更新设备: ${device.device_id}`,
        user_id: req.user?.id,
        username: req.user?.username,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        details: {
          id: device.id,
          device_id: device.device_id,
          device_model,
          series_id: device.series_id ?? null,
          hospital_id: device.hospital_id,
          hospital_code: Object.prototype.hasOwnProperty.call(device, 'hospital_code') ? device.hospital_code : null
        }
      });
    } catch (logErr) {
      console.warn('记录操作日志失败（更新设备）:', logErr.message);
    }

    res.json({ device, message: req.t('shared.updated') });
  } catch (e) {
    res.status(500).json({ message: req.t('device.updateFailed'), error: e.message });
  }
};

// 删除
const deleteDevice = async (req, res) => {
  try {
    const { id } = req.params;
    const device = await Device.findByPk(id);
    if (!device) return res.status(404).json({ message: req.t('device.notFound') });
    // 若日志存在引用该 device_id，仍允许删除，但不级联更改日志，保持历史一致。
    await device.destroy();

    // 操作日志
    try {
      await logOperation({
        operation: '删除设备',
        description: `删除设备: ${device.device_id}`,
        user_id: req.user?.id,
        username: req.user?.username,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        details: { id: device.id, device_id: device.device_id }
      });
    } catch (logErr) {
      console.warn('记录操作日志失败（删除设备）:', logErr.message);
    }

    res.json({ success: true, message: req.t('shared.deleted') });
  } catch (e) {
    res.status(500).json({ message: req.t('device.deleteFailed'), error: e.message });
  }
};

// 通过 device_keys.key_value 或 device_id 查找（用于自动填充）
const findByKey = async (req, res) => {
  try {
    const { key } = req.query;
    if (!key) return res.status(400).json({ message: req.t('device.provideKey') });
    const deviceId = await findDeviceIdByKeyValue(key);
    res.json({ device_id: deviceId || null });
  } catch (e) {
    res.status(500).json({ message: req.t('shared.operationFailed'), error: e.message });
  }
};

const findKeyByDeviceId = async (req, res) => {
  try {
    const { device_id } = req.query;
    if (!device_id) return res.status(400).json({ message: req.t('device.requiredId') });
    const key = await getKeyForDeviceAndDate(device_id, new Date());
    res.json({ key: key || null });
  } catch (e) {
    res.status(500).json({ message: req.t('shared.operationFailed'), error: e.message });
  }
};

// ========================================
// 设备密钥管理 API
// ========================================

// 获取设备的密钥列表
const getDeviceKeysList = async (req, res) => {
  try {
    const { device_id } = req.params;
    if (!device_id) {
      return res.status(400).json({ message: req.t('device.requiredId') });
    }
    
    const keys = await getDeviceKeys(device_id);
    res.json({ keys, total: keys.length });
  } catch (error) {
    res.status(500).json({ message: req.t('shared.operationFailed'), error: error.message });
  }
};

// 添加设备密钥
const createDeviceKey = async (req, res) => {
  try {
    const { device_id } = req.params;
    const { key_value, valid_from_date, valid_to_date, description, priority } = req.body;
    
    if (!device_id) {
      return res.status(400).json({ message: req.t('device.requiredId') });
    }
    if (!key_value) {
      return res.status(400).json({ message: '密钥值不能为空' });
    }
    if (!valid_from_date) {
      return res.status(400).json({ message: '生效起始日期不能为空' });
    }
    
    // 验证密钥格式
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    if (!macRegex.test(key_value)) {
      return res.status(400).json({ message: req.t('device.invalidKeyFormat') });
    }
    
    // 验证设备是否存在
    const device = await Device.findOne({ where: { device_id } });
    if (!device) {
      return res.status(404).json({ message: req.t('device.notFound') });
    }
    
    const key = await addDeviceKey(
      device_id,
      key_value,
      valid_from_date,
      valid_to_date || null,
      description || '',
      priority || 0,
      req.user?.id
    );
    
    // 操作日志
    try {
      await logOperation({
        operation: '添加设备密钥',
        description: `为设备 ${device_id} 添加密钥`,
        user_id: req.user?.id,
        username: req.user?.username,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        details: { device_id, key_id: key.id, valid_from_date, valid_to_date, description }
      });
    } catch (logErr) {
      console.warn('记录操作日志失败（添加设备密钥）:', logErr.message);
    }
    
    res.json({ key, message: '密钥添加成功' });
  } catch (error) {
    const msg = error.message || '添加密钥失败';
    const isClientError = /交叉|起始时间|不能为空|无效时间/.test(msg);
    res.status(isClientError ? 400 : 500).json({ message: msg, error: msg });
  }
};

// 更新设备密钥
const updateDeviceKeyInfo = async (req, res) => {
  try {
    const { key_id } = req.params;
    const { key_value, valid_from_date, valid_to_date, description, priority } = req.body;
    
    if (!key_id) {
      return res.status(400).json({ message: '密钥ID不能为空' });
    }
    
    const updates = {};
    if (key_value !== undefined) {
      // 验证密钥格式
      const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
      if (!macRegex.test(key_value)) {
        return res.status(400).json({ message: req.t('device.invalidKeyFormat') });
      }
      updates.key_value = key_value;
    }
    if (valid_from_date !== undefined) updates.valid_from_date = valid_from_date;
    if (valid_to_date !== undefined) updates.valid_to_date = valid_to_date;
    if (description !== undefined) updates.description = description;
    if (priority !== undefined) updates.priority = priority;
    
    const key = await updateDeviceKey(key_id, updates);
    
    // 操作日志
    try {
      await logOperation({
        operation: '更新设备密钥',
        description: `更新设备密钥 ID: ${key_id}`,
        user_id: req.user?.id,
        username: req.user?.username,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        details: { key_id, device_id: key.device_id, updates }
      });
    } catch (logErr) {
      console.warn('记录操作日志失败（更新设备密钥）:', logErr.message);
    }
    
    res.json({ key, message: '密钥更新成功' });
  } catch (error) {
    if (error.message === '密钥不存在') {
      return res.status(404).json({ message: error.message });
    }
    const msg = error.message || '更新密钥失败';
    const isClientError = /交叉|起始时间|不能为空|无效时间/.test(msg);
    res.status(isClientError ? 400 : 500).json({ message: msg, error: msg });
  }
};

// 删除设备密钥
const removeDeviceKey = async (req, res) => {
  try {
    const { key_id } = req.params;
    
    if (!key_id) {
      return res.status(400).json({ message: '密钥ID不能为空' });
    }
    
    // 获取密钥信息（用于日志）
    const key = await DeviceKey.findByPk(key_id);
    if (!key) {
      return res.status(404).json({ message: '密钥不存在' });
    }
    
    await deleteDeviceKey(key_id);
    
    // 操作日志
    try {
      await logOperation({
        operation: '删除设备密钥',
        description: `删除设备 ${key.device_id} 的密钥`,
        user_id: req.user?.id,
        username: req.user?.username,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        details: { key_id, device_id: key.device_id }
      });
    } catch (logErr) {
      console.warn('记录操作日志失败（删除设备密钥）:', logErr.message);
    }
    
    res.json({ success: true, message: '密钥删除成功' });
  } catch (error) {
    if (error.message === '密钥不存在') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: '删除密钥失败', error: error.message });
  }
};

module.exports = {
  listDevices,
  createDevice,
  updateDevice,
  deleteDevice,
  findByKey,
  findKeyByDeviceId,
  getDeviceKeysList,
  createDeviceKey,
  updateDeviceKeyInfo,
  removeDeviceKey
};


