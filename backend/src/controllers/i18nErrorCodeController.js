const I18nErrorCode = require('../models/i18n_error_code');
const ErrorCode = require('../models/error_code');
const { Op } = require('sequelize');
const { sequelize } = require('../models');
const { logOperation } = require('../utils/operationLogger');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const errorCodeCache = require('../services/errorCodeCache');

// 获取故障码的多语言内容
const getI18nErrorCodes = async (req, res) => {
  try {
    const { error_code_id, lang, page = 1, limit = 10, code, subsystem } = req.query;
    const where = {};
    
    if (error_code_id) where.error_code_id = error_code_id;
    if (lang) where.lang = lang;
    
    // 构建查询条件
    const includeCondition = {
      model: ErrorCode,
      as: 'errorCode',
      attributes: ['id', 'code', 'subsystem']
    };
    
    // 如果搜索故障码，添加条件
    if (code) {
      includeCondition.where = {
        code: { [Op.like]: `%${code}%` }
      };
    }
    
    // 如果搜索子系统号，添加条件
    if (subsystem) {
      if (includeCondition.where) {
        includeCondition.where.subsystem = { [Op.like]: `%${subsystem}%` };
      } else {
        includeCondition.where = {
          subsystem: { [Op.like]: `%${subsystem}%` }
        };
      }
    }
    
    const offset = (page - 1) * limit;
    
    const { count, rows: i18nErrorCodes } = await I18nErrorCode.findAndCountAll({
      where,
      include: [includeCondition],
      order: [['lang', 'ASC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    res.json({ 
      i18nErrorCodes,
      total: count,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    console.error('查询多语言故障码失败:', err);
    res.status(500).json({ message: req.t('i18nErrorCode.queryFailed'), error: err.message });
  }
};

// 创建或更新多语言故障码内容
const upsertI18nErrorCode = async (req, res) => {
  try {
    const { error_code_id, subsystem, code, lang, short_message, user_hint, operation } = req.body;
    
    // 验证必填字段
    if (!lang) {
      return res.status(400).json({ message: req.t('i18nErrorCode.languageRequired') });
    }
    
    // 验证字段组合：short_message和operation不都为空，user_hint和operation不都为空
    if ((!short_message || short_message.trim() === '') && 
        (!operation || operation.trim() === '')) {
      return res.status(400).json({ message: req.t('i18nErrorCode.shortMessageOperationRequired') });
    }
    
    if ((!user_hint || user_hint.trim() === '') && 
        (!operation || operation.trim() === '')) {
      return res.status(400).json({ message: req.t('i18nErrorCode.userHintOperationRequired') });
    }
    
    let errorCode;
    let error_code_id_to_use;
    
    // 如果提供了error_code_id，直接使用
    if (error_code_id) {
      errorCode = await ErrorCode.findByPk(error_code_id);
      if (!errorCode) {
        return res.status(404).json({ message: req.t('i18nErrorCode.errorCodeNotFound') });
      }
      error_code_id_to_use = error_code_id;
    } 
    // 如果提供了subsystem和code，通过它们查找故障码
    else if (subsystem && code) {
      errorCode = await ErrorCode.findOne({
        where: { subsystem, code }
      });
      if (!errorCode) {
        return res.status(404).json({ message: req.t('i18nErrorCode.errorCodeNotFoundWithCode', { subsystem, code }) });
      }
      error_code_id_to_use = errorCode.id;
    } 
    // 如果都没有提供，返回错误
    else {
      return res.status(400).json({ message: req.t('i18nErrorCode.errorCodeIdOrCodeRequired') });
    }
    
    // 查找是否已存在该语言的内容
    const existing = await I18nErrorCode.findOne({
      where: { error_code_id: error_code_id_to_use, lang }
    });
    
    let i18nErrorCode;
    if (existing) {
      // 更新现有记录
      await existing.update({
        short_message,
        user_hint,
        operation
      });
      i18nErrorCode = existing;
    } else {
      // 创建新记录
      i18nErrorCode = await I18nErrorCode.create({
        error_code_id: error_code_id_to_use,
        lang,
        short_message,
        user_hint,
        operation
      });
    }
    
    // 记录操作日志
    if (req.user) {
      try {
        await logOperation({
          user_id: req.user.id,
          username: req.user.username,
          operation: existing ? '更新多语言故障码' : '新增多语言故障码',
          description: `${existing ? '更新' : '新增'}故障码 ${errorCode.code} 的 ${lang} 语言内容`,
          details: {
            errorCodeId: error_code_id,
            lang,
            errorCode: errorCode.code
          }
        });
      } catch (logError) {
        console.warn('记录操作日志失败，但不影响多语言故障码操作:', logError.message);
      }
    }
    
    // 重新加载故障码缓存（多语言故障码增删改后）
    try {
      await errorCodeCache.reloadCache();
      console.log('🔄 故障码缓存已重新加载（多语言故障码操作后）');
    } catch (cacheError) {
      console.warn('⚠️ 重新加载故障码缓存失败，但不影响多语言故障码操作:', cacheError.message);
    }
    
    res.json({ 
      message: existing ? req.t('i18nErrorCode.updateSuccess') : req.t('i18nErrorCode.createSuccess'), 
      i18nErrorCode 
    });
  } catch (err) {
    console.error('操作多语言故障码失败:', err);
    res.status(500).json({ message: req.t('i18nErrorCode.operationFailed'), error: err.message });
  }
};

// 删除多语言故障码内容
const deleteI18nErrorCode = async (req, res) => {
  try {
    const { id } = req.params;
    
    const i18nErrorCode = await I18nErrorCode.findByPk(id, {
      include: [{
        model: ErrorCode,
        as: 'errorCode',
        attributes: ['id', 'code']
      }]
    });
    
    if (!i18nErrorCode) {
      return res.status(404).json({ message: req.t('i18nErrorCode.contentNotFound') });
    }
    
    await i18nErrorCode.destroy();
    
    // 记录操作日志
    if (req.user) {
      try {
        await logOperation({
          user_id: req.user.id,
          username: req.user.username,
          operation: '删除多语言故障码',
          description: `删除故障码 ${i18nErrorCode.errorCode.code} 的 ${i18nErrorCode.lang} 语言内容`,
          details: {
            errorCodeId: i18nErrorCode.error_code_id,
            lang: i18nErrorCode.lang,
            errorCode: i18nErrorCode.errorCode.code
          }
        });
      } catch (logError) {
        console.warn('记录操作日志失败，但不影响多语言故障码删除:', logError.message);
      }
    }
    
    // 重新加载故障码缓存（删除多语言故障码后）
    try {
      await errorCodeCache.reloadCache();
      console.log('🔄 故障码缓存已重新加载（删除多语言故障码后）');
    } catch (cacheError) {
      console.warn('⚠️ 重新加载故障码缓存失败，但不影响多语言故障码删除:', cacheError.message);
    }
    
    res.json({ message: req.t('i18nErrorCode.deleteSuccess') });
  } catch (err) {
    console.error('删除多语言故障码失败:', err);
    res.status(500).json({ message: req.t('i18nErrorCode.deleteFailed'), error: err.message });
  }
};

// 批量导入多语言故障码内容
const batchImportI18nErrorCodes = async (req, res) => {
  try {
    const { data } = req.body; // 期望格式: [{subsystem, code, lang, short_message, user_hint, operation}, ...]
    
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ message: '数据格式错误或为空' });
    }
    
    const results = [];
    const errors = [];
    
    for (const item of data) {
      try {
        const { subsystem, code, lang, short_message, user_hint, operation } = item;
        
        // 验证必填字段
        if (!subsystem || !code || !lang) {
          errors.push({ item, error: '子系统号、故障码和语言代码是必填字段' });
          continue;
        }
        
        // 验证字段组合：short_message和operation不都为空，user_hint和operation不都为空
        if ((!short_message || short_message.trim() === '') && 
            (!operation || operation.trim() === '')) {
          errors.push({ item, error: '精简提示信息和操作信息不能都为空' });
          continue;
        }
        
        if ((!user_hint || user_hint.trim() === '') && 
            (!operation || operation.trim() === '')) {
          errors.push({ item, error: '用户提示信息和操作信息不能都为空' });
          continue;
        }
        
        // 通过subsystem和code查找error_code_id
        const errorCode = await ErrorCode.findOne({
          where: { subsystem, code }
        });
        
        if (!errorCode) {
          errors.push({ item, error: `故障码不存在: ${subsystem}-${code}` });
          continue;
        }
        
        const error_code_id = errorCode.id;
        
        // 查找是否已存在该语言的内容
        const existing = await I18nErrorCode.findOne({
          where: { error_code_id, lang }
        });
        
        let i18nErrorCode;
        if (existing) {
          // 更新现有记录
          await existing.update({
            short_message,
            user_hint,
            operation
          });
          i18nErrorCode = existing;
        } else {
          // 创建新记录
          i18nErrorCode = await I18nErrorCode.create({
            error_code_id,
            lang,
            short_message,
            user_hint,
            operation
          });
        }
        
        results.push({
          subsystem,
          code,
          error_code_id,
          lang,
          status: existing ? 'updated' : 'created',
          i18nErrorCode
        });
      } catch (itemError) {
        errors.push({ item, error: itemError.message });
      }
    }
    
    // 记录操作日志
    if (req.user) {
      try {
        await logOperation({
          user_id: req.user.id,
          username: req.user.username,
          operation: '批量导入多语言故障码',
          description: `批量导入 ${results.length} 条多语言故障码内容`,
          details: {
            totalCount: data.length,
            successCount: results.length,
            errorCount: errors.length,
            errors: errors.slice(0, 10) // 只记录前10个错误
          }
        });
      } catch (logError) {
        console.warn('记录操作日志失败，但不影响批量导入:', logError.message);
      }
    }
    
    // 重新加载故障码缓存（多语言内容更新后）
    try {
      await errorCodeCache.reloadCache();
      console.log('🔄 故障码缓存已重新加载（批量导入多语言故障码后）');
    } catch (cacheError) {
      console.warn('⚠️ 重新加载故障码缓存失败，但不影响批量导入:', cacheError.message);
    }
    
    res.json({
      message: `批量导入完成，成功 ${results.length} 条，失败 ${errors.length} 条`,
      results,
      errors
    });
  } catch (err) {
    console.error('批量导入多语言故障码失败:', err);
    res.status(500).json({ message: '批量导入失败', error: err.message });
  }
};

// 获取支持的语言列表
const getSupportedLanguages = async (req, res) => {
  try {
    // 预定义的语言列表 - 只支持指定的10种语言
    const predefinedLanguages = [
      { value: 'zh', label: req.t('shared.languageNames.zh') },
      { value: 'en', label: req.t('shared.languageNames.en') },
      { value: 'fr', label: req.t('shared.languageNames.fr') },
      { value: 'de', label: req.t('shared.languageNames.de') },
      { value: 'es', label: req.t('shared.languageNames.es') },
      { value: 'it', label: req.t('shared.languageNames.it') },
      { value: 'pt', label: req.t('shared.languageNames.pt') },
      { value: 'nl', label: req.t('shared.languageNames.nl') },
      { value: 'sk', label: req.t('shared.languageNames.sk') },
      { value: 'ro', label: req.t('shared.languageNames.ro') },
      { value: 'da', label: req.t('shared.languageNames.da') }
    ];
    
    // 获取数据库中已有的语言代码
    const existingLanguages = await I18nErrorCode.findAll({
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('lang')), 'lang']],
      raw: true
    });
    
    const existingLangCodes = existingLanguages.map(item => item.lang);
    
    // 合并预定义语言和已有语言，确保所有语言都显示
    const allLanguages = [...predefinedLanguages];
    
    // 添加数据库中存在的但不在预定义列表中的语言
    existingLangCodes.forEach(langCode => {
      if (!predefinedLanguages.find(lang => lang.value === langCode)) {
        allLanguages.push({ value: langCode, label: langCode });
      }
    });
    
    res.json({ languages: allLanguages });
  } catch (err) {
    console.error('获取支持语言列表失败:', err);
    res.status(500).json({ message: req.t('i18nErrorCode.languages.getFailed'), error: err.message });
  }
};

// 获取子系统号列表
const getSubsystems = async (req, res) => {
  try {
    // 预定义的子系统列表
    const predefinedSubsystems = [
      { value: '1', label: req.t('shared.subsystemOptions.1') },
      { value: '2', label: req.t('shared.subsystemOptions.2') },
      { value: '3', label: req.t('shared.subsystemOptions.3') },
      { value: '4', label: req.t('shared.subsystemOptions.4') },
      { value: '5', label: req.t('shared.subsystemOptions.5') },
      { value: '6', label: req.t('shared.subsystemOptions.6') },
      { value: '7', label: req.t('shared.subsystemOptions.7') },
      { value: '8', label: req.t('shared.subsystemOptions.8') },
      { value: '9', label: req.t('shared.subsystemOptions.9') },
      { value: 'A', label: req.t('shared.subsystemOptions.A') }
    ];
    
    // 获取数据库中已有的子系统号
    const existingSubsystems = await ErrorCode.findAll({
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('subsystem')), 'subsystem']],
      raw: true,
      order: [['subsystem', 'ASC']]
    });
    
    const existingSubsystemCodes = existingSubsystems.map(item => item.subsystem).filter(Boolean);
    
    // 合并预定义子系统和已有子系统，确保所有子系统都显示
    const allSubsystems = [...predefinedSubsystems];
    
    // 添加数据库中存在的但不在预定义列表中的子系统
    existingSubsystemCodes.forEach(subsystemCode => {
      if (!predefinedSubsystems.find(sys => sys.value === subsystemCode)) {
        allSubsystems.push({ value: subsystemCode, label: subsystemCode });
      }
    });
    
    res.json({ subsystems: allSubsystems });
  } catch (err) {
    console.error('获取子系统号列表失败:', err);
    res.status(500).json({ message: req.t('i18nErrorCode.subsystems.getFailed'), error: err.message });
  }
};

// 处理CSV文件上传
const uploadCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: '请上传CSV文件' });
    }

    const results = [];
    const errors = [];
    let lineNumber = 0;
    let isFirstRow = true;
    let expectedHeaders = ['subsystem', 'code', 'lang', 'short_message', 'user_hint', 'operation'];
    
    // 读取CSV文件，确保UTF-8编码
    fs.createReadStream(req.file.path, { encoding: 'utf8' })
      .pipe(csv({
        headers: false, // 不使用第一行作为列名
        skipEmptyLines: true
      }))
      .on('data', (row) => {
        lineNumber++;
        
        // 处理第一行（列名）
        if (isFirstRow) {
          isFirstRow = false;
          // 检查列名是否正确
          const headers = Object.values(row);
          const isValidHeaders = expectedHeaders.every((header, index) => 
            headers[index] && headers[index].toLowerCase().trim() === header.toLowerCase()
          );
          
          if (!isValidHeaders) {
            errors.push({ 
              line: lineNumber, 
              row, 
              error: `第${lineNumber}行列名不正确，期望: ${expectedHeaders.join(', ')}，实际: ${headers.join(', ')}` 
            });
          }
          return; // 跳过第一行
        }
        
        // 处理数据行
        const values = Object.values(row);
        const [subsystem, code, lang, short_message, user_hint, operation] = values;
        
        // 检查必填字段
        if (!subsystem || !code || !lang) {
          const missingFields = [];
          if (!subsystem || subsystem.trim() === '') missingFields.push('subsystem');
          if (!code || code.trim() === '') missingFields.push('code');
          if (!lang || lang.trim() === '') missingFields.push('lang');
          
          errors.push({ 
            line: lineNumber, 
            row, 
            error: `第${lineNumber}行缺少必填字段: ${missingFields.join(', ')}` 
          });
          return;
        }
        
        // 验证内容字段：short_message和user_hint至少一个不为空，或short_message和operation至少一个不为空
        const hasShortMessage = short_message && short_message.trim() !== '';
        const hasUserHint = user_hint && user_hint.trim() !== '';
        const hasOperation = operation && operation.trim() !== '';
        
        // 检查条件：short_message和user_hint至少一个不为空，或short_message和operation至少一个不为空
        const condition1 = hasShortMessage || hasUserHint; // short_message和user_hint至少一个不为空
        const condition2 = hasShortMessage || hasOperation; // short_message和operation至少一个不为空
        
        if (!condition1 && !condition2) {
          errors.push({ 
            line: lineNumber, 
            row, 
            error: `第${lineNumber}行内容验证失败：需要满足以下条件之一：1) short_message和user_hint至少一个不为空，或2) short_message和operation至少一个不为空` 
          });
          return;
        }
        
        results.push({
          subsystem: subsystem.trim(),
          code: code.trim(),
          lang: lang.trim(),
          short_message: short_message ? short_message.trim() : '',
          user_hint: user_hint ? user_hint.trim() : '',
          operation: operation ? operation.trim() : ''
        });
      })
      .on('end', async () => {
        try {
          // 删除临时文件
          fs.unlinkSync(req.file.path);
          
          if (results.length === 0) {
            return res.status(400).json({ 
              message: 'CSV文件为空或格式错误',
              errors: errors.slice(0, 10) // 只返回前10个错误
            });
          }
          
          // 调用批量导入逻辑
          const importResults = [];
          const importErrors = [];
          
          for (const item of results) {
            try {
              const { subsystem, code, lang, short_message, user_hint, operation } = item;
              
              // 通过subsystem和code查找error_code_id
              const errorCode = await ErrorCode.findOne({
                where: { subsystem, code }
              });
              
              if (!errorCode) {
                importErrors.push({ 
                  item, 
                  error: `故障码不存在: ${subsystem}-${code}，请先在故障码管理中添加此故障码` 
                });
                continue;
              }
              
              const error_code_id = errorCode.id;
              
              // 查找是否已存在该语言的内容
              const existing = await I18nErrorCode.findOne({
                where: { error_code_id, lang }
              });
              
              let i18nErrorCode;
              if (existing) {
                // 更新现有记录
                await existing.update({
                  short_message,
                  user_hint,
                  operation
                });
                i18nErrorCode = existing;
              } else {
                // 创建新记录
                i18nErrorCode = await I18nErrorCode.create({
                  error_code_id,
                  lang,
                  short_message,
                  user_hint,
                  operation
                });
              }
              
              importResults.push({
                subsystem,
                code,
                error_code_id,
                lang,
                status: existing ? 'updated' : 'created',
                i18nErrorCode
              });
            } catch (itemError) {
              importErrors.push({ item, error: itemError.message });
            }
          }
          
          // 记录操作日志
          if (req.user) {
            try {
              await logOperation({
                user_id: req.user.id,
                username: req.user.username,
                operation: 'CSV批量导入多语言故障码',
                description: `CSV批量导入 ${importResults.length} 条多语言故障码内容`,
                details: {
                  totalCount: results.length,
                  successCount: importResults.length,
                  errorCount: importErrors.length,
                  errors: importErrors.slice(0, 10)
                }
              });
            } catch (logError) {
              console.warn('记录操作日志失败，但不影响CSV批量导入:', logError.message);
            }
          }
          
          // 重新加载故障码缓存（CSV批量导入后）
          try {
            await errorCodeCache.reloadCache();
            console.log('🔄 故障码缓存已重新加载（CSV批量导入多语言故障码后）');
          } catch (cacheError) {
            console.warn('⚠️ 重新加载故障码缓存失败，但不影响CSV批量导入:', cacheError.message);
          }
          
          // 如果有错误，返回部分成功的结果
          if (importErrors.length > 0) {
            res.status(207).json({
              message: `CSV批量导入部分成功，成功 ${importResults.length} 条，失败 ${importErrors.length} 条`,
              results: importResults,
              errors: importErrors.slice(0, 20) // 限制错误数量
            });
          } else {
            res.json({
              message: `CSV批量导入成功，共导入 ${importResults.length} 条记录`,
              results: importResults
            });
          }
        } catch (err) {
          console.error('CSV批量导入失败:', err);
          res.status(500).json({ message: 'CSV批量导入失败', error: err.message });
        }
      })
      .on('error', (error) => {
        // 删除临时文件
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        console.error('CSV文件读取失败:', error);
        res.status(500).json({ message: 'CSV文件读取失败，请检查文件格式和编码', error: error.message });
      });
  } catch (err) {
    // 删除临时文件
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('CSV上传处理失败:', err);
    res.status(500).json({ message: 'CSV上传处理失败', error: err.message });
  }
};

module.exports = {
  getI18nErrorCodes,
  upsertI18nErrorCode,
  deleteI18nErrorCode,
  batchImportI18nErrorCodes,
  getSupportedLanguages,
  getSubsystems,
  uploadCSV
}; 