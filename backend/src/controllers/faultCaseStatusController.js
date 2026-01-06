const { Op } = require('sequelize');
const FaultCaseStatus = require('../models/fault_case_status');
const FaultCaseStatusMapping = require('../models/fault_case_status_mapping');

// GET /api/fault-case-statuses?is_active=true|false
const getFaultCaseStatuses = async (req, res) => {
  try {
    const { is_active } = req.query;
    const where = {};
    if (is_active !== undefined) where.is_active = String(is_active).toLowerCase() === 'true';

    const statuses = await FaultCaseStatus.findAll({
      where,
      order: [['sort_order', 'ASC'], ['id', 'ASC']]
    });

    return res.json({ success: true, statuses });
  } catch (err) {
    console.error('获取故障案例状态失败:', err);
    return res.status(500).json({ success: false, message: '获取故障案例状态失败', error: err.message });
  }
};

// POST /api/fault-case-statuses
const createFaultCaseStatus = async (req, res) => {
  try {
    const { status_key, name_zh, name_en, description, sort_order, is_active } = req.body || {};
    if (!status_key || !name_zh || !name_en) {
      return res.status(400).json({ success: false, message: 'status_key、中文名称、英文名称为必填项' });
    }

    const key = String(status_key).trim();
    const existed = await FaultCaseStatus.findOne({ where: { status_key: key } });
    if (existed) return res.status(409).json({ success: false, message: '该状态标识已存在' });

    const status = await FaultCaseStatus.create({
      status_key: key,
      name_zh: String(name_zh).trim(),
      name_en: String(name_en).trim(),
      description: description !== undefined ? String(description || '').trim() : null,
      sort_order: sort_order !== undefined ? Number(sort_order) : 0,
      is_active: is_active !== undefined ? !!is_active : true
    });

    return res.status(201).json({ success: true, message: '创建成功', status });
  } catch (err) {
    console.error('创建故障案例状态失败:', err);
    return res.status(500).json({ success: false, message: '创建失败', error: err.message });
  }
};

// PUT /api/fault-case-statuses/:id
const updateFaultCaseStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status_key, name_zh, name_en, description, sort_order, is_active } = req.body || {};

    const status = await FaultCaseStatus.findByPk(id);
    if (!status) return res.status(404).json({ success: false, message: '未找到该状态' });

    if (status_key !== undefined && String(status_key).trim() !== status.status_key) {
      const key = String(status_key).trim();
      const existed = await FaultCaseStatus.findOne({
        where: { status_key: key, id: { [Op.ne]: id } }
      });
      if (existed) return res.status(409).json({ success: false, message: '该状态标识已存在' });
      status.status_key = key;
    }

    if (name_zh !== undefined) status.name_zh = String(name_zh).trim() || status.name_zh;
    if (name_en !== undefined) status.name_en = String(name_en).trim() || status.name_en;
    if (description !== undefined) status.description = description === null ? null : String(description || '').trim();
    if (sort_order !== undefined) status.sort_order = Number(sort_order);
    if (is_active !== undefined) status.is_active = !!is_active;

    await status.save();
    return res.json({ success: true, message: '更新成功', status });
  } catch (err) {
    console.error('更新故障案例状态失败:', err);
    return res.status(500).json({ success: false, message: '更新失败', error: err.message });
  }
};

// DELETE /api/fault-case-statuses/:id
const deleteFaultCaseStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const status = await FaultCaseStatus.findByPk(id);
    if (!status) return res.status(404).json({ success: false, message: '未找到该状态' });
    await status.destroy();
    return res.json({ success: true, message: '删除成功' });
  } catch (err) {
    console.error('删除故障案例状态失败:', err);
    return res.status(500).json({ success: false, message: '删除失败', error: err.message });
  }
};

// GET /api/fault-case-statuses/:id/mappings
const getFaultCaseStatusMappings = async (req, res) => {
  try {
    const { id } = req.params;
    const status = await FaultCaseStatus.findByPk(id);
    if (!status) return res.status(404).json({ success: false, message: '未找到该状态' });

    const mappings = await FaultCaseStatusMapping.findAll({
      where: { status_id: id },
      order: [['sort_order', 'ASC'], ['id', 'ASC']]
    });

    return res.json({ success: true, mappings });
  } catch (err) {
    console.error('获取状态映射失败:', err);
    return res.status(500).json({ success: false, message: '获取映射失败', error: err.message });
  }
};

// POST /api/fault-case-statuses/:id/mappings
const createFaultCaseStatusMapping = async (req, res) => {
  try {
    const { id } = req.params;
    const status = await FaultCaseStatus.findByPk(id);
    if (!status) return res.status(404).json({ success: false, message: '未找到该状态' });

    const { source_field, source_value, sort_order, is_active } = req.body || {};
    const field = String(source_field || 'default').trim() || 'default';
    const value = String(source_value || '').trim();
    if (!value) return res.status(400).json({ success: false, message: 'source_value 不能为空' });

    const existed = await FaultCaseStatusMapping.findOne({
      where: { status_id: id, source_field: field, source_value: value }
    });
    if (existed) return res.status(409).json({ success: false, message: '该映射已存在' });

    const mapping = await FaultCaseStatusMapping.create({
      status_id: Number(id),
      source_field: field,
      source_value: value,
      sort_order: sort_order !== undefined ? Number(sort_order) : 0,
      is_active: is_active !== undefined ? !!is_active : true
    });

    return res.status(201).json({ success: true, message: '创建成功', mapping });
  } catch (err) {
    console.error('创建状态映射失败:', err);
    return res.status(500).json({ success: false, message: '创建映射失败', error: err.message });
  }
};

// PUT /api/fault-case-statuses/mappings/:mappingId
const updateFaultCaseStatusMapping = async (req, res) => {
  try {
    const { mappingId } = req.params;
    const mapping = await FaultCaseStatusMapping.findByPk(mappingId);
    if (!mapping) return res.status(404).json({ success: false, message: '未找到该映射' });

    const { source_field, source_value, sort_order, is_active } = req.body || {};
    if (source_field !== undefined) mapping.source_field = String(source_field || 'default').trim() || 'default';
    if (source_value !== undefined) {
      const value = String(source_value || '').trim();
      if (!value) return res.status(400).json({ success: false, message: 'source_value 不能为空' });
      mapping.source_value = value;
    }
    if (sort_order !== undefined) mapping.sort_order = Number(sort_order);
    if (is_active !== undefined) mapping.is_active = !!is_active;

    // 唯一性校验（status_id + source_field + source_value）
    const existed = await FaultCaseStatusMapping.findOne({
      where: {
        status_id: mapping.status_id,
        source_field: mapping.source_field,
        source_value: mapping.source_value,
        id: { [Op.ne]: mappingId }
      }
    });
    if (existed) return res.status(409).json({ success: false, message: '该映射已存在' });

    await mapping.save();
    return res.json({ success: true, message: '更新成功', mapping });
  } catch (err) {
    console.error('更新状态映射失败:', err);
    return res.status(500).json({ success: false, message: '更新映射失败', error: err.message });
  }
};

// DELETE /api/fault-case-statuses/mappings/:mappingId
const deleteFaultCaseStatusMapping = async (req, res) => {
  try {
    const { mappingId } = req.params;
    const mapping = await FaultCaseStatusMapping.findByPk(mappingId);
    if (!mapping) return res.status(404).json({ success: false, message: '未找到该映射' });
    await mapping.destroy();
    return res.json({ success: true, message: '删除成功' });
  } catch (err) {
    console.error('删除状态映射失败:', err);
    return res.status(500).json({ success: false, message: '删除映射失败', error: err.message });
  }
};

module.exports = {
  getFaultCaseStatuses,
  createFaultCaseStatus,
  updateFaultCaseStatus,
  deleteFaultCaseStatus,
  getFaultCaseStatusMappings,
  createFaultCaseStatusMapping,
  updateFaultCaseStatusMapping,
  deleteFaultCaseStatusMapping
};


