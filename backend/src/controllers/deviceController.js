const Device = require('../models/device');
const DeviceKey = require('../models/deviceKey');
const Log = require('../models/log');
const HospitalMaster = require('../models/hospital_master');
const { Op } = require('sequelize');
const { logOperation } = require('../utils/operationLogger');
const { getDeviceKeys, addDeviceKey, updateDeviceKey, deleteDeviceKey } = require('../services/deviceKeyService');
const { normalizePagination, MAX_PAGE_SIZE } = require('../constants/pagination');

// 列表
const listDevices = async (req, res) => {
  try {
    const { search = '', country_code, region_code, hospital_id } = req.query;
    const { page, limit } = normalizePagination(req.query.page, req.query.limit, MAX_PAGE_SIZE.STANDARD);
    const where = {};
    const hospitalWhere = {};
    if (country_code) hospitalWhere.country_code = String(country_code).trim();
    if (region_code) hospitalWhere.region_code = String(region_code).trim();
    if (hospital_id !== undefined && hospital_id !== null && hospital_id !== '') {
      const hospitalIdNum = Number(hospital_id);
      if (!Number.isFinite(hospitalIdNum) || hospitalIdNum <= 0) {
        return res.status(400).json({ message: 'hospital_id 必须为正整数' });
      }
      where.hospital_id = hospitalIdNum;
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
      include: [{ model: require('../models/geo_region'), as: 'Region', attributes: ['region_code', 'region_name'], required: false }],
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

    const result = devices.map(item => {
      const data = item.toJSON();
      const hospitalInfo = data.HospitalMaster || null;
      const regionInfo = hospitalInfo?.Region || null;
      return {
        ...data,
        hospital_id: data.hospital_id || hospitalInfo?.id || null,
        hospital_code: data.hospital_code || hospitalInfo?.hospital_code || null,
        hospital_name: hospitalInfo?.hospital_name_std || '',
        country_code: hospitalInfo?.country_code || null,
        region_code: hospitalInfo?.region_code || null,
        region_name: regionInfo?.region_name || null
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
    const { device_id, device_model, device_key, hospital_id } = req.body;
    if (!device_id) return res.status(400).json({ message: req.t('device.requiredId') });
    // 简单格式校验：与日志相同规则
    const deviceIdRegex = /^[0-9A-Za-z]+-[0-9A-Za-z]+$/;
    if (!deviceIdRegex.test(device_id)) {
      return res.status(400).json({ message: req.t('device.invalidIdFormat') });
    }
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    if (device_key && !macRegex.test(device_key)) {
      return res.status(400).json({ message: req.t('device.invalidKeyFormat') });
    }
    const existed = await Device.findOne({ where: { device_id } });
    if (existed) return res.status(409).json({ message: req.t('device.idExists') });

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
      device_key,
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
          device_key: device_key ? '***' : null,
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
    const { device_id, device_model, device_key, hospital_id } = req.body;
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
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    if (device_key && !macRegex.test(device_key)) {
      return res.status(400).json({ message: req.t('device.invalidKeyFormat') });
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
    device.device_key = device_key ?? device.device_key;
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
          device_key: device_key ? '***' : undefined,
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

// 通过 device_key 或 device_id 查找（用于自动填充）
const findByKey = async (req, res) => {
  try {
    const { key } = req.query;
    if (!key) return res.status(400).json({ message: req.t('device.provideKey') });
    const device = await Device.findOne({ where: { device_key: key } });
    res.json({ device_id: device ? device.device_id : null });
  } catch (e) {
    res.status(500).json({ message: req.t('shared.operationFailed'), error: e.message });
  }
};

const findKeyByDeviceId = async (req, res) => {
  try {
    const { device_id } = req.query;
    if (!device_id) return res.status(400).json({ message: req.t('device.requiredId') });
    const device = await Device.findOne({ where: { device_id } });
    res.json({ key: device ? device.device_key : null });
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
    res.status(500).json({ message: '添加密钥失败', error: error.message });
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
    res.status(500).json({ message: '更新密钥失败', error: error.message });
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


