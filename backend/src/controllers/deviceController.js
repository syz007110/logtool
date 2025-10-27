const Device = require('../models/device');
const Log = require('../models/log');
const { Op } = require('sequelize');
const { logOperation } = require('../utils/operationLogger');

// 列表
const listDevices = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const where = {};
    if (search) {
      const like = { [Op.like]: `%${search}%` };
      where[Op.or] = [
        { device_id: like },
        { device_model: like },
        { device_key: like },
        { hospital: like }
      ];
    }
    const { count: total, rows: devices } = await Device.findAndCountAll({
      where,
      offset: (parseInt(page) - 1) * parseInt(limit),
      limit: parseInt(limit),
      order: [['updated_at', 'DESC']]
    });
    res.json({ devices, total });
  } catch (e) {
    res.status(500).json({ message: req.t('device.listFailed'), error: e.message });
  }
};

// 创建
const createDevice = async (req, res) => {
  try {
    const { device_id, device_model, device_key, hospital } = req.body;
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
    const record = await Device.create({ device_id, device_model, device_key, hospital, created_at: new Date(), updated_at: new Date() });

    // 操作日志
    try {
      await logOperation({
        operation: '创建设备',
        description: `创建设备: ${device_id}`,
        user_id: req.user?.id,
        username: req.user?.username,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        details: { device_id, device_model, device_key: device_key ? '***' : null, hospital }
      });
    } catch (logErr) {
      console.warn('记录操作日志失败（创建设备）:', logErr.message);
    }

    res.json({ device: record, message: req.t('common.created') });
  } catch (e) {
    res.status(500).json({ message: req.t('device.createFailed'), error: e.message });
  }
};

// 更新
const updateDevice = async (req, res) => {
  try {
    const { id } = req.params;
    const { device_id, device_model, device_key, hospital } = req.body;
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
    device.device_id = device_id ?? device.device_id;
    device.device_model = device_model ?? device.device_model;
    device.device_key = device_key ?? device.device_key;
    device.hospital = hospital ?? device.hospital;
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
        details: { id: device.id, device_id: device.device_id, device_model, device_key: device_key ? '***' : undefined, hospital }
      });
    } catch (logErr) {
      console.warn('记录操作日志失败（更新设备）:', logErr.message);
    }

    res.json({ device, message: req.t('common.updated') });
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

    res.json({ success: true, message: req.t('common.deleted') });
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
    res.status(500).json({ message: req.t('common.operationFailed'), error: e.message });
  }
};

const findKeyByDeviceId = async (req, res) => {
  try {
    const { device_id } = req.query;
    if (!device_id) return res.status(400).json({ message: req.t('device.requiredId') });
    const device = await Device.findOne({ where: { device_id } });
    res.json({ key: device ? device.device_key : null });
  } catch (e) {
    res.status(500).json({ message: req.t('common.operationFailed'), error: e.message });
  }
};

module.exports = {
  listDevices,
  createDevice,
  updateDevice,
  deleteDevice,
  findByKey,
  findKeyByDeviceId
};


