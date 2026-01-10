const { Op } = require('sequelize');
const DeviceModelDict = require('../models/device_model_dict');

// GET /api/device-models?search=&page=&limit=
const listDeviceModels = async (req, res) => {
  try {
    const { search = '', page = 1, limit = 20, includeInactive = 'true' } = req.query;
    const where = {};

    // 设备管理页面默认显示所有（包括停用的），故障案例下拉只显示启用的
    if (String(includeInactive).toLowerCase() !== 'true') {
      where.is_active = true;
    }
    if (search) {
      where.device_model = { [Op.like]: `%${search}%` };
    }

    const { normalizePagination, MAX_PAGE_SIZE } = require('../constants/pagination');
    const { page: pageNum, limit: limitNum } = normalizePagination(page, limit, MAX_PAGE_SIZE.DEVICE_MODEL);
    const offset = (pageNum - 1) * limitNum;

    const { count: total, rows } = await DeviceModelDict.findAndCountAll({
      where,
      order: [['device_model', 'ASC']],
      limit: limitNum,
      offset
    });

    return res.json({ models: rows, total, page: pageNum, limit: limitNum });
  } catch (e) {
    return res.status(500).json({ message: '获取设备型号列表失败', error: e.message });
  }
};

// POST /api/device-models
const createDeviceModel = async (req, res) => {
  try {
    const raw = req.body?.device_model;
    const device_model = String(raw || '').trim();
    if (!device_model) return res.status(400).json({ message: 'device_model 不能为空' });

    const existed = await DeviceModelDict.findOne({ where: { device_model } });
    if (existed) return res.status(409).json({ message: '该设备型号已存在' });

    const created = await DeviceModelDict.create({
      device_model,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    });

    return res.json({ deviceModel: created, message: req.t('shared.created') });
  } catch (e) {
    return res.status(500).json({ message: '创建设备型号失败', error: e.message });
  }
};

// PUT /api/device-models/:id
const updateDeviceModel = async (req, res) => {
  try {
    const { id } = req.params;
    const record = await DeviceModelDict.findByPk(id);
    if (!record) return res.status(404).json({ message: req.t('shared.notFound') });

    const device_model = req.body?.device_model !== undefined ? String(req.body.device_model || '').trim() : undefined;
    const is_active = req.body?.is_active !== undefined ? !!req.body.is_active : undefined;

    if (device_model !== undefined && !device_model) {
      return res.status(400).json({ message: 'device_model 不能为空' });
    }

    if (device_model !== undefined && device_model !== record.device_model) {
      const existed = await DeviceModelDict.findOne({ where: { device_model } });
      if (existed) return res.status(409).json({ message: '该设备型号已存在' });
      record.device_model = device_model;
    }
    if (is_active !== undefined) record.is_active = is_active;
    record.updated_at = new Date();
    await record.save();

    return res.json({ deviceModel: record, message: req.t('shared.updated') });
  } catch (e) {
    return res.status(500).json({ message: '更新设备型号失败', error: e.message });
  }
};

// DELETE /api/device-models/:id
const deleteDeviceModel = async (req, res) => {
  try {
    const { id } = req.params;
    const record = await DeviceModelDict.findByPk(id);
    if (!record) return res.status(404).json({ message: req.t('shared.notFound') });

    await record.destroy();
    return res.json({ message: req.t('shared.deleted') });
  } catch (e) {
    return res.status(500).json({ message: '删除设备型号失败', error: e.message });
  }
};

module.exports = {
  listDeviceModels,
  createDeviceModel,
  updateDeviceModel,
  deleteDeviceModel
};


