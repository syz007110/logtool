const { Op } = require('sequelize');
const FaultCaseModule = require('../models/fault_case_module');
const FaultCaseModuleMapping = require('../models/fault_case_module_mapping');

// GET /api/fault-case-modules?is_active=true|false
const getFaultCaseModules = async (req, res) => {
  try {
    const { is_active } = req.query;
    const where = {};
    if (is_active !== undefined) where.is_active = String(is_active).toLowerCase() === 'true';

    const modules = await FaultCaseModule.findAll({
      where,
      order: [['sort_order', 'ASC'], ['id', 'ASC']]
    });

    return res.json({ success: true, modules });
  } catch (err) {
    console.error('获取故障案例模块失败:', err);
    return res.status(500).json({ success: false, message: '获取故障案例模块失败', error: err.message });
  }
};

// POST /api/fault-case-modules
const createFaultCaseModule = async (req, res) => {
  try {
    const { module_key, name_zh, name_en, description, sort_order, is_active } = req.body || {};
    if (!module_key || !name_zh || !name_en) {
      return res.status(400).json({ success: false, message: 'module_key、中文名称、英文名称为必填项' });
    }

    const key = String(module_key).trim();
    const existed = await FaultCaseModule.findOne({ where: { module_key: key } });
    if (existed) return res.status(409).json({ success: false, message: '该模块标识已存在' });

    const moduleRecord = await FaultCaseModule.create({
      module_key: key,
      name_zh: String(name_zh).trim(),
      name_en: String(name_en).trim(),
      description: description !== undefined ? String(description || '').trim() : null,
      sort_order: sort_order !== undefined ? Number(sort_order) : 0,
      is_active: is_active !== undefined ? !!is_active : true
    });

    return res.status(201).json({ success: true, message: '创建成功', module: moduleRecord });
  } catch (err) {
    console.error('创建故障案例模块失败:', err);
    return res.status(500).json({ success: false, message: '创建失败', error: err.message });
  }
};

// PUT /api/fault-case-modules/:id
const updateFaultCaseModule = async (req, res) => {
  try {
    const { id } = req.params;
    const { module_key, name_zh, name_en, description, sort_order, is_active } = req.body || {};

    const moduleRecord = await FaultCaseModule.findByPk(id);
    if (!moduleRecord) return res.status(404).json({ success: false, message: '未找到该模块' });

    if (module_key !== undefined && String(module_key).trim() !== moduleRecord.module_key) {
      const key = String(module_key).trim();
      const existed = await FaultCaseModule.findOne({
        where: { module_key: key, id: { [Op.ne]: id } }
      });
      if (existed) return res.status(409).json({ success: false, message: '该模块标识已存在' });
      moduleRecord.module_key = key;
    }

    if (name_zh !== undefined) moduleRecord.name_zh = String(name_zh).trim() || moduleRecord.name_zh;
    if (name_en !== undefined) moduleRecord.name_en = String(name_en).trim() || moduleRecord.name_en;
    if (description !== undefined) moduleRecord.description = description === null ? null : String(description || '').trim();
    if (sort_order !== undefined) moduleRecord.sort_order = Number(sort_order);
    if (is_active !== undefined) moduleRecord.is_active = !!is_active;

    await moduleRecord.save();
    return res.json({ success: true, message: '更新成功', module: moduleRecord });
  } catch (err) {
    console.error('更新故障案例模块失败:', err);
    return res.status(500).json({ success: false, message: '更新失败', error: err.message });
  }
};

// DELETE /api/fault-case-modules/:id
const deleteFaultCaseModule = async (req, res) => {
  try {
    const { id } = req.params;
    const moduleRecord = await FaultCaseModule.findByPk(id);
    if (!moduleRecord) return res.status(404).json({ success: false, message: '未找到该模块' });
    await moduleRecord.destroy();
    return res.json({ success: true, message: '删除成功' });
  } catch (err) {
    console.error('删除故障案例模块失败:', err);
    return res.status(500).json({ success: false, message: '删除失败', error: err.message });
  }
};

// GET /api/fault-case-modules/:id/mappings
const getFaultCaseModuleMappings = async (req, res) => {
  try {
    const { id } = req.params;
    const moduleRecord = await FaultCaseModule.findByPk(id);
    if (!moduleRecord) return res.status(404).json({ success: false, message: '未找到该模块' });

    const mappings = await FaultCaseModuleMapping.findAll({
      where: { module_id: id },
      order: [['sort_order', 'ASC'], ['id', 'ASC']]
    });

    return res.json({ success: true, mappings });
  } catch (err) {
    console.error('获取模块映射失败:', err);
    return res.status(500).json({ success: false, message: '获取映射失败', error: err.message });
  }
};

// POST /api/fault-case-modules/:id/mappings
const createFaultCaseModuleMapping = async (req, res) => {
  try {
    const { id } = req.params;
    const moduleRecord = await FaultCaseModule.findByPk(id);
    if (!moduleRecord) return res.status(404).json({ success: false, message: '未找到该模块' });

    const { source_field, source_value, sort_order, is_active } = req.body || {};
    const field = String(source_field || 'default').trim() || 'default';
    const value = String(source_value || '').trim();
    if (!value) return res.status(400).json({ success: false, message: 'source_value 不能为空' });

    const existed = await FaultCaseModuleMapping.findOne({
      where: { module_id: id, source_field: field, source_value: value }
    });
    if (existed) return res.status(409).json({ success: false, message: '该映射已存在' });

    const mapping = await FaultCaseModuleMapping.create({
      module_id: Number(id),
      source_field: field,
      source_value: value,
      sort_order: sort_order !== undefined ? Number(sort_order) : 0,
      is_active: is_active !== undefined ? !!is_active : true
    });

    return res.status(201).json({ success: true, message: '创建成功', mapping });
  } catch (err) {
    console.error('创建模块映射失败:', err);
    return res.status(500).json({ success: false, message: '创建映射失败', error: err.message });
  }
};

// PUT /api/fault-case-modules/mappings/:mappingId
const updateFaultCaseModuleMapping = async (req, res) => {
  try {
    const { mappingId } = req.params;
    const mapping = await FaultCaseModuleMapping.findByPk(mappingId);
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

    const existed = await FaultCaseModuleMapping.findOne({
      where: {
        module_id: mapping.module_id,
        source_field: mapping.source_field,
        source_value: mapping.source_value,
        id: { [Op.ne]: mappingId }
      }
    });
    if (existed) return res.status(409).json({ success: false, message: '该映射已存在' });

    await mapping.save();
    return res.json({ success: true, message: '更新成功', mapping });
  } catch (err) {
    console.error('更新模块映射失败:', err);
    return res.status(500).json({ success: false, message: '更新映射失败', error: err.message });
  }
};

// DELETE /api/fault-case-modules/mappings/:mappingId
const deleteFaultCaseModuleMapping = async (req, res) => {
  try {
    const { mappingId } = req.params;
    const mapping = await FaultCaseModuleMapping.findByPk(mappingId);
    if (!mapping) return res.status(404).json({ success: false, message: '未找到该映射' });
    await mapping.destroy();
    return res.json({ success: true, message: '删除成功' });
  } catch (err) {
    console.error('删除模块映射失败:', err);
    return res.status(500).json({ success: false, message: '删除映射失败', error: err.message });
  }
};

module.exports = {
  getFaultCaseModules,
  createFaultCaseModule,
  updateFaultCaseModule,
  deleteFaultCaseModule,
  getFaultCaseModuleMappings,
  createFaultCaseModuleMapping,
  updateFaultCaseModuleMapping,
  deleteFaultCaseModuleMapping
};


