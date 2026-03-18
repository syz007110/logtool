const I18nErrorCode = require('../models/i18n_error_code');
const ErrorCode = require('../models/error_code');
const { Op } = require('sequelize');
const { sequelize } = require('../models');
const { logOperation } = require('../utils/operationLogger');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const errorCodeCache = require('../services/errorCodeCache');
const errorCodeCacheSyncService = require('../services/errorCodeCacheSyncService');
const { translateFields } = require('../services/translationService');
const { normalizePagination, MAX_PAGE_SIZE } = require('../constants/pagination');
const { indexErrorCodeToEs, deleteErrorCodeFromEs } = require('../services/errorCodeIndexService');
const { getPredefinedLanguages } = require('../config/i18nLanguages');
const subsystemCodes = require('../../../shared/i18n/subsystemCodes.json');

const I18N_TEXT_FIELDS = [
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
  'explanation'
];

// 检查ES是否启用
function isErrorCodeEsEnabled() {
  const raw = process.env.ERROR_CODE_ES_ENABLED;
  if (raw == null) return true; // 默认启用
  const s = String(raw).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

// 同步故障码到ES（异步，不阻塞主流程）
async function syncErrorCodeToEs(errorCodeId, lang = 'zh') {
  if (!isErrorCodeEsEnabled()) return;
  try {
    await indexErrorCodeToEs({ errorCodeId, lang, refresh: 'false' });
  } catch (e) {
    console.warn(`[ES同步] 故障码 ${errorCodeId} (${lang}) 同步失败:`, e?.message || e);
  }
}

async function syncErrorCodeAllLangsToEs(errorCodeId) {
  if (!isErrorCodeEsEnabled()) return;
  try {
    const i18nList = await I18nErrorCode.findAll({
      where: { error_code_id: errorCodeId },
      attributes: ['lang']
    });
    const langs = ['zh', ...i18nList.map((item) => item.lang).filter((lang) => lang !== 'zh')];
    for (const lang of langs) {
      await syncErrorCodeToEs(errorCodeId, lang);
    }
  } catch (e) {
    console.warn(`[ES同步] 故障码 ${errorCodeId} 全语言同步失败:`, e?.message || e);
  }
}

async function reloadAndBroadcastErrorCodeCache(reason, meta = {}) {
  try {
    await errorCodeCache.reloadCache();
    await errorCodeCacheSyncService.publishReload(reason, meta);
  } catch (cacheError) {
    throw cacheError;
  }
}

// 获取故障码的多语言内容
const getI18nErrorCodes = async (req, res) => {
  try {
    const { error_code_id, lang, code, subsystem } = req.query;
    const { page, limit } = normalizePagination(req.query.page, req.query.limit, MAX_PAGE_SIZE.STANDARD);
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
      limit,
      offset
    });
    
    res.json({ 
      i18nErrorCodes,
      total: count,
      page,
      limit
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
      await reloadAndBroadcastErrorCodeCache('i18n_error_code_upsert', {
        errorCodeId: error_code_id_to_use,
        lang
      });
      console.log('🔄 故障码缓存已重新加载（多语言故障码操作后）');
    } catch (cacheError) {
      console.warn('⚠️ 重新加载故障码缓存失败，但不影响多语言故障码操作:', cacheError.message);
    }
    
    // 同步到ES（异步，不阻塞响应）
    syncErrorCodeAllLangsToEs(error_code_id_to_use).catch(() => {});
    
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
    
    const errorCodeId = i18nErrorCode.error_code_id;
    const lang = i18nErrorCode.lang;
    
    await i18nErrorCode.destroy();
    
    // 从ES删除对应语言版本的索引
    if (isErrorCodeEsEnabled()) {
      try {
        await deleteErrorCodeFromEs({ errorCodeId, lang, refresh: 'false' });
      } catch (esError) {
        console.warn(`[ES同步] 故障码 ${errorCodeId} (${lang}) 删除失败:`, esError?.message || esError);
      }
    }
    
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
      await reloadAndBroadcastErrorCodeCache('i18n_error_code_deleted', {
        errorCodeId,
        lang
      });
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
    const { data } = req.body; // 期望格式: [{subsystem, code, lang, short_message, user_hint, operation, detail, method, param1, param2, param3, param4}, ...]
    
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ message: '数据格式错误或为空' });
    }
    
    const results = [];
    const errors = [];
    
    for (const item of data) {
      try {
        const {
          subsystem,
          code,
          lang,
          short_message,
          user_hint,
          operation,
          detail,
          method,
          param1,
          param2,
          param3,
          param4
        } = item;
        
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
            operation,
            detail,
            method,
            param1,
            param2,
            param3,
            param4
          });
          i18nErrorCode = existing;
        } else {
          // 创建新记录
          i18nErrorCode = await I18nErrorCode.create({
            error_code_id,
            lang,
            short_message,
            user_hint,
            operation,
            detail,
            method,
            param1,
            param2,
            param3,
            param4
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
      await reloadAndBroadcastErrorCodeCache('i18n_error_code_batch_import');
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
    const predefinedLanguages = getPredefinedLanguages((key) => req.t(key));
    
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
    const predefinedSubsystems = subsystemCodes.map((code) => ({
      value: code,
      label: req.t(`shared.subsystemOptions.${code}`)
    }));
    
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
    const baseHeaders = ['subsystem', 'code', 'lang', 'short_message', 'user_hint', 'operation'];
    const extraHeaders = ['detail', 'method', 'param1', 'param2', 'param3', 'param4'];
    let expectedHeaders = baseHeaders;
    
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
          const hasBaseHeaders = baseHeaders.every((header, index) =>
            headers[index] && headers[index].toLowerCase().trim() === header.toLowerCase()
          );
          const hasExtraHeaders = extraHeaders.every((header, index) =>
            headers[baseHeaders.length + index] &&
            headers[baseHeaders.length + index].toLowerCase().trim() === header.toLowerCase()
          );

          const isExactBase = headers.length === baseHeaders.length && hasBaseHeaders;
          const isExactFull = headers.length === (baseHeaders.length + extraHeaders.length) && hasBaseHeaders && hasExtraHeaders;

          if (!isExactBase && !isExactFull) {
            errors.push({ 
              line: lineNumber, 
              row, 
              error: `第${lineNumber}行列名不正确，期望: ${baseHeaders.join(', ')} 或 ${[...baseHeaders, ...extraHeaders].join(', ')}，实际: ${headers.join(', ')}` 
            });
          }
          return; // 跳过第一行
        }
        
        // 处理数据行
        const values = Object.values(row);
        const [
          subsystem,
          code,
          lang,
          short_message,
          user_hint,
          operation,
          detail,
          method,
          param1,
          param2,
          param3,
          param4
        ] = values;
        
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
          operation: operation ? operation.trim() : '',
          detail: detail ? detail.trim() : '',
          method: method ? method.trim() : '',
          param1: param1 ? param1.trim() : '',
          param2: param2 ? param2.trim() : '',
          param3: param3 ? param3.trim() : '',
          param4: param4 ? param4.trim() : ''
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
              const {
                subsystem,
                code,
                lang,
                short_message,
                user_hint,
                operation,
                detail,
                method,
                param1,
                param2,
                param3,
                param4
              } = item;
              
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
                  operation,
                  detail,
                  method,
                  param1,
                  param2,
                  param3,
                  param4
                });
                i18nErrorCode = existing;
              } else {
                // 创建新记录
                i18nErrorCode = await I18nErrorCode.create({
                  error_code_id,
                  lang,
                  short_message,
                  user_hint,
                  operation,
                  detail,
                  method,
                  param1,
                  param2,
                  param3,
                  param4
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
            await reloadAndBroadcastErrorCodeCache('i18n_error_code_csv_import');
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

// 获取故障码的指定语言的多语言内容（包含所有字段）
const getErrorCodeI18nByLang = async (req, res) => {
  try {
    const { id } = req.params; // error_code_id
    const { lang } = req.query;

    if (!lang) {
      return res.status(400).json({ message: 'Language parameter is required' });
    }

    const errorCode = await ErrorCode.findByPk(id);
    if (!errorCode) {
      return res.status(404).json({ message: 'Error code not found' });
    }

    // 查找该语言与中文基准内容
    const [i18nContent, zhContent] = await Promise.all([
      I18nErrorCode.findOne({
        where: {
          error_code_id: id,
          lang
        }
      }),
      I18nErrorCode.findOne({
        where: {
          error_code_id: id,
          lang: 'zh'
        }
      })
    ]);

    // 返回默认语言（中文）和指定语言的内容
    res.json({
      errorCode: {
        id: errorCode.id,
        subsystem: errorCode.subsystem,
        code: errorCode.code,
        // 默认语言字段（lang=zh，只读）
        defaultFields: {
          short_message: zhContent?.short_message || '',
          user_hint: zhContent?.user_hint || '',
          operation: zhContent?.operation || '',
          detail: zhContent?.detail || '',
          method: zhContent?.method || '',
          param1: zhContent?.param1 || '',
          param2: zhContent?.param2 || '',
          param3: zhContent?.param3 || '',
          param4: zhContent?.param4 || '',
          tech_solution: zhContent?.tech_solution || '',
          explanation: zhContent?.explanation || ''
          // 注意：solution, level, category 不在 i18n_error_codes 表中，只从 error_codes 表读取
        }
      },
      i18nContent: i18nContent ? {
        id: i18nContent.id,
        lang: i18nContent.lang,
        // UI 字段
        short_message: i18nContent.short_message,
        user_hint: i18nContent.user_hint,
        operation: i18nContent.operation,
        // 技术字段
        detail: i18nContent.detail,
        method: i18nContent.method,
        param1: i18nContent.param1,
        param2: i18nContent.param2,
        param3: i18nContent.param3,
        param4: i18nContent.param4,
        tech_solution: i18nContent.tech_solution,
        explanation: i18nContent.explanation
        // 注意：solution, level, category 不在 i18n_error_codes 表中
      } : null
    });
  } catch (err) {
    console.error('获取故障码多语言内容失败:', err);
    res.status(500).json({ message: 'Failed to get error code i18n content', error: err.message });
  }
};

// 保存故障码的指定语言的多语言内容（包含UI字段和技术字段）
const saveErrorCodeI18nByLang = async (req, res) => {
  try {
    const { id } = req.params; // error_code_id
    const { lang, short_message, user_hint, operation, detail, method, param1, param2, param3, param4, tech_solution, explanation } = req.body;
    // 注意：solution, level, category 不在 i18n_error_codes 表中，不接收这些参数

    if (!lang) {
      return res.status(400).json({ message: 'Language parameter is required' });
    }

    const errorCode = await ErrorCode.findByPk(id);
    if (!errorCode) {
      return res.status(404).json({ message: 'Error code not found' });
    }

    // 查找是否已存在该语言的内容
    let i18nContent = await I18nErrorCode.findOne({
      where: {
        error_code_id: id,
        lang
      }
    });

    const updateData = {
      // UI 字段
      short_message: short_message || null,
      user_hint: user_hint || null,
      operation: operation || null,
      // 技术字段
      detail: detail || null,
      method: method || null,
      param1: param1 || null,
      param2: param2 || null,
      param3: param3 || null,
      param4: param4 || null,
      tech_solution: tech_solution || null,
      explanation: explanation || null
      // 注意：solution, level, category 不在 i18n_error_codes 表中，不保存这些字段
    };

    if (i18nContent) {
      // 更新现有记录（包含UI字段和技术字段）
      await i18nContent.update(updateData);
    } else {
      // 创建新记录
      i18nContent = await I18nErrorCode.create({
        error_code_id: id,
        lang,
        ...updateData
      });
    }

    // 记录操作日志
    if (req.user) {
      try {
        await logOperation({
          user_id: req.user.id,
          username: req.user.username,
          operation: i18nContent ? '更新故障码多语言技术字段' : '新增故障码多语言技术字段',
          description: `${i18nContent ? '更新' : '新增'}故障码 ${errorCode.code} 的 ${lang} 语言技术说明字段`,
          details: {
            errorCodeId: id,
            lang,
            errorCode: errorCode.code
          }
        });
      } catch (logError) {
        console.warn('记录操作日志失败:', logError.message);
      }
    }

    // 重新加载故障码缓存
    try {
      await reloadAndBroadcastErrorCodeCache('i18n_error_code_content_saved', {
        errorCodeId: id,
        lang
      });
    } catch (cacheError) {
      console.warn('重新加载故障码缓存失败:', cacheError.message);
    }

    syncErrorCodeAllLangsToEs(id).catch(() => {});

    res.json({
      message: i18nContent ? 'Updated successfully' : 'Created successfully',
      i18nContent
    });
  } catch (err) {
    console.error('保存故障码多语言内容失败:', err);
    res.status(500).json({ message: 'Failed to save error code i18n content', error: err.message });
  }
};

// 自动翻译故障码的技术说明字段（只翻译空白字段）
const autoTranslateErrorCodeI18n = async (req, res) => {
  try {
    const { id } = req.params; // error_code_id
    const { lang } = req.body; // 不再使用 overwrite 参数，始终只翻译空白字段

    if (!lang) {
      return res.status(400).json({ message: 'Language parameter is required' });
    }

    const errorCode = await ErrorCode.findByPk(id);
    if (!errorCode) {
      return res.status(404).json({ message: 'Error code not found' });
    }

    // 获取中文基准内容作为翻译源
    const zhI18n = await I18nErrorCode.findOne({
      where: {
        error_code_id: id,
        lang: 'zh'
      }
    });
    if (!zhI18n) {
      return res.status(400).json({
        message: '自动翻译失败：缺少中文基准内容（lang=zh）'
      });
    }

    const sourceFields = {};
    I18N_TEXT_FIELDS.forEach((field) => {
      sourceFields[field] = zhI18n[field] || '';
    });

    // 获取已存在的目标语言内容
    const existingI18n = await I18nErrorCode.findOne({
      where: {
        error_code_id: id,
        lang
      }
    });

    const existingFields = existingI18n ? {
      // UI 显示字段
      short_message: existingI18n.short_message,
      user_hint: existingI18n.user_hint,
      operation: existingI18n.operation,
      // 技术说明字段
      detail: existingI18n.detail,
      method: existingI18n.method,
      param1: existingI18n.param1,
      param2: existingI18n.param2,
      param3: existingI18n.param3,
      param4: existingI18n.param4,
      tech_solution: existingI18n.tech_solution,
      explanation: existingI18n.explanation
      // 注意：solution, level, category 不在 i18n_error_codes 表中
    } : {};

    // 执行翻译（只翻译空白字段，不覆盖已有内容）
    let translatedFields;
    try {
      translatedFields = await translateFields(
        sourceFields,
        lang,
        'zh-CN',
        {
          onlyEmpty: true, // 始终只翻译空白字段
          existingFields: existingFields
        }
      );
    } catch (translateError) {
      console.error('翻译服务调用失败:', translateError);
      // 返回友好的错误信息
      return res.status(500).json({ 
        message: '自动翻译失败',
        error: translateError.message || 'Translation service error'
      });
    }

    // 检查是否有任何字段被成功翻译
    const hasTranslatedFields = Object.values(translatedFields).some(val => val && val.trim() !== '');
    if (!hasTranslatedFields) {
      return res.status(500).json({ 
        message: '自动翻译失败：没有字段被成功翻译',
        error: 'No fields were translated'
      });
    }

    // 保存翻译结果（只保存翻译后的字段，保留已有内容）
    try {
      if (existingI18n) {
        // 只更新空白字段，保留已有内容
        // translateFields 在 onlyEmpty=true 时会返回已有值，所以需要比较判断哪些是真正翻译的
        const fieldsToUpdate = {};
        Object.keys(translatedFields).forEach(key => {
          const translatedValue = translatedFields[key];
          const existingValue = existingFields[key] || '';
          // 只更新空白字段：如果原字段为空，且翻译后有值，则更新
          if ((!existingValue || existingValue.trim() === '') && 
              translatedValue && translatedValue.trim() !== '') {
            fieldsToUpdate[key] = translatedValue;
          }
        });
        // 如果有字段需要更新，才执行更新
        if (Object.keys(fieldsToUpdate).length > 0) {
          await existingI18n.update(fieldsToUpdate);
        }
      } else {
        // 新建时，只保存有值的字段（过滤掉空值）
        const fieldsToCreate = {};
        Object.keys(translatedFields).forEach(key => {
          if (translatedFields[key] && translatedFields[key].trim() !== '') {
            fieldsToCreate[key] = translatedFields[key];
          }
        });
        if (Object.keys(fieldsToCreate).length > 0) {
        await I18nErrorCode.create({
          error_code_id: id,
          lang,
            ...fieldsToCreate
        });
        }
      }
    } catch (saveError) {
      console.error('保存翻译结果失败:', saveError);
      return res.status(500).json({ 
        message: '自动翻译失败：保存翻译结果时出错',
        error: saveError.message || 'Failed to save translation results'
      });
    }

    // 记录操作日志
    if (req.user) {
      try {
        await logOperation({
          user_id: req.user.id,
          username: req.user.username,
          operation: '自动翻译故障码技术字段',
          description: `自动翻译故障码 ${errorCode.code} 的技术说明字段到 ${lang}（仅翻译空白字段）`,
          details: {
            errorCodeId: id,
            lang,
            errorCode: errorCode.code
          }
        });
      } catch (logError) {
        console.warn('记录操作日志失败:', logError.message);
      }
    }

    // 重新加载故障码缓存
    try {
      await reloadAndBroadcastErrorCodeCache('i18n_error_code_auto_translated', {
        errorCodeId: id,
        lang
      });
    } catch (cacheError) {
      console.warn('重新加载故障码缓存失败:', cacheError.message);
    }

    syncErrorCodeAllLangsToEs(id).catch(() => {});

    res.json({
      message: 'Translation completed',
      translatedFields
    });
  } catch (err) {
    console.error('自动翻译失败:', err);
    res.status(500).json({ 
      message: '自动翻译失败',
      error: err.message || 'Unknown error'
    });
  }
};

module.exports = {
  getI18nErrorCodes,
  upsertI18nErrorCode,
  deleteI18nErrorCode,
  batchImportI18nErrorCodes,
  getSupportedLanguages,
  getSubsystems,
  uploadCSV,
  getErrorCodeI18nByLang,
  saveErrorCodeI18nByLang,
  autoTranslateErrorCodeI18n
}; 
