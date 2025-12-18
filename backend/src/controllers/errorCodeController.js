const ErrorCode = require('../models/error_code');
const I18nErrorCode = require('../models/i18n_error_code');
const AnalysisCategory = require('../models/analysis_category');
const ErrorCodeAnalysisCategory = require('../models/error_code_analysis_category');
const TechSolutionImage = require('../models/tech_solution_image');
const { sequelize } = require('../models');
const { Op } = require('sequelize');
const { logOperation } = require('../utils/operationLogger');
const errorCodeCache = require('../services/errorCodeCache');
const fs = require('fs');
const path = require('path');
const {
  STORAGE,
  MAX_IMAGES,
  ALLOWED_MIMES,
  OSS_PREFIX,
  TMP_PREFIX,
  OSS_PUBLIC_BASE,
  ensureLocalDir,
  ensureTempDir,
  buildLocalUrl,
  buildTempLocalUrl,
  getOssClient,
  buildOssUrl,
  buildOssObjectKey,
  buildTempOssObjectKey,
  TMP_DIR,
  LOCAL_DIR
} = require('../config/techSolutionStorage');

// 根据故障码自动判断故障等级和处理措施
const analyzeErrorCode = (code) => {
  if (!code) return { level: '无', solution: 'tips' };
  
  // 解析故障码：0X + 3位16进制数字 + A/B/C/D/E
  const match = code.match(/^0X([0-9A-F]{3})([ABCDE])$/);
  if (!match) return { level: '无', solution: 'tips' };
  
  const [, hexPart, severity] = match;
  
  // 根据故障码末尾字母判断等级
  let level = '无';
  switch (severity) {
    case 'A': // A类故障：高级
      level = '高级';
      break;
    case 'B': // B类故障：中级
      level = '中级';
      break;
    case 'C': // C类故障：低级
      level = '低级';
      break;
    default: // D、E类故障：无
      level = '无';
      break;
  }
  
  // 根据故障码末尾字母判断处理措施
  let solution = 'tips';
  switch (severity) {
    case 'A': // A类故障：recoverable 可恢复故障
      solution = 'recoverable';
      break;
    case 'B': // B类故障：recoverable 可恢复故障
      solution = 'recoverable';
      break;
    case 'C': // C类故障：ignorable 可忽略故障
      solution = 'ignorable';
      break;
    case 'D': // D类故障：tips 提示信息
      solution = 'tips';
      break;
    case 'E': // E类故障：log 日志记录
      solution = 'log';
      break;
  }
  
  return { level, solution };
};

// 过滤主表不再使用的英文字段，防止写入 *_en 到 error_codes
const stripEnglishFields = (data) => {
  if (!data || typeof data !== 'object') return data;
  const {
    short_message_en, // eslint-disable-line no-unused-vars
    user_hint_en,     // eslint-disable-line no-unused-vars
    operation_en,     // eslint-disable-line no-unused-vars
    ...rest
  } = data;
  return rest;
};

// 规范化辅助：与 log_entries(subsystem_char, code4) 对齐
const normalizeSubsystemChar = (s) => (s ? String(s).trim().charAt(0) : null);
const normalizeCode4 = (code) => {
  if (!code) return null;
  const raw = String(code).trim();
  const tail4 = raw.slice(-4).toUpperCase();
  return `0X${tail4}`;
};

// 局部维护 code_category_map：删除旧映射，插入新映射
async function upsertCodeCategoryMapForErrorCode(errorCodeId, categoryIds) {
  try {
    const ec = await ErrorCode.findByPk(errorCodeId, { attributes: ['subsystem', 'code'] });
    if (!ec) return;
    const subsystemChar = normalizeSubsystemChar(ec.subsystem);
    const code4 = normalizeCode4(ec.code);
    if (!subsystemChar || !code4) return;

    await sequelize.query(
      'DELETE FROM code_category_map WHERE subsystem_char = :s AND code4 = :c',
      { replacements: { s: subsystemChar, c: code4 } }
    );

    if (Array.isArray(categoryIds) && categoryIds.length > 0) {
      const values = categoryIds
        .filter((id) => Number.isInteger(Number(id)))
        .map((id) => `(${sequelize.escape(subsystemChar)}, ${sequelize.escape(code4)}, ${Number(id)})`);
      if (values.length > 0) {
        const sql = `INSERT INTO code_category_map (subsystem_char, code4, analysis_category_id) VALUES ${values.join(',')}`;
        await sequelize.query(sql);
      }
    }
  } catch (e) {
    console.warn('[code_category_map] upsert failed:', e.message);
  }
}

// 将英文分类键值转换为中文标准键值
const convertCategoryToChinese = (category) => {
  const categoryMap = {
    'software': '软件',
    'hardware': '硬件', 
    'logRecord': '日志记录',
    'operationTip': '操作提示',
    'safetyProtection': '安全保护'
  };
  return categoryMap[category] || category;
};

const safeUnlink = (filePath) => {
  if (!filePath) return;
  fs.unlink(filePath, () => {});
};

// 将URL转换为完整的、可直接访问的URL
const normalizeImageUrl = (img, req) => {
  if (!img || !img.url) return img?.url || '';
  
  const url = String(img.url);
  
  // 如果已经是完整的URL（http/https），直接返回
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  // 先判断存储类型，再根据类型处理URL
  const storageType = img.storage || STORAGE; // 如果没有指定，使用全局配置的存储类型
  
  // 本地存储：相对路径需要转换为绝对URL
  if (storageType === 'local') {
    // 如果是相对路径（以/开头），需要添加协议和主机
    if (url.startsWith('/')) {
      // 优先使用 X-Forwarded-Host（nginx代理时设置）
      // 其次使用 Origin 或 Referer 头（客户端实际访问地址）
      // 最后使用 Host 头
      let host = req?.get('x-forwarded-host');
      let protocol = req?.get('x-forwarded-proto') || req?.protocol || (req?.secure ? 'https' : 'http');
      
      if (!host) {
        // 尝试从 Origin 头获取
        const origin = req?.get('origin') || req?.headers?.origin;
        if (origin) {
          try {
            const originUrl = new URL(origin);
            host = originUrl.host;
            protocol = originUrl.protocol.replace(':', '');
          } catch (e) {
            // 解析失败，继续使用其他方式
          }
        }
      }
      
      if (!host) {
        // 尝试从 Referer 头获取（移动端可能没有 Origin 头）
        const referer = req?.get('referer') || req?.headers?.referer;
        if (referer) {
          try {
            const refererUrl = new URL(referer);
            host = refererUrl.host;
            protocol = refererUrl.protocol.replace(':', '');
          } catch (e) {
            // 解析失败，继续使用其他方式
          }
        }
      }
      
      if (!host) {
        host = req?.get('host') || req?.headers?.host || 'localhost:3000';
      }
      
      const finalUrl = `${protocol}://${host}${url}`;
      return finalUrl;
    }
    // 如果不是相对路径，直接返回（可能是完整URL但前面判断没捕获到）
    return url;
  }
  
  // OSS存储：根据配置处理URL
  if (storageType === 'oss') {
    // 如果配置了公共基础URL，URL应该已经是完整的
    if (OSS_PUBLIC_BASE) {
      // 如果URL已经是完整URL（前面已判断），或者以OSS_PUBLIC_BASE开头，直接返回
      if (url.startsWith(OSS_PUBLIC_BASE)) {
        return url;
      }
      // 否则，可能是objectKey，需要拼接OSS_PUBLIC_BASE
      return `${OSS_PUBLIC_BASE.replace(/\/$/, '')}/${url}`;
    }
    // 没有配置OSS_PUBLIC_BASE，返回原URL（可能是objectKey，需要前端处理）
    return url;
  }
  
  // 其他情况，直接返回原URL
  return url;
};

const mapTechImageResponse = (img, req) => ({
  id: img.id,
  url: normalizeImageUrl(img, req),
  storage: img.storage,
  filename: img.filename,
  original_name: img.original_name,
  object_key: img.object_key,
  file_type: img.file_type,
  size_bytes: img.size_bytes,
  mime_type: img.mime_type,
  width: img.width,
  height: img.height,
  sort_order: img.sort_order ?? 0
});

const normalizeAssetPayload = (img, index) => {
  if (!img || !img.url) return null;
  const payload = {
    url: String(img.url),
    storage: img.storage === 'oss' ? 'oss' : 'local',
    filename: img.filename || img.object_key || null,
    original_name: img.original_name || img.filename || null,
    object_key: img.object_key || null,
    file_type: img.file_type || (img.mime_type && img.mime_type.startsWith('image/') ? 'image' : 'file'),
    size_bytes: Number.isFinite(Number(img.size_bytes)) ? Number(img.size_bytes) : (Number.isFinite(Number(img.size)) ? Number(img.size) : null),
    mime_type: img.mime_type || null,
    width: Number.isFinite(Number(img.width)) ? Number(img.width) : null,
    height: Number.isFinite(Number(img.height)) ? Number(img.height) : null,
    sort_order: Number.isFinite(Number(img.sort_order)) ? Number(img.sort_order) : index
  };
  return payload;
};

// 输入验证函数
const validateErrorCodeData = (data) => {
  const errors = [];
  
  // 基础必填字段验证
  const basicRequiredFields = [
    'subsystem', 'code', 'is_axis_error', 'is_arm_error', 
    'detail', 'method', 'param1', 'param2', 'param3', 'param4', 'category'
  ];
  
  basicRequiredFields.forEach(field => {
    if (!data[field] && data[field] !== false && data[field] !== 0) {
      errors.push(`${field} 是必填字段`);
    }
  });
  
  // 英文字段验证（可选）：不再强制依赖主表英文字段，英文内容通过 i18n 表提交即可
  
  // 中文字段验证：short_message和operation不都为空，user_hint和operation不都为空
  if ((!data.short_message || data.short_message.trim() === '') && 
      (!data.operation || data.operation.trim() === '')) {
    errors.push('精简提示信息和操作信息不能都为空');
  }
  
  if ((!data.user_hint || data.user_hint.trim() === '') && 
      (!data.operation || data.operation.trim() === '')) {
    errors.push('用户提示信息和操作信息不能都为空');
  }
  
  // 子系统验证 - 仅允许1-9,A
  if (data.subsystem && !/^[1-9A]$/.test(data.subsystem)) {
    errors.push('子系统编号必须是1-9或A中的一个');
  }
  
  // 故障码格式验证
  if (data.code && !/^0X[0-9A-F]{3}[ABCDE]$/.test(data.code)) {
    errors.push('故障码格式不正确，应为0X加3位16进制数字加A、B、C、D、E中的一个字母');
  }
  
  // 分类验证 - 支持英文键值和中文值
  const validCategories = ['software', 'hardware', 'logRecord', 'operationTip', 'safetyProtection'];
  const validCategoriesChinese = ['软件', '硬件', '日志记录', '操作提示', '安全保护'];
  if (data.category && !validCategories.includes(data.category) && !validCategoriesChinese.includes(data.category)) {
    errors.push('故障分类必须是：软件、硬件、日志记录、操作提示、安全保护 中的一个');
  }
  
  return errors;
};

// 新增故障码
const createErrorCode = async (req, res) => {
  try {
    const data = req.body;
    // 注意：short_message_en/user_hint_en/operation_en 已由多语言管理模块管理
    // 此处不再处理这些字段
    const mainData = stripEnglishFields(data);
    
    // 转换分类为中文值
    if (mainData.category) {
      mainData.category = convertCategoryToChinese(mainData.category);
    }
    
    // 输入验证
    const validationErrors = validateErrorCodeData(mainData);
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        message: req.t('shared.validationFailed'), 
        errors: validationErrors 
      });
    }
    
    // 检查子系统+故障码组合是否唯一
    const duplicateCheck = await ErrorCode.findOne({ 
      where: { 
        subsystem: mainData.subsystem, 
        code: mainData.code 
      } 
    });
    if (duplicateCheck) {
      return res.status(409).json({ message: req.t('errorCode.duplicate') });
    }
    
    // 根据故障码自动判断故障等级和处理措施
    const { level, solution } = analyzeErrorCode(mainData.code);
    
    // 创建故障码数据，自动设置等级和处理措施，专家模式和初学者模式默认为True
    const errorCodeData = {
      ...mainData,
      level,
      solution,
      for_expert: mainData.for_expert !== undefined ? mainData.for_expert : true,
      for_novice: mainData.for_novice !== undefined ? mainData.for_novice : true
    };
    
    const errorCode = await ErrorCode.create(errorCodeData);
    
    // 注意：short_message/user_hint/operation 的多语言内容由多语言管理模块管理
    // 此处不再自动创建多语言记录
    
    // 保存分析分类关联
    if (data.analysisCategories && Array.isArray(data.analysisCategories) && data.analysisCategories.length > 0) {
      try {
        const categoryAssociations = data.analysisCategories.map(categoryId => ({
          error_code_id: errorCode.id,
          analysis_category_id: categoryId
        }));
        await ErrorCodeAnalysisCategory.bulkCreate(categoryAssociations);
        // 同步 code_category_map
        await upsertCodeCategoryMapForErrorCode(errorCode.id, data.analysisCategories);
      } catch (categoryError) {
        console.warn('创建分析分类关联失败，但不影响故障码创建:', categoryError.message);
      }
    }
    
    // 记录操作日志（如果失败不影响主要操作）
    if (req.user) {
      try {
        await logOperation({
          user_id: req.user.id,
          username: req.user.username,
          operation: '新增故障码',
          description: `新增故障码: ${data.code}`,
          details: {
            errorCodeId: errorCode.id,
            code: data.code,
            subsystem: data.subsystem
          }
        });
      } catch (logError) {
        console.warn('记录操作日志失败，但不影响故障码创建:', logError.message);
      }
    }
    
    // 重新加载故障码缓存
    try {
      await errorCodeCache.reloadCache();
      console.log('🔄 故障码缓存已重新加载（新增故障码后）');
    } catch (cacheError) {
      console.warn('⚠️ 重新加载故障码缓存失败，但不影响故障码创建:', cacheError.message);
    }
    
    res.status(201).json({ message: req.t('shared.created'), errorCode });
  } catch (err) {
    console.error('创建故障码失败:', err);
    res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

// 查询故障码（支持简单和高级搜索）
const getErrorCodes = async (req, res) => {
  try {
    const { code, subsystem, level, category, keyword } = req.query;
    let { page = 1, limit = 10 } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    const where = {};
    if (code) where.code = code;
    if (subsystem) where.subsystem = subsystem;
    if (level) where.level = level;
    if (category) where.category = category;
    if (keyword) {
      where[Op.or] = [
        { short_message: { [Op.like]: `%${keyword}%` } },
        { user_hint: { [Op.like]: `%${keyword}%` } },
        { operation: { [Op.like]: `%${keyword}%` } },
        { code: { [Op.like]: `%${keyword}%` } }
      ];
    }
    const { count: total, rows: errorCodes } = await ErrorCode.findAndCountAll({
      where,
      offset: (page - 1) * limit,
      limit,
      distinct: true,  // ✅ 修复：使用 distinct 避免多对多关联导致的重复计数
      include: [
        {
          model: AnalysisCategory,
          as: 'analysisCategories',
          through: { attributes: [] }, // 不返回关联表的字段
          attributes: ['id', 'category_key', 'name_zh', 'name_en']
        },
        {
          model: I18nErrorCode,
          as: 'i18nContents',
          required: false,
          attributes: ['id', 'lang', 'short_message', 'user_hint', 'operation', 'detail', 'method', 'param1', 'param2', 'param3', 'param4', 'tech_solution', 'explanation']
        }
      ]
    });
    
    // 根据请求语言合并多语言内容
    // 从 Accept-Language 头或查询参数获取语言偏好
    const acceptLanguage = req.headers['accept-language'] || req.query.lang || 'zh';
    // 标准化语言代码：'en-US' -> 'en', 'zh-CN' -> 'zh', 'zh' -> 'zh'
    const targetLang = acceptLanguage.startsWith('en') ? 'en' : (acceptLanguage.startsWith('zh') ? 'zh' : acceptLanguage.split('-')[0]);
    
    // 处理每个故障码，合并对应语言的多语言内容
    const processedErrorCodes = errorCodes.map(errorCode => {
      const errorCodeData = errorCode.toJSON();
      
      // 如果是中文，直接返回主表数据（不需要合并）
      if (targetLang === 'zh' || targetLang === 'zh-CN') {
        // 移除 i18nContents，因为不需要
        delete errorCodeData.i18nContents;
        return errorCodeData;
      }
      
      // 查找对应语言的多语言内容
      const i18nContent = errorCodeData.i18nContents?.find(content => {
        // 匹配语言代码：'en' 匹配 'en', 'en-US' 等
        const contentLang = content.lang.split('-')[0];
        return contentLang === targetLang;
      });
      
      // 如果找到对应语言的内容，合并到主记录
      if (i18nContent) {
        // 合并多语言字段：只要多语言记录存在该字段（即使为空字符串），就使用多语言值
        const i18nFields = [
          'short_message',
          'user_hint',
          'operation',
          'detail',
          'method',
          'param1',
          'param2',
          'param3',
          'param4',
          'tech_solution',
          'explanation',
        ];
        i18nFields.forEach((field) => {
          if (Object.prototype.hasOwnProperty.call(i18nContent, field)) {
            errorCodeData[field] = i18nContent[field] ?? '';
          }
        });
      }
      
      // 移除 i18nContents 数组，因为已经合并到主记录
      delete errorCodeData.i18nContents;
      
      return errorCodeData;
    });
    
    res.json({ errorCodes: processedErrorCodes, total });
  } catch (err) {
    res.status(500).json({ message: '查询失败', error: err.message });
  }
};

// 更新故障码
const updateErrorCode = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    // 注意：short_message_en/user_hint_en/operation_en 已由多语言管理模块管理
    // 此处不再处理这些字段
    const mainData = stripEnglishFields(data);
    
    // 转换分类为中文值
    if (mainData.category) {
      mainData.category = convertCategoryToChinese(mainData.category);
    }
    
    // 查找故障码
    const errorCode = await ErrorCode.findByPk(id);
    if (!errorCode) {
      return res.status(404).json({ message: req.t('shared.notFound') });
    }
    
    // 输入验证
    const validationErrors = validateErrorCodeData(mainData);
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        message: req.t('shared.validationFailed'), 
        errors: validationErrors 
      });
    }
    
    // 检查子系统+故障码组合唯一性（排除当前记录）
    if ((mainData.subsystem && mainData.subsystem !== errorCode.subsystem) || 
        (mainData.code && mainData.code !== errorCode.code)) {
      const duplicateCheck = await ErrorCode.findOne({ 
        where: { 
          subsystem: mainData.subsystem || errorCode.subsystem, 
          code: mainData.code || errorCode.code,
          id: { [Op.ne]: id }
        } 
      });
      if (duplicateCheck) {
        return res.status(409).json({ message: req.t('errorCode.duplicate') });
      }
    }
    
    // 保存更新前的数据用于日志记录
    const oldData = {
      code: errorCode.code,
      subsystem: errorCode.subsystem,
      category: errorCode.category
    };
    
    // 始终根据故障码重新计算等级和处理措施，确保存储的是中文枚举值
    // 使用更新后的故障码（如果有）或当前故障码
    const codeToAnalyze = mainData.code || errorCode.code;
    const { level, solution } = analyzeErrorCode(codeToAnalyze);
    let updateData = { ...mainData };
    updateData.level = level;  // 始终使用重新计算的中文值
    updateData.solution = solution;  // 始终使用重新计算的英文键值
    
    await errorCode.update(updateData);
    
    // 注意：short_message/user_hint/operation 的多语言内容由多语言管理模块管理
    // 此处不再自动创建/更新多语言记录
    
    // 更新分析分类关联
    if (data.analysisCategories !== undefined) {
      try {
        // 先删除所有现有关联
        await ErrorCodeAnalysisCategory.destroy({
          where: { error_code_id: errorCode.id }
        });
        
        // 如果有新的分类，创建新关联
        if (Array.isArray(data.analysisCategories) && data.analysisCategories.length > 0) {
          const categoryAssociations = data.analysisCategories.map(categoryId => ({
            error_code_id: errorCode.id,
            analysis_category_id: categoryId
          }));
          await ErrorCodeAnalysisCategory.bulkCreate(categoryAssociations);
        }
        // 同步 code_category_map（无分类则清空映射）
        await upsertCodeCategoryMapForErrorCode(errorCode.id, Array.isArray(data.analysisCategories) ? data.analysisCategories : []);
      } catch (categoryError) {
        console.warn('更新分析分类关联失败，但不影响故障码更新:', categoryError.message);
      }
    }
    
    // 记录操作日志（如果失败不影响主要操作）
    if (req.user) {
      try {
        await logOperation({
          user_id: req.user.id,
          username: req.user.username,
          operation: '更新故障码',
          description: `更新故障码: ${errorCode.code}`,
          details: {
            errorCodeId: errorCode.id,
            oldData,
            newData: {
              code: errorCode.code,
              subsystem: errorCode.subsystem,
              category: errorCode.category
            }
          }
        });
      } catch (logError) {
        console.warn('记录操作日志失败，但不影响故障码更新:', logError.message);
      }
    }
    
    // 重新加载故障码缓存
    try {
      await errorCodeCache.reloadCache();
      console.log('🔄 故障码缓存已重新加载（更新故障码后）');
    } catch (cacheError) {
      console.warn('⚠️ 重新加载故障码缓存失败，但不影响故障码更新:', cacheError.message);
    }
    
    res.json({ message: req.t('shared.updated'), errorCode });
  } catch (err) {
    console.error('更新故障码失败:', err);
    res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

// 删除故障码
const deleteErrorCode = async (req, res) => {
  try {
    const { id } = req.params;
    const errorCode = await ErrorCode.findByPk(id);
    if (!errorCode) {
      return res.status(404).json({ message: req.t('shared.notFound') });
    }
    
    // 保存删除的数据用于日志记录
    const deletedData = {
      code: errorCode.code,
      subsystem: errorCode.subsystem,
      category: errorCode.category
    };
    
    // 同步删除多语言记录
    try {
      await I18nErrorCode.destroy({
        where: { error_code_id: errorCode.id }
      });
    } catch (i18nError) {
      console.warn('删除多语言记录失败，但不影响故障码删除:', i18nError.message);
    }
    
    // 同步删除 code_category_map 映射（删除故障码前）
    try {
      const subsystemChar = normalizeSubsystemChar(errorCode.subsystem);
      const code4 = normalizeCode4(errorCode.code);
      if (subsystemChar && code4) {
        await sequelize.query(
          'DELETE FROM code_category_map WHERE subsystem_char = :s AND code4 = :c',
          { replacements: { s: subsystemChar, c: code4 } }
        );
        console.log(`🧹 已清理 code_category_map 中的映射: ${subsystemChar}/${code4}`);
      }
    } catch (mapError) {
      console.warn('清理 code_category_map 映射失败，但不影响故障码删除:', mapError.message);
    }
    
    await errorCode.destroy();
    
    // 记录操作日志（如果失败不影响主要操作）
    if (req.user) {
      try {
        await logOperation({
          user_id: req.user.id,
          username: req.user.username,
          operation: '删除故障码',
          description: `删除故障码: ${deletedData.code}`,
          details: {
            errorCodeId: id,
            deletedData
          }
        });
      } catch (logError) {
        console.warn('记录操作日志失败，但不影响故障码删除:', logError.message);
      }
    }
    
    // 重新加载故障码缓存
    try {
      await errorCodeCache.reloadCache();
      console.log('🔄 故障码缓存已重新加载（删除故障码后）');
    } catch (cacheError) {
      console.warn('⚠️ 重新加载故障码缓存失败，但不影响故障码删除:', cacheError.message);
    }
    
    res.json({ message: req.t('shared.deleted') });
  } catch (err) {
    console.error('删除故障码失败:', err);
    res.status(500).json({ message: req.t('shared.deleteFailed'), error: err.message });
  }
};

// XML导出功能
const exportErrorCodesToXML = async (req, res) => {
  try {
    const { language = 'zh' } = req.query;
    
    // 语言代码映射 - 只支持指定的10种语言
    const langMap = {
      'zh': 'zh',      // 中文（简体）
      'en': 'en',      // 英语
      'fr': 'fr',      // 法语
      'de': 'de',      // 德语
      'es': 'es',      // 西班牙语
      'it': 'it',      // 意大利语
      'pt': 'pt',      // 葡萄牙语
      'nl': 'nl',      // 荷兰语
      'sk': 'sk',      // 斯洛伐克语
      'ro': 'ro',      // 罗马尼亚语
      'da': 'da'       // 丹麦语
    };
    
    const targetLang = langMap[language] || 'zh';
    
    // 获取所有故障码及其多语言内容
    const errorCodes = await ErrorCode.findAll({
      include: [{
        model: I18nErrorCode,
        as: 'i18nContents',
        where: { lang: targetLang },
        required: false
      }],
      order: [['subsystem', 'ASC'], ['code', 'ASC']]
    });
    
    if (errorCodes.length === 0) {
      return res.status(404).json({ message: req.t('errorCode.noData') });
    }
    
    // 生成XML内容
    let xmlContent = "<?xml version='1.0' encoding='utf-8'?>\n<Medbot>\n";
    
    // 添加前缀信息
    xmlContent += `\t<prefix>
\t\t<prefix_arm>
\t\t\t<arm_num id="1">${targetLang === 'en' ? 'Left hand' : '左手'}</arm_num>
\t\t\t<arm_num id="2">${targetLang === 'en' ? 'Right hand' : '右手'}</arm_num>
\t\t\t<arm_num id="3">${targetLang === 'en' ? 'Arm 1' : '1号臂'}</arm_num>
\t\t\t<arm_num id="4">${targetLang === 'en' ? 'Arm 2' : '2号臂'}</arm_num>
\t\t\t<arm_num id="5">${targetLang === 'en' ? 'Arm 3' : '3号臂'}</arm_num>
\t\t\t<arm_num id="6">${targetLang === 'en' ? 'Arm 4' : '4号臂'}</arm_num>
\t\t\t<arm_num id="7">${targetLang === 'en' ? 'Arm 1' : '1号臂'}</arm_num>
\t\t\t<arm_num id="8">${targetLang === 'en' ? 'Arm 2' : '2号臂'}</arm_num>
\t\t\t<arm_num id="9">${targetLang === 'en' ? 'Arm 3' : '3号臂'}</arm_num>
\t\t\t<arm_num id="10">${targetLang === 'en' ? 'Arm 4' : '4号臂'}</arm_num>
\t\t\t<arm_num id="11">${targetLang === 'en' ? 'Slave IO' : '主端IO'}</arm_num>
\t\t\t<arm_num id="12">${targetLang === 'en' ? 'Master IO' : '从端IO'}</arm_num>
\t\t</prefix_arm>
\t\t<prefix_axis>
\t\t\t<axis_num id="1">${targetLang === 'en' ? 'Joint 1' : '关节1'}</axis_num>
\t\t\t<axis_num id="2">${targetLang === 'en' ? 'Joint 2' : '关节2'}</axis_num>
\t\t\t<axis_num id="3">${targetLang === 'en' ? 'Joint 3' : '关节3'}</axis_num>
\t\t\t<axis_num id="4">${targetLang === 'en' ? 'Joint 4' : '关节4'}</axis_num>
\t\t\t<axis_num id="5">${targetLang === 'en' ? 'Joint 5' : '关节5'}</axis_num>
\t\t\t<axis_num id="6">${targetLang === 'en' ? 'Joint 6' : '关节6'}</axis_num>
\t\t\t<axis_num id="7">${targetLang === 'en' ? 'Joint 7' : '关节7'}</axis_num>
\t\t</prefix_axis>
\t\t<prefix_patient>
\t\t\t<axis_num id="0">${targetLang === 'en' ? 'Armrest' : '扶手'}</axis_num>
\t\t\t<axis_num id="1">${targetLang === 'en' ? 'Left wheel' : '左轮'}</axis_num>
\t\t\t<axis_num id="2">${targetLang === 'en' ? 'Right wheel' : '右轮'}</axis_num>
\t\t\t<axis_num id="3">${targetLang === 'en' ? 'Support' : '支撑'}</axis_num>
\t\t\t<axis_num id="4">${targetLang === 'en' ? 'Column lifting' : '立柱升降'}</axis_num>
\t\t\t<axis_num id="5">${targetLang === 'en' ? 'IO Module' : 'IO 模组'}</axis_num>
\t\t\t<axis_num id="6">${targetLang === 'en' ? 'Beam extension' : '横梁伸缩'}</axis_num>
\t\t\t<axis_num id="7">${targetLang === 'en' ? 'Main suspension rotation' : '主悬吊旋转'}</axis_num>
\t\t\t<axis_num id="8">${targetLang === 'en' ? 'Beam rotation' : '横梁旋转'}</axis_num>
\t\t\t<axis_num id="9">${targetLang === 'en' ? 'Battery' : '锂电池'}</axis_num>
\t\t</prefix_patient>
\t</prefix>
\t<instance>\n`;

    // 按子系统分组
    const groupedByCodes = {};
    errorCodes.forEach(errorCode => {
      if (!groupedByCodes[errorCode.subsystem]) {
        groupedByCodes[errorCode.subsystem] = [];
      }
      groupedByCodes[errorCode.subsystem].push(errorCode);
    });

    // 生成每个子系统的故障码
    Object.keys(groupedByCodes).sort().forEach(subsystem => {
      xmlContent += `\t\t<subsystem id="${subsystem}">\n`;
      
      groupedByCodes[subsystem].forEach(errorCode => {
        // 获取多语言内容
        const i18nContent = errorCode.i18nContents && errorCode.i18nContents.length > 0 
          ? errorCode.i18nContents[0] 
          : null;
        
        xmlContent += `\t\t\t<error_code id="${errorCode.code}">\n`;
        xmlContent += `\t\t\t\t<axis>${errorCode.is_axis_error ? 'True' : 'False'}</axis>\n`;
        xmlContent += `\t\t\t\t<description>${escapeXml(errorCode.detail || '')}</description>\n`;
        
        // 优先使用 i18n 内容；若无，则回退主表中文
        const shortMessage = i18nContent ? i18nContent.short_message : errorCode.short_message;
        const userHint = i18nContent ? i18nContent.user_hint : errorCode.user_hint;
        const operation = i18nContent ? i18nContent.operation : errorCode.operation;
        
        xmlContent += `\t\t\t\t<simple>${escapeXml(shortMessage || '')}</simple>\n`;
        xmlContent += `\t\t\t\t<userInfo>${escapeXml(userHint || '')}</userInfo>\n`;
        xmlContent += `\t\t\t\t<opinfo>${escapeXml(operation || '')}</opinfo>\n`;
        
        xmlContent += `\t\t\t\t<isArm>${errorCode.is_arm_error ? 'True' : 'False'}</isArm>\n`;
        xmlContent += `\t\t\t\t<detInfo>${escapeXml(errorCode.detail || '')}</detInfo>\n`;
        xmlContent += `\t\t\t\t<method>${escapeXml(errorCode.method || '')}</method>\n`;
        xmlContent += `\t\t\t\t<para1>${escapeXml(errorCode.param1 || '')}</para1>\n`;
        xmlContent += `\t\t\t\t<para2>${escapeXml(errorCode.param2 || '')}</para2>\n`;
        xmlContent += `\t\t\t\t<para3>${escapeXml(errorCode.param3 || '')}</para3>\n`;
        xmlContent += `\t\t\t\t<para4>${escapeXml(errorCode.param4 || '')}</para4>\n`;
        xmlContent += `\t\t\t\t<expert>${errorCode.for_expert ? '1.0' : '0.0'}</expert>\n`;
        xmlContent += `\t\t\t\t<learner>${errorCode.for_novice ? '1.0' : '0.0'}</learner>\n`;
        xmlContent += `\t\t\t\t<log>${errorCode.related_log ? '1.0' : '0.0'}</log>\n`;
        xmlContent += `\t\t\t\t<action>${errorCode.solution || 'tip'}</action>\n`;
        xmlContent += `\t\t\t</error_code>\n`;
      });
      
      xmlContent += `\t\t</subsystem>\n`;
    });

    xmlContent += `\t</instance>\n</Medbot>`;
    
    // 记录操作日志（如果失败不影响主要操作）
    if (req.user) {
      try {
        await logOperation({
          user_id: req.user.id,
          username: req.user.username,
          operation: 'XML导出',
          description: `导出故障码XML文件 (语言: ${language})`,
          details: {
            language,
            exportCount: errorCodes.length
          }
        });
      } catch (logError) {
        console.warn('记录操作日志失败，但不影响XML导出:', logError.message);
      }
    }
    
    // 设置响应头
    const filename = `FaultAnalysis_${language}.xml`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    res.send(xmlContent);
  } catch (err) {
    console.error('XML导出失败:', err);
    res.status(500).json({ message: 'XML导出失败', error: err.message });
  }
};

// XML转义函数
const escapeXml = (text) => {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// 多语言XML导出功能
const exportMultiLanguageXML = async (req, res) => {
  try {
    const { languages = 'zh' } = req.query;
    const langList = languages.split(',').map(lang => lang.trim());
    
    // 语言代码映射 - 只支持指定的10种语言
    const langMap = {
      'zh': 'zh',      // 中文（简体）
      'en': 'en',      // 英语
      'fr': 'fr',      // 法语
      'de': 'de',      // 德语
      'es': 'es',      // 西班牙语
      'it': 'it',      // 意大利语
      'pt': 'pt',      // 葡萄牙语
      'nl': 'nl',      // 荷兰语
      'sk': 'sk',      // 斯洛伐克语
      'ro': 'ro',      // 罗马尼亚语
      'da': 'da'       // 丹麦语
    };
    
    // 转换语言代码
    const targetLangList = langList.map(lang => langMap[lang] || lang);
    
    // 获取所有故障码及其多语言内容
    const errorCodes = await ErrorCode.findAll({
      include: [{
        model: I18nErrorCode,
        as: 'i18nContents',
        required: false
      }],
      order: [['subsystem', 'ASC'], ['code', 'ASC']]
    });
    
    if (errorCodes.length === 0) {
      return res.status(404).json({ message: '没有找到故障码数据' });
    }
    
    console.log(`找到 ${errorCodes.length} 个故障码`);
    console.log('请求的语言:', langList);
    console.log('目标语言:', targetLangList);
    
    const xmlResults = {};
    
    // 为每种语言生成XML
    for (const language of langList) {
      const targetLang = langMap[language] || language;
      let xmlContent = "<?xml version='1.0' encoding='utf-8'?>\n<Medbot>\n";
      
      // 添加前缀信息
      xmlContent += `\t<prefix>
\t\t<prefix_arm>
\t\t\t<arm_num id="1">${targetLang === 'en' ? 'Left hand' : '左手'}</arm_num>
\t\t\t<arm_num id="2">${targetLang === 'en' ? 'Right hand' : '右手'}</arm_num>
\t\t\t<arm_num id="3">${targetLang === 'en' ? 'Arm 1' : '1号臂'}</arm_num>
\t\t\t<arm_num id="4">${targetLang === 'en' ? 'Arm 2' : '2号臂'}</arm_num>
\t\t\t<arm_num id="5">${targetLang === 'en' ? 'Arm 3' : '3号臂'}</arm_num>
\t\t\t<arm_num id="6">${targetLang === 'en' ? 'Arm 4' : '4号臂'}</arm_num>
\t\t\t<arm_num id="7">${targetLang === 'en' ? 'Arm 1' : '1号臂'}</arm_num>
\t\t\t<arm_num id="8">${targetLang === 'en' ? 'Arm 2' : '2号臂'}</arm_num>
\t\t\t<arm_num id="9">${targetLang === 'en' ? 'Arm 3' : '3号臂'}</arm_num>
\t\t\t<arm_num id="10">${targetLang === 'en' ? 'Arm 4' : '4号臂'}</arm_num>
\t\t\t<arm_num id="11">${targetLang === 'en' ? 'Slave IO' : '主端IO'}</arm_num>
\t\t\t<arm_num id="12">${targetLang === 'en' ? 'Master IO' : '从端IO'}</arm_num>
\t\t</prefix_arm>
\t\t<prefix_axis>
\t\t\t<axis_num id="1">${targetLang === 'en' ? 'Joint 1' : '关节1'}</axis_num>
\t\t\t<axis_num id="2">${targetLang === 'en' ? 'Joint 2' : '关节2'}</axis_num>
\t\t\t<axis_num id="3">${targetLang === 'en' ? 'Joint 3' : '关节3'}</axis_num>
\t\t\t<axis_num id="4">${targetLang === 'en' ? 'Joint 4' : '关节4'}</axis_num>
\t\t\t<axis_num id="5">${targetLang === 'en' ? 'Joint 5' : '关节5'}</axis_num>
\t\t\t<axis_num id="6">${targetLang === 'en' ? 'Joint 6' : '关节6'}</axis_num>
\t\t\t<axis_num id="7">${targetLang === 'en' ? 'Joint 7' : '关节7'}</axis_num>
\t\t</prefix_axis>
\t\t<prefix_patient>
\t\t\t<axis_num id="0">${targetLang === 'en' ? 'Armrest' : '扶手'}</axis_num>
\t\t\t<axis_num id="1">${targetLang === 'en' ? 'Left wheel' : '左轮'}</axis_num>
\t\t\t<axis_num id="2">${targetLang === 'en' ? 'Right wheel' : '右轮'}</axis_num>
\t\t\t<axis_num id="3">${targetLang === 'en' ? 'Support' : '支撑'}</axis_num>
\t\t\t<axis_num id="4">${targetLang === 'en' ? 'Column lifting' : '立柱升降'}</axis_num>
\t\t\t<axis_num id="5">${targetLang === 'en' ? 'IO Module' : 'IO 模组'}</axis_num>
\t\t\t<axis_num id="6">${targetLang === 'en' ? 'Beam extension' : '横梁伸缩'}</axis_num>
\t\t\t<axis_num id="7">${targetLang === 'en' ? 'Main suspension rotation' : '主悬吊旋转'}</axis_num>
\t\t\t<axis_num id="8">${targetLang === 'en' ? 'Beam rotation' : '横梁旋转'}</axis_num>
\t\t\t<axis_num id="9">${targetLang === 'en' ? 'Battery' : '锂电池'}</axis_num>
\t\t</prefix_patient>
\t</prefix>
\t<instance>\n`;

      // 按子系统分组
      const groupedByCodes = {};
      errorCodes.forEach(errorCode => {
        if (!groupedByCodes[errorCode.subsystem]) {
          groupedByCodes[errorCode.subsystem] = [];
        }
        groupedByCodes[errorCode.subsystem].push(errorCode);
      });

      // 生成每个子系统的故障码
      Object.keys(groupedByCodes).sort().forEach(subsystem => {
        xmlContent += `\t\t<subsystem id="${subsystem}">\n`;
        
        groupedByCodes[subsystem].forEach(errorCode => {
          // 获取当前语言的多语言内容
          const i18nContent = errorCode.i18nContents && errorCode.i18nContents.length > 0 
            ? errorCode.i18nContents.find(content => content.lang === targetLang)
            : null;
          
          // 调试信息
          if (errorCode.code === '0X010A') {
            console.log(`故障码 ${errorCode.code} 的多语言内容:`, errorCode.i18nContents);
            console.log(`目标语言 ${targetLang} 的内容:`, i18nContent);
          }
          
          xmlContent += `\t\t\t<error_code id="${errorCode.code}">\n`;
          xmlContent += `\t\t\t\t<axis>${errorCode.is_axis_error ? 'True' : 'False'}</axis>\n`;
          xmlContent += `\t\t\t\t<description>${escapeXml(errorCode.detail || '')}</description>\n`;
          
          // 优先使用 i18n 内容；若无，则回退主表中文
          const shortMessage = i18nContent ? i18nContent.short_message : errorCode.short_message;
          const userHint = i18nContent ? i18nContent.user_hint : errorCode.user_hint;
          const operation = i18nContent ? i18nContent.operation : errorCode.operation;
          
          xmlContent += `\t\t\t\t<simple>${escapeXml(shortMessage || '')}</simple>\n`;
          xmlContent += `\t\t\t\t<userInfo>${escapeXml(userHint || '')}</userInfo>\n`;
          xmlContent += `\t\t\t\t<opinfo>${escapeXml(operation || '')}</opinfo>\n`;
          
          xmlContent += `\t\t\t\t<isArm>${errorCode.is_arm_error ? 'True' : 'False'}</isArm>\n`;
          xmlContent += `\t\t\t\t<detInfo>${escapeXml(errorCode.detail || '')}</detInfo>\n`;
          xmlContent += `\t\t\t\t<method>${escapeXml(errorCode.method || '')}</method>\n`;
          xmlContent += `\t\t\t\t<para1>${escapeXml(errorCode.param1 || '')}</para1>\n`;
          xmlContent += `\t\t\t\t<para2>${escapeXml(errorCode.param2 || '')}</para2>\n`;
          xmlContent += `\t\t\t\t<para3>${escapeXml(errorCode.param3 || '')}</para3>\n`;
          xmlContent += `\t\t\t\t<para4>${escapeXml(errorCode.param4 || '')}</para4>\n`;
          xmlContent += `\t\t\t\t<expert>${errorCode.for_expert ? '1.0' : '0.0'}</expert>\n`;
          xmlContent += `\t\t\t\t<learner>${errorCode.for_novice ? '1.0' : '0.0'}</learner>\n`;
          xmlContent += `\t\t\t\t<log>${errorCode.related_log ? '1.0' : '0.0'}</log>\n`;
          xmlContent += `\t\t\t\t<action>${errorCode.solution || 'tip'}</action>\n`;
          xmlContent += `\t\t\t</error_code>\n`;
        });
        
        xmlContent += `\t\t</subsystem>\n`;
      });

      xmlContent += `\t</instance>\n</Medbot>`;
      xmlResults[language] = xmlContent;
    }
    
    // 记录操作日志
    if (req.user) {
      try {
        await logOperation({
          user_id: req.user.id,
          username: req.user.username,
          operation: '多语言XML导出',
          description: `导出故障码多语言XML文件 (语言: ${langList.join(', ')})`,
          details: {
            languages: langList,
            exportCount: errorCodes.length
          }
        });
      } catch (logError) {
        console.warn('记录操作日志失败，但不影响多语言XML导出:', logError.message);
      }
    }
    
    res.json({
      message: '多语言XML导出成功',
      languages: langList,
      xmlResults
    });
  } catch (err) {
    console.error('多语言XML导出失败:', err);
    res.status(500).json({ message: '多语言XML导出失败', error: err.message });
  }
};

// CSV导出功能（包含主表全部字段，可选包含多语言字段）
const exportErrorCodesToCSV = async (req, res) => {
  try {
    const { language = '', format = 'csv' } = req.query;
    const targetLang = String(language).trim();

    // 支持的语言列表（与系统一致）
    const supportedLangs = new Set(['zh', 'en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'sk', 'ro', 'da']);
    const isValidLang = targetLang && supportedLangs.has(targetLang);

    // 读取所有故障码以及所有多语言内容（用于替换）
    const errorCodes = await ErrorCode.findAll({
      include: [
        {
          model: I18nErrorCode,
          as: 'i18nContents',
          required: false,
          attributes: ['lang', 'short_message', 'user_hint', 'operation', 'detail', 'method', 'param1', 'param2', 'param3', 'param4', 'tech_solution', 'explanation']
        },
        {
          model: AnalysisCategory,
          as: 'analysisCategories',
          through: { attributes: [] },
          attributes: ['id', 'category_key', 'name_zh', 'name_en']
        }
      ],
      order: [['subsystem', 'ASC'], ['code', 'ASC']]
    });

    if (!errorCodes || errorCodes.length === 0) {
      return res.status(404).json({ message: '没有找到故障码数据' });
    }

    // 根据格式选择分隔符和转义函数
    const isTsv = format === 'tsv';
    const separator = isTsv ? '\t' : ',';
    
    // 根据格式选择字段
    const baseFields = isTsv ? [
      'id',
      'subsystem',
      'code',
      'is_axis_error',
      'is_arm_error',
      'short_message',
      'user_hint',
      'operation',
      'detail',
      'method',
      'param1',
      'param2',
      'param3',
      'param4',
      'solution',
      'for_expert',
      'for_novice',
      'related_log',
      'stop_report',
      'level',
      'tech_solution',
      'explanation',
      'category'
    ] : [
      'id',
      'subsystem',
      'code',
      'is_axis_error',
      'is_arm_error',
      'short_message',
      'user_hint',
      'operation',
      'detail',
      'method',
      'param1',
      'param2',
      'param3',
      'param4',
      'solution',
      'for_expert',
      'for_novice',
      'related_log',
      'stop_report',
      'level',
      'category'
    ];

    const header = [...baseFields];

    // CSV/TSV 转义 - 处理包含特殊字符的内容
    const escapeValue = (value) => {
      if (value === null || value === undefined) return '""';
      let s = String(value)
        .replace(/"/g, '""')  // 双引号转义
        .replace(/\n/g, ' ')  // 换行符替换为空格
        .replace(/\r/g, ' '); // 回车符替换为空格
      
      // TSV格式：制表符替换为空格
      if (isTsv) {
        s = s.replace(/\t/g, ' ');
      }
      
      return `"${s}"`;
    };

    // 生成行
    const lines = [];
    // 表头
    lines.push(header.map(escapeValue).join(separator));

    // 多语言字段列表（这些字段如果在 i18n_error_codes 中有对应语言的内容，则替换）
    const i18nFields = ['short_message', 'user_hint', 'operation', 'detail', 'method', 'param1', 'param2', 'param3', 'param4', 'tech_solution', 'explanation'];

    for (const ec of errorCodes) {
      const row = [];
      const ecPlain = ec.toJSON();

      // 分析分类（导出为逗号分隔的名称，中文优先）
      const categoryNames = Array.isArray(ecPlain.analysisCategories)
        ? ecPlain.analysisCategories.map((c) => c.name_zh || c.name_en || c.category_key).join('|')
        : '';

      // 如果选择了语言，查找对应语言的多语言内容
      let i18nContent = null;
      if (isValidLang && targetLang !== 'zh') {
        // 查找对应语言的多语言内容
        if (Array.isArray(ecPlain.i18nContents)) {
          i18nContent = ecPlain.i18nContents.find(content => {
            // 匹配语言代码：'en' 匹配 'en', 'en-US' 等
            const contentLang = content.lang.split('-')[0];
            return contentLang === targetLang;
          });
        }
      }

      // 填充基础字段
      for (const field of baseFields) {
        if (field === 'category' && categoryNames) {
          row.push(escapeValue(categoryNames));
          continue;
        }
        
        // subsystem字段保持原样，不做任何处理
        if (field === 'subsystem') {
          row.push(escapeValue(ecPlain[field]));
          continue;
        }
        
        // 如果是多语言字段，且找到了对应语言的内容，则使用多语言内容
        // 注意：即使多语言字段为空字符串，只要存在对应语言的多语言记录，也应该使用（可能是空字符串）
        if (i18nFields.includes(field) && i18nContent && i18nContent.hasOwnProperty(field)) {
          row.push(escapeValue(i18nContent[field] || ''));
        } else {
          // 否则使用主表的中文内容
          row.push(escapeValue(ecPlain[field]));
        }
      }

      lines.push(row.join(separator));
    }

    // 记录操作日志
    if (req.user) {
      try {
        await logOperation({
          user_id: req.user.id,
          username: req.user.username,
          operation: 'CSV导出',
          description: `导出故障码CSV文件 (语言: ${targetLang || '中文/默认'})`,
          details: { language: targetLang || 'zh', exportCount: errorCodes.length }
        });
      } catch {}
    }

    // 输出 CSV/TSV（带 BOM 以兼容 Excel）
    const bom = '\uFEFF';
    const content = bom + lines.join('\r\n');
    const extension = isTsv ? 'tsv' : 'csv';
    const mimeType = isTsv ? 'text/tab-separated-values' : 'text/csv';
    const filename = `error_codes_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.${extension}`;
    res.setHeader('Content-Type', `${mimeType}; charset=utf-8`);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(content);
  } catch (err) {
    console.error('CSV导出失败:', err);
    return res.status(500).json({ message: 'CSV导出失败', error: err.message });
  }
};

// 根据故障码和子系统查找故障码
const getErrorCodeByCodeAndSubsystem = async (req, res) => {
  try {
    const { code, subsystem } = req.query;
    
    if (!code || !subsystem) {
      return res.status(400).json({ message: '故障码和子系统参数都是必需的' });
    }
    
    const errorCode = await ErrorCode.findOne({
      where: { code, subsystem },
      include: [
        {
          model: I18nErrorCode,
          as: 'i18nContents',
          required: false,
          attributes: ['id', 'lang', 'short_message', 'user_hint', 'operation', 'detail', 'method', 'param1', 'param2', 'param3', 'param4', 'tech_solution', 'explanation']
        }
      ]
    });
    
    if (!errorCode) {
      return res.json({ errorCode: null });
    }
    
    // 根据请求语言合并多语言内容
    // 从 Accept-Language 头或查询参数获取语言偏好
    const acceptLanguage = req.headers['accept-language'] || req.query.lang || 'zh';
    // 标准化语言代码：'en-US' -> 'en', 'zh-CN' -> 'zh', 'zh' -> 'zh'
    const targetLang = acceptLanguage.startsWith('en') ? 'en' : (acceptLanguage.startsWith('zh') ? 'zh' : acceptLanguage.split('-')[0]);
    
    const errorCodeData = errorCode.toJSON();
    
    // 如果是中文，直接返回主表数据（不需要合并）
    if (targetLang !== 'zh' && targetLang !== 'zh-CN') {
      // 查找对应语言的多语言内容
      const i18nContent = errorCodeData.i18nContents?.find(content => {
        // 匹配语言代码：'en' 匹配 'en', 'en-US' 等
        const contentLang = content.lang.split('-')[0];
        return contentLang === targetLang;
      });
      
      // 如果找到对应语言的内容，合并到主记录
      if (i18nContent) {
        // 合并多语言字段：只要多语言记录存在该字段（即使为空字符串），就使用多语言值
        const i18nFields = [
          'short_message',
          'user_hint',
          'operation',
          'detail',
          'method',
          'param1',
          'param2',
          'param3',
          'param4',
          'tech_solution',
          'explanation',
        ];
        i18nFields.forEach((field) => {
          if (Object.prototype.hasOwnProperty.call(i18nContent, field)) {
            errorCodeData[field] = i18nContent[field] ?? '';
          }
        });
      }
    }
    
    // 移除 i18nContents 数组，因为已经合并到主记录
    delete errorCodeData.i18nContents;
    
    res.json({ errorCode: errorCodeData });
  } catch (err) {
    res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

// 上传技术排查方案图片（仅图片，<=MAX_IMAGES）
const uploadTechSolutionImages = async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ message: req.t('shared.validationFailed'), error: 'NO_FILE' });
    }
    if (files.length > MAX_IMAGES) {
      files.forEach((f) => safeUnlink(f.path));
      return res.status(400).json({ message: `最多上传 ${MAX_IMAGES} 个附件` });
    }

    const uploaded = [];
    for (const file of files) {
      // 处理中文文件名乱码（multer 默认 latin1）
      if (file && file.originalname) {
        file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
      }

      if (ALLOWED_MIMES.length && !ALLOWED_MIMES.includes(file.mimetype)) {
        safeUnlink(file.path);
        return res.status(400).json({ message: '文件类型不支持', error: 'UNSUPPORTED_FILE_TYPE' });
      }

      let url = '';
      let objectKey = '';
      let storage = STORAGE === 'oss' ? 'oss' : 'local';
      if (STORAGE === 'oss') {
        try {
          const client = getOssClient();
          objectKey = buildTempOssObjectKey(path.basename(file.filename || file.originalname || 'file'));
          const result = await client.put(objectKey, file.path);
          url = buildOssUrl(objectKey, result?.url);
          safeUnlink(file.path);
        } catch (err) {
          console.error('上传OSS失败:', err.message);
          safeUnlink(file.path);
          return res.status(500).json({ message: '上传失败，请稍后重试', error: err.message });
        }
      } else {
        ensureTempDir();
        const filename = path.basename(file.path);
        url = buildTempLocalUrl(filename);
        objectKey = `tmp/${filename}`;
      }

      uploaded.push({
        url,
        storage,
        filename: file.filename || objectKey,
        original_name: file.originalname,
        object_key: objectKey,
        file_type: file.mimetype && file.mimetype.startsWith('image/') ? 'image' : 'file',
        size_bytes: file.size,
        mime_type: file.mimetype
      });
    }

    res.json({ success: true, files: uploaded });
  } catch (err) {
    console.error('上传技术方案图片失败:', err);
    res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

// 获取技术排查方案（文本 + 图片）
const getTechSolutionDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const errorCode = await ErrorCode.findByPk(id, {
      include: [
        {
          model: TechSolutionImage,
          as: 'techSolutionImages',
          separate: true,
          order: [['sort_order', 'ASC'], ['id', 'ASC']]
        },
        {
          model: I18nErrorCode,
          as: 'i18nContents',
          required: false,
          attributes: ['lang', 'tech_solution']
        }
      ]
    });
    if (!errorCode) {
      return res.status(404).json({ message: req.t('shared.notFound') });
    }
    const images = (errorCode.techSolutionImages || []).map(img => mapTechImageResponse(img, req));
    let techSolutionText = errorCode.tech_solution || '';

    // 语言优先：当 Accept-Language 不是中文时，尝试使用 i18n 版本
    const acceptLanguage = req.headers['accept-language'] || req.query.lang || 'zh';
    const targetLang = acceptLanguage.startsWith('en')
      ? 'en'
      : (acceptLanguage.startsWith('zh') ? 'zh' : acceptLanguage.split('-')[0]);

    if (targetLang && targetLang !== 'zh' && targetLang !== 'zh-CN') {
      const i18nContent = errorCode.i18nContents?.find((item) => {
        const contentLang = item.lang.split('-')[0];
        return contentLang === targetLang;
      });
      if (i18nContent && typeof i18nContent.tech_solution === 'string') {
        techSolutionText = i18nContent.tech_solution;
      }
    }

    res.json({
      tech_solution: techSolutionText,
      images
    });
  } catch (err) {
    console.error('获取技术方案失败:', err);
    res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

// 更新技术排查方案（文本 + 图片）
const updateTechSolutionDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const { tech_solution = '', images = [] } = req.body || {};
    const errorCode = await ErrorCode.findByPk(id);
    if (!errorCode) {
      return res.status(404).json({ message: req.t('shared.notFound') });
    }
    if (!Array.isArray(images)) {
      return res.status(400).json({ message: 'images 必须为数组' });
    }
    if (images.length > MAX_IMAGES) {
      return res.status(400).json({ message: `最多保存 ${MAX_IMAGES} 张图片` });
    }

    // 处理临时文件：本地从 tmp 移到正式目录；OSS 从 tmp 前缀复制到正式前缀
    const finalizeAsset = async (asset, idx) => {
      let result = { ...asset };
      // 本地
      if (result.storage === 'local') {
        const isTemp = (result.object_key && result.object_key.startsWith('tmp/')) || (result.url && result.url.includes('/tmp/'));
        if (isTemp) {
          const filename = path.basename(result.object_key || result.url);
          const src = path.resolve(TMP_DIR, filename);
          const dest = path.resolve(LOCAL_DIR, filename);
          try {
            fs.renameSync(src, dest);
            result.object_key = filename;
            result.url = buildLocalUrl(filename);
          } catch (e) {
            console.warn('移动临时文件失败:', e.message);
            throw new Error('保存附件失败（本地文件移动失败）');
          }
        }
      }
      // OSS
      if (result.storage === 'oss' && result.object_key && result.object_key.includes('/tmp/')) {
        const client = getOssClient();
        const destKey = result.object_key.replace('/tmp/', '/');
        try {
          await client.copy(destKey, result.object_key);
          await client.delete(result.object_key);
          result.object_key = destKey;
          result.url = buildOssUrl(destKey);
        } catch (e) {
          console.warn('OSS 复制/删除临时文件失败:', e.message);
          throw new Error('保存附件失败（OSS 文件搬运失败）');
        }
      }
      result.sort_order = Number.isFinite(result.sort_order) ? result.sort_order : idx;
      return result;
    };

    const normalized = [];
    const baseAssets = images
      .map((img, idx) => normalizeAssetPayload(img, idx))
      .filter(Boolean)
      .slice(0, MAX_IMAGES);

    for (let i = 0; i < baseAssets.length; i++) {
      normalized.push(await finalizeAsset(baseAssets[i], i));
    }

    const assetsToSave = normalized.map((img, idx) => ({
      ...img,
      error_code_id: id,
      sort_order: Number.isFinite(img.sort_order) ? img.sort_order : idx
    }));

    await sequelize.transaction(async (t) => {
      await errorCode.update({ tech_solution: tech_solution || null }, { transaction: t });
      await TechSolutionImage.destroy({ where: { error_code_id: id }, transaction: t });
      if (assetsToSave.length > 0) {
        await TechSolutionImage.bulkCreate(assetsToSave, { transaction: t });
      }
    });

    const freshImages = await TechSolutionImage.findAll({
      where: { error_code_id: id },
      order: [['sort_order', 'ASC'], ['id', 'ASC']]
    });

    res.json({
      message: req.t('shared.updated'),
      tech_solution: tech_solution || '',
      images: freshImages.map(img => mapTechImageResponse(img, req))
    });
  } catch (err) {
    console.error('更新技术方案失败:', err);
    res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

// 清理临时附件（取消编辑时使用）
const cleanupTempTechFiles = async (req, res) => {
  try {
    const { urls = [] } = req.body || {};
    if (!Array.isArray(urls) || urls.length === 0) {
      return res.json({ deleted: [], skipped: [] });
    }
    const deleted = [];
    const skipped = [];

    for (const rawUrl of urls) {
      if (!rawUrl || typeof rawUrl !== 'string') {
        skipped.push(rawUrl);
        continue;
      }
      // 只处理 tmp 前缀
      const isLocalTmp = rawUrl.includes('/tech-solution/tmp/');
      const isOssTmp = rawUrl.includes('/tech-solution/tmp/');
      if (!isLocalTmp && !isOssTmp) {
        skipped.push(rawUrl);
        continue;
      }

      // 本地
      if (STORAGE === 'local' || rawUrl.startsWith('/static/tech-solution/tmp/')) {
        const filename = rawUrl.split('/').pop();
        const filePath = path.resolve(TMP_DIR, filename);
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
            deleted.push(rawUrl);
          } catch (e) {
            console.warn('删除本地临时文件失败:', e.message);
            skipped.push(rawUrl);
          }
        } else {
          skipped.push(rawUrl);
        }
        continue;
      }

      // OSS
      try {
        const client = getOssClient();
        // 从 URL 提取 object key：假设包含 TMP_PREFIX
        const idx = rawUrl.indexOf(TMP_PREFIX.replace(/\/$/, '/'));
        if (idx === -1) {
          skipped.push(rawUrl);
          continue;
        }
        const objectKey = rawUrl.slice(idx);
        await client.delete(objectKey);
        deleted.push(rawUrl);
      } catch (e) {
        console.warn('删除OSS临时文件失败:', e.message);
        skipped.push(rawUrl);
      }
    }

    res.json({ deleted, skipped });
  } catch (err) {
    console.error('清理临时附件失败:', err);
    res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

module.exports = {
  createErrorCode,
  getErrorCodes,
  updateErrorCode,
  deleteErrorCode,
  exportErrorCodesToXML,
  exportMultiLanguageXML,
  getErrorCodeByCodeAndSubsystem,
  exportErrorCodesToCSV,
  uploadTechSolutionImages,
  getTechSolutionDetail,
  updateTechSolutionDetail,
  cleanupTempTechFiles
}; 