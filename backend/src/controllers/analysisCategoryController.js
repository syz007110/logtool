const AnalysisCategory = require('../models/analysis_category');
const { Op } = require('sequelize');
const fs = require('fs');
const path = require('path');
const { normalizePagination, MAX_PAGE_SIZE } = require('../constants/pagination');

// 获取所有分析分类（支持分页和搜索）
const getAnalysisCategories = async (req, res) => {
  try {
    const { is_active, page = 1, limit = 20, search } = req.query;
    const where = {};
    
    // 如果指定了 is_active 参数，则过滤
    if (is_active !== undefined) {
      where.is_active = is_active === 'true' || is_active === true;
    }
    
    // 如果指定了 search 参数，则搜索
    if (search) {
      where[Op.or] = [
        { category_key: { [Op.like]: `%${search}%` } },
        { name_zh: { [Op.like]: `%${search}%` } },
        { name_en: { [Op.like]: `%${search}%` } }
      ];
    }
    
    // 解析分页参数
    const { page: pageNum, limit: limitNum } = normalizePagination(page, limit, MAX_PAGE_SIZE.STANDARD);
    const offset = (pageNum - 1) * limitNum;
    
    // 使用 findAndCountAll 获取分页数据和总数
    const { count: total, rows: categories } = await AnalysisCategory.findAndCountAll({
      where,
      order: [['sort_order', 'ASC'], ['id', 'ASC']],
      limit: limitNum,
      offset: offset
    });
    
    res.json({ 
      success: true,
      categories,
      total
    });
  } catch (err) {
    console.error('获取分析分类失败:', err);
    res.status(500).json({ 
      success: false,
      message: '获取分析分类失败', 
      error: err.message 
    });
  }
};

// 创建分析分类
const createAnalysisCategory = async (req, res) => {
  try {
    const { category_key, name_zh, name_en, sort_order, is_active } = req.body;
    
    // 验证必填字段
    if (!category_key || !name_zh || !name_en) {
      return res.status(400).json({ 
        success: false,
        message: '分类标识、中文名称和英文名称为必填项' 
      });
    }
    
    // 检查是否已存在相同的 category_key
    const existing = await AnalysisCategory.findOne({ 
      where: { category_key } 
    });
    
    if (existing) {
      return res.status(409).json({ 
        success: false,
        message: '该分类标识已存在' 
      });
    }
    
    const category = await AnalysisCategory.create({
      category_key,
      name_zh,
      name_en,
      sort_order: sort_order || 0,
      is_active: is_active !== undefined ? is_active : true
    });
    
    res.status(201).json({ 
      success: true,
      message: '创建成功', 
      category 
    });
  } catch (err) {
    console.error('创建分析分类失败:', err);
    res.status(500).json({ 
      success: false,
      message: '创建失败', 
      error: err.message 
    });
  }
};

// 更新分析分类
const updateAnalysisCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { category_key, name_zh, name_en, sort_order, is_active } = req.body;
    
    const category = await AnalysisCategory.findByPk(id);
    
    if (!category) {
      return res.status(404).json({ 
        success: false,
        message: '未找到该分析分类' 
      });
    }
    
    // 如果修改了 category_key，检查是否与其他记录冲突
    if (category_key && category_key !== category.category_key) {
      const existing = await AnalysisCategory.findOne({ 
        where: { 
          category_key,
          id: { [Op.ne]: id }
        } 
      });
      
      if (existing) {
        return res.status(409).json({ 
          success: false,
          message: '该分类标识已存在' 
        });
      }
    }
    
    await category.update({
      category_key: category_key || category.category_key,
      name_zh: name_zh || category.name_zh,
      name_en: name_en || category.name_en,
      sort_order: sort_order !== undefined ? sort_order : category.sort_order,
      is_active: is_active !== undefined ? is_active : category.is_active
    });
    
    res.json({ 
      success: true,
      message: '更新成功', 
      category 
    });
  } catch (err) {
    console.error('更新分析分类失败:', err);
    res.status(500).json({ 
      success: false,
      message: '更新失败', 
      error: err.message 
    });
  }
};

// 删除分析分类
const deleteAnalysisCategory = async (req, res) => {
  try {
    const { id } = req.params;
    
    const category = await AnalysisCategory.findByPk(id);
    
    if (!category) {
      return res.status(404).json({ 
        success: false,
        message: '未找到该分析分类' 
      });
    }
    
    await category.destroy();
    
    res.json({ 
      success: true,
      message: '删除成功' 
    });
  } catch (err) {
    console.error('删除分析分类失败:', err);
    res.status(500).json({ 
      success: false,
      message: '删除失败', 
      error: err.message 
    });
  }
};

module.exports = {
  getAnalysisCategories,
  createAnalysisCategory,
  updateAnalysisCategory,
  deleteAnalysisCategory,
  // 新增：预设集合（ALL/FINE/KEY）
  async getPresets(req, res) {
    try {
      // 读取全部启用的分类
      const categories = await AnalysisCategory.findAll({
        where: { is_active: true },
        attributes: ['id', 'category_key', 'name_zh', 'name_en'],
        order: [['sort_order', 'ASC'], ['id', 'ASC']]
      });

      // 从配置文件读取预设定义
      const configPath = path.join(__dirname, '..', 'config', 'analysisPresets.json');
      let rolePreset = { '1': 'ALL', '2': 'FINE', '3': 'KEY', default: 'KEY' };
      let presetsConfig = {
        ALL: { excludeKeys: [] },
        FINE: { excludeKeys: ['Tips', 'Null', 'Maintenance_Information', 'Account_Management'] },
        KEY: { excludeKeys: ['Tips', 'Null', 'Maintenance_Information', 'Account_Management', 'Instrument', 'Safety_Checks', 'Communication_Errors', 'Hardware', 'Power_Supply', 'Network', 'Ethercat', 'Boundary'] }
      };

      try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const cfg = JSON.parse(raw);
        if (cfg && typeof cfg === 'object') {
          if (cfg.rolePreset && typeof cfg.rolePreset === 'object') {
            rolePreset = { ...rolePreset, ...cfg.rolePreset };
          }
          if (cfg.presets && typeof cfg.presets === 'object') {
            // 合并预设配置，保留默认值
            presetsConfig = {
              ALL: { ...presetsConfig.ALL, ...(cfg.presets.ALL || {}) },
              FINE: { ...presetsConfig.FINE, ...(cfg.presets.FINE || {}) },
              KEY: { ...presetsConfig.KEY, ...(cfg.presets.KEY || {}) }
            };
          }
        }
      } catch (e) {
        // 读取失败采用默认配置
        console.warn('[analysisPresets] Using default presets due to read/parse error:', e.message);
      }

      // 根据配置计算各等级的分类ID
      // 统一使用 excludeKeys 语义：排除指定分类，保留其余分类
      const allExcludeKeys = presetsConfig.ALL?.excludeKeys || [];
      const fineExcludeKeys = presetsConfig.FINE?.excludeKeys || [];
      const keyExcludeKeys = presetsConfig.KEY?.excludeKeys || [];
      
      const ALL_EXCLUDE = new Set(allExcludeKeys);
      const FINE_EXCLUDE = new Set(fineExcludeKeys);
      const KEY_EXCLUDE = new Set(keyExcludeKeys);
      
      const allIds = categories.filter(c => !ALL_EXCLUDE.has(c.category_key)).map(c => c.id);
      const fineIds = categories.filter(c => !FINE_EXCLUDE.has(c.category_key)).map(c => c.id);
      const keyIds = categories.filter(c => !KEY_EXCLUDE.has(c.category_key)).map(c => c.id);

      return res.json({
        success: true,
        presets: {
          ALL: allIds,
          FINE: fineIds,
          KEY: keyIds
        },
        rolePreset
      });
    } catch (err) {
      console.error('获取分析分类预设失败:', err);
      return res.status(500).json({ success: false, message: '获取预设失败', error: err.message });
    }
  }
};

