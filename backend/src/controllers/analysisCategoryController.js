const AnalysisCategory = require('../models/analysis_category');
const { Op } = require('sequelize');

// 获取所有分析分类
const getAnalysisCategories = async (req, res) => {
  try {
    const { is_active } = req.query;
    const where = {};
    
    // 如果指定了 is_active 参数，则过滤
    if (is_active !== undefined) {
      where.is_active = is_active === 'true' || is_active === true;
    }
    
    const categories = await AnalysisCategory.findAll({
      where,
      order: [['sort_order', 'ASC'], ['id', 'ASC']]
    });
    
    res.json({ 
      success: true,
      categories 
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

      const allIds = categories.map(c => c.id);

      // 定义关键/精细集合的 category_key 名单（可按需调整）
      const KEY_KEYS = new Set([
        'Safety_Checks',
        'Communication_Errors',
        'Hardware',
        'Power_Supply',
        'Network',
        'Ethercat',
        'Boundary'
      ]);

      // 精细：排除提示/未分类/部分信息类
      const EXCLUDE_FINE = new Set(['Tips', 'Null', 'Maintenance_Information', 'Account_Management']);

      const keyIds = categories.filter(c => KEY_KEYS.has(c.category_key)).map(c => c.id);
      const fineIds = categories.filter(c => !EXCLUDE_FINE.has(c.category_key)).map(c => c.id);

      return res.json({
        success: true,
        presets: {
          ALL: allIds,
          FINE: fineIds,
          KEY: keyIds
        }
      });
    } catch (err) {
      console.error('获取分析分类预设失败:', err);
      return res.status(500).json({ success: false, message: '获取预设失败', error: err.message });
    }
  }
};

