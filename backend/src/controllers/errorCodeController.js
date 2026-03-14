const ErrorCode = require('../models/error_code');
const I18nErrorCode = require('../models/i18n_error_code');
const AnalysisCategory = require('../models/analysis_category');
const ErrorCodeAnalysisCategory = require('../models/error_code_analysis_category');
const TechSolutionImage = require('../models/tech_solution_image');
const { sequelize } = require('../models');
const { Op } = require('sequelize');
const { logOperation } = require('../utils/operationLogger');
const errorCodeCache = require('../services/errorCodeCache');
const errorCodeCacheSyncService = require('../services/errorCodeCacheSyncService');
const { indexErrorCodeToEs, deleteErrorCodeFromEs } = require('../services/errorCodeIndexService');
const { searchByKeywords } = require('../services/errorCodeSearchService');
const prefixTranslations = require('../config/prefixTranslations.json');
const fs = require('fs');
const { normalizePagination, MAX_PAGE_SIZE } = require('../constants/pagination');
const path = require('path');
const { objectKeyFromUrl } = require('../utils/oss');
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
const { searchErrorCodesUnified } = require('../services/errorCodeUnifiedService');
const {
  syncMirrorErrorCodeBySourceId,
  isMirrorSubsystem
} = require('../services/errorCodeMirrorSyncService');

function getBearerToken(req) {
  const raw = req?.headers?.authorization || req?.get?.('authorization') || '';
  const parts = String(raw).split(' ');
  if (parts.length === 2 && /^bearer$/i.test(parts[0])) return parts[1];
  return '';
}

function withQueryToken(url, req) {
  const token = getBearerToken(req);
  if (!token) return url;
  if (!url || !String(url).includes('/api/oss/')) return url;
  if (String(url).includes('token=')) return url;
  const sep = String(url).includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}

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

// 同步故障码所有语言版本到ES
async function syncErrorCodeAllLangsToEs(errorCodeId) {
  if (!isErrorCodeEsEnabled()) return;
  try {
    // 查询所有语言版本
    const i18nList = await I18nErrorCode.findAll({
      where: { error_code_id: errorCodeId },
      attributes: ['lang']
    });
    const langs = ['zh', ...i18nList.map(i => i.lang).filter(l => l !== 'zh')];
    // 同步所有语言版本
    for (const lang of langs) {
      await syncErrorCodeToEs(errorCodeId, lang);
    }
  } catch (e) {
    console.warn(`[ES同步] 故障码 ${errorCodeId} 全语言同步失败:`, e?.message || e);
  }
}

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

const MAIN_STRUCT_FIELDS = [
  'subsystem',
  'code',
  'is_axis_error',
  'is_arm_error',
  'for_expert',
  'for_novice',
  'related_log',
  'category'
];

const I18N_PAYLOAD_FIELDS = [
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

const toMainStructData = (data) => {
  const out = {};
  if (!data || typeof data !== 'object') return out;
  MAIN_STRUCT_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      out[field] = data[field];
    }
  });
  return out;
};

const pickI18nContent = (contents = [], targetLang = 'zh') => {
  const normalized = String(targetLang || 'zh').split('-')[0];
  const target = contents.find((item) => String(item.lang || '').split('-')[0] === normalized);
  if (target) return target;
  return contents.find((item) => String(item.lang || '').split('-')[0] === 'zh') || null;
};

const applyI18nTextFields = (base, i18nContent) => {
  I18N_TEXT_FIELDS.forEach((field) => {
    base[field] = i18nContent?.[field] ?? '';
  });
  return base;
};

const normalizeI18nLang = (lang) => {
  const raw = String(lang || 'zh').trim().toLowerCase();
  if (!raw) return 'zh';
  if (raw === 'zh-cn' || raw.startsWith('zh')) return 'zh';
  if (raw === 'en-us' || raw.startsWith('en')) return 'en';
  return raw.split('-')[0];
};

const pickI18nPayload = (data) => {
  if (!data || typeof data !== 'object' || !data.i18nPayload || typeof data.i18nPayload !== 'object') {
    return null;
  }
  const lang = normalizeI18nLang(data.i18nPayload.lang || data.i18nPayload.language);
  const payload = { lang };
  I18N_PAYLOAD_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(data.i18nPayload, field)) {
      payload[field] = data.i18nPayload[field] || null;
    }
  });
  return payload;
};

async function upsertI18nPayloadForErrorCode({ errorCodeId, i18nPayload, transaction }) {
  if (!i18nPayload || !errorCodeId) return;
  const { lang } = i18nPayload;
  const writeData = {};
  I18N_PAYLOAD_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(i18nPayload, field)) {
      writeData[field] = i18nPayload[field] || null;
    }
  });

  const existing = await I18nErrorCode.findOne({
    where: { error_code_id: errorCodeId, lang },
    transaction
  });

  if (existing) {
    await existing.update(writeData, { transaction });
  } else {
    await I18nErrorCode.create({
      error_code_id: errorCodeId,
      lang,
      ...writeData
    }, { transaction });
  }
}

// 根据故障码自动判断故障等级和处理措施
const analyzeErrorCode = (code) => {
  if (!code) return { level: 'none', solution: 'tips' };

  // 解析故障码：0X + 3位16进制数字 + A/B/C/D/E
  const match = code.match(/^0X([0-9A-F]{3})([ABCDE])$/);
  if (!match) return { level: 'none', solution: 'tips' };

  const [, hexPart, severity] = match;

  // 根据故障码末尾字母判断等级
  let level = 'none';
  switch (severity) {
    case 'A': // A类故障：高级
      level = 'high';
      break;
    case 'B': // B类故障：中级
      level = 'medium';
      break;
    case 'C': // C类故障：低级
      level = 'low';
      break;
    default: // D、E类故障：无
      level = 'none';
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
async function upsertCodeCategoryMapForErrorCode(errorCodeId, categoryIds, transaction = null) {
  try {
    const ec = await ErrorCode.findByPk(errorCodeId, { attributes: ['subsystem', 'code'], transaction });
    if (!ec) return;
    const subsystemChar = normalizeSubsystemChar(ec.subsystem);
    const code4 = normalizeCode4(ec.code);
    if (!subsystemChar || !code4) return;

    await sequelize.query(
      'DELETE FROM code_category_map WHERE subsystem_char = :s AND code4 = :c',
      { replacements: { s: subsystemChar, c: code4 }, transaction }
    );

    if (Array.isArray(categoryIds) && categoryIds.length > 0) {
      const values = categoryIds
        .filter((id) => Number.isInteger(Number(id)))
        .map((id) => `(${sequelize.escape(subsystemChar)}, ${sequelize.escape(code4)}, ${Number(id)})`);
      if (values.length > 0) {
        const sql = `INSERT INTO code_category_map (subsystem_char, code4, analysis_category_id) VALUES ${values.join(',')}`;
        await sequelize.query(sql, { transaction });
      }
    }
  } catch (e) {
    console.warn('[code_category_map] upsert failed:', e.message);
  }
}

const safeUnlink = (filePath) => {
  if (!filePath) return;
  fs.unlink(filePath, () => { });
};

// 将URL转换为完整的、可直接访问的URL
const normalizeImageUrl = (img, req) => {
  if (!img || !img.url) return img?.url || '';

  const url = String(img.url);
  const storageType = img.storage || STORAGE; // 如果没有指定，使用全局配置的存储类型
  const USE_BACKEND_OSS_PROXY = String(process.env.TECH_SOLUTION_OSS_USE_PROXY || process.env.OSS_USE_BACKEND_PROXY || '').toLowerCase() === 'true';

  // OSS + 开启后端代理：统一返回 /api/oss/...，浏览器不直连 *-internal 域名
  if (storageType === 'oss' && USE_BACKEND_OSS_PROXY) {
    const objectKey = String(img.object_key || objectKeyFromUrl(url) || url).replace(/^\//, '');
    const key = encodeURIComponent(objectKey);
    return withQueryToken(`/api/oss/tech-solution?key=${key}`, req);
  }

  // 如果已经是完整的URL（http/https），直接返回
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

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
    'subsystem', 'code', 'is_axis_error', 'is_arm_error', 'category'
  ];

  basicRequiredFields.forEach(field => {
    if (!data[field] && data[field] !== false && data[field] !== 0) {
      errors.push(`${field} 是必填字段`);
    }
  });

  // 文本字段已迁移至 i18n_error_codes，主表不再校验文本内容

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
  if (data.category && !validCategories.includes(data.category)) {
    errors.push('故障分类必须是：软件、硬件、日志记录、操作提示、安全保护 中的一个');
  }

  return errors;
};

// 新增故障码
const createErrorCode = async (req, res) => {
  try {
    const data = req.body || {};
    const syncToMirror = Boolean(data.syncToMirror);
    const i18nPayload = pickI18nPayload(data);
    // 注意：short_message_en/user_hint_en/operation_en 已由多语言管理模块管理
    // 此处不再处理这些字段
    const mainData = toMainStructData(stripEnglishFields(data));

    // 输入验证
    const validationErrors = validateErrorCodeData(mainData);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        message: req.t('shared.validationFailed'),
        errors: validationErrors
      });
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

    let errorCode = null;
    let mirrorResult = null;

    await sequelize.transaction(async (transaction) => {
      // 检查子系统+故障码组合是否唯一
      const duplicateCheck = await ErrorCode.findOne({
        where: {
          subsystem: mainData.subsystem,
          code: mainData.code
        },
        transaction
      });
      if (duplicateCheck) {
        const duplicateError = new Error(req.t('errorCode.duplicate'));
        duplicateError.statusCode = 409;
        throw duplicateError;
      }

      errorCode = await ErrorCode.create(errorCodeData, { transaction });

      if (Array.isArray(data.analysisCategories) && data.analysisCategories.length > 0) {
        const categoryAssociations = data.analysisCategories.map((categoryId) => ({
          error_code_id: errorCode.id,
          analysis_category_id: categoryId
        }));
        await ErrorCodeAnalysisCategory.bulkCreate(categoryAssociations, { transaction });
        await upsertCodeCategoryMapForErrorCode(errorCode.id, data.analysisCategories, transaction);
      }

      if (i18nPayload) {
        await upsertI18nPayloadForErrorCode({
          errorCodeId: errorCode.id,
          i18nPayload,
          transaction
        });
      }

      if (syncToMirror && isMirrorSubsystem(errorCode.subsystem)) {
        mirrorResult = await syncMirrorErrorCodeBySourceId({
          sourceErrorCodeId: errorCode.id,
          transaction
        });
      }
    });

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

    // 同步到ES（异步，不阻塞响应）
    await errorCodeCacheSyncService.publishReload('error_code_created', { errorCodeId: errorCode.id });
    syncErrorCodeAllLangsToEs(errorCode.id).catch(() => { });
    if (mirrorResult?.targetErrorCodeId) {
      syncErrorCodeAllLangsToEs(mirrorResult.targetErrorCodeId).catch(() => { });
    }

    res.status(201).json({
      message: req.t('shared.created'),
      errorCode,
      mirrorSync: mirrorResult || null
    });
  } catch (err) {
    console.error('创建故障码失败:', err);
    if (err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

// 查询故障码（支持简单和高级搜索）
const getErrorCodes = async (req, res) => {
  try {
    const out = await searchErrorCodesUnified({
      ...req.query,
      acceptLanguage: req.headers['accept-language'] || req.query.lang || 'zh',
      t: req.t
    });
    return res.json(out);
  } catch (err) {
    console.error('[故障码搜索] 查询失败:', err);
    res.status(500).json({ message: '查询失败', error: err.message });
  }
};

// 更新故障码
const updateErrorCode = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body || {};
    const syncToMirror = Boolean(data.syncToMirror);
    const i18nPayload = pickI18nPayload(data);
    // 注意：short_message_en/user_hint_en/operation_en 已由多语言管理模块管理
    // 此处不再处理这些字段
    const mainData = toMainStructData(stripEnglishFields(data));

    // 输入验证
    const validationErrors = validateErrorCodeData(mainData);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        message: req.t('shared.validationFailed'),
        errors: validationErrors
      });
    }

    let errorCode = null;
    let oldData = null;
    let mirrorResult = null;

    await sequelize.transaction(async (transaction) => {
      // 查找故障码
      errorCode = await ErrorCode.findByPk(id, { transaction });
      if (!errorCode) {
        const notFoundError = new Error(req.t('shared.notFound'));
        notFoundError.statusCode = 404;
        throw notFoundError;
      }

      // 检查子系统+故障码组合唯一性（排除当前记录）
      if ((mainData.subsystem && mainData.subsystem !== errorCode.subsystem) ||
        (mainData.code && mainData.code !== errorCode.code)) {
        const duplicateCheck = await ErrorCode.findOne({
          where: {
            subsystem: mainData.subsystem || errorCode.subsystem,
            code: mainData.code || errorCode.code,
            id: { [Op.ne]: id }
          },
          transaction
        });
        if (duplicateCheck) {
          const duplicateError = new Error(req.t('errorCode.duplicate'));
          duplicateError.statusCode = 409;
          throw duplicateError;
        }
      }

      oldData = {
        code: errorCode.code,
        subsystem: errorCode.subsystem,
        category: errorCode.category
      };

      // 始终根据故障码重新计算等级和处理措施
      const codeToAnalyze = mainData.code || errorCode.code;
      const { level, solution } = analyzeErrorCode(codeToAnalyze);
      const updateData = {
        ...mainData,
        level,
        solution
      };

      await errorCode.update(updateData, { transaction });

      // 更新分析分类关联
      if (data.analysisCategories !== undefined) {
        await ErrorCodeAnalysisCategory.destroy({
          where: { error_code_id: errorCode.id },
          transaction
        });

        if (Array.isArray(data.analysisCategories) && data.analysisCategories.length > 0) {
          const categoryAssociations = data.analysisCategories.map((categoryId) => ({
            error_code_id: errorCode.id,
            analysis_category_id: categoryId
          }));
          await ErrorCodeAnalysisCategory.bulkCreate(categoryAssociations, { transaction });
        }
        await upsertCodeCategoryMapForErrorCode(
          errorCode.id,
          Array.isArray(data.analysisCategories) ? data.analysisCategories : [],
          transaction
        );
      }

      if (i18nPayload) {
        await upsertI18nPayloadForErrorCode({
          errorCodeId: errorCode.id,
          i18nPayload,
          transaction
        });
      }

      if (syncToMirror && isMirrorSubsystem(errorCode.subsystem)) {
        mirrorResult = await syncMirrorErrorCodeBySourceId({
          sourceErrorCodeId: errorCode.id,
          transaction
        });
      }
    });

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

    // 同步到ES（异步，不阻塞响应）- 同步所有语言版本
    await errorCodeCacheSyncService.publishReload('error_code_updated', { errorCodeId: errorCode.id });
    syncErrorCodeAllLangsToEs(errorCode.id).catch(() => { });
    if (mirrorResult?.targetErrorCodeId) {
      syncErrorCodeAllLangsToEs(mirrorResult.targetErrorCodeId).catch(() => { });
    }

    res.json({
      message: req.t('shared.updated'),
      errorCode,
      mirrorSync: mirrorResult || null
    });
  } catch (err) {
    console.error('更新故障码失败:', err);
    if (err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
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

    // 从ES删除故障码索引（所有语言版本）
    if (isErrorCodeEsEnabled()) {
      try {
        await deleteErrorCodeFromEs({ errorCodeId: id, refresh: 'false' });
      } catch (esError) {
        console.warn(`[ES同步] 故障码 ${id} 删除失败:`, esError?.message || esError);
      }
    }

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

    // 删除技术排查方案的附件文件
    try {
      const techImages = await TechSolutionImage.findAll({
        where: { error_code_id: id }
      });
      for (const img of techImages) {
        try {
          if (img.storage === 'oss' && img.object_key) {
            const client = await getOssClient();
            const objectKey = String(img.object_key).replace(/^\//, '');
            await client.delete(objectKey);
            console.log(`已删除OSS技术方案附件: ${objectKey}`);
          } else if (img.storage === 'local' && img.object_key) {
            const filePath = path.resolve(LOCAL_DIR, String(img.object_key));
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              console.log(`已删除本地技术方案附件: ${filePath}`);
            }
          }
        } catch (e) {
          console.warn(`删除技术方案附件文件失败 (${img.object_key || img.url}):`, e.message);
        }
      }
      // 删除数据库记录
      await TechSolutionImage.destroy({ where: { error_code_id: id } });
    } catch (techImageError) {
      console.warn('删除技术排查方案附件失败，但不影响故障码删除:', techImageError.message);
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

    await errorCodeCacheSyncService.publishReload('error_code_deleted', { errorCodeId: Number(id) });
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

    // 语言代码映射
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
      'da': 'da',      // 丹麦语
      'lv': 'lv',      // 拉脱维亚语
      'ru': 'ru'       // 俄语
    };

    const targetLang = langMap[language] || 'zh';

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
      return res.status(404).json({ message: req.t('errorCode.noData') });
    }

    // 生成XML内容
    let xmlContent = "<?xml version='1.0' encoding='utf-8'?>\n<Medbot>\n";

    // 前缀信息使用固定翻译表（不依赖数据库）
    xmlContent += buildPrefixXml(targetLang);
    xmlContent += '\t<instance>\n';

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
        // 获取目标语言内容，缺失时回退 zh
        const i18nContent = pickI18nContent(errorCode.i18nContents || [], targetLang);
        const merged = applyI18nTextFields({}, i18nContent);

        xmlContent += `\t\t\t<error_code id="${errorCode.code}">\n`;
        xmlContent += `\t\t\t\t<axis>${errorCode.is_axis_error ? 'True' : 'False'}</axis>\n`;
        xmlContent += `\t\t\t\t<description>${escapeXml(merged.detail || '')}</description>\n`;

        xmlContent += `\t\t\t\t<simple>${escapeXml(merged.short_message || '')}</simple>\n`;
        xmlContent += `\t\t\t\t<userInfo>${escapeXml(merged.user_hint || '')}</userInfo>\n`;
        xmlContent += `\t\t\t\t<opinfo>${escapeXml(merged.operation || '')}</opinfo>\n`;

        xmlContent += `\t\t\t\t<isArm>${errorCode.is_arm_error ? 'True' : 'False'}</isArm>\n`;
        xmlContent += `\t\t\t\t<detInfo>${escapeXml(merged.detail || '')}</detInfo>\n`;
        xmlContent += `\t\t\t\t<method>${escapeXml(merged.method || '')}</method>\n`;
        xmlContent += `\t\t\t\t<para1>${escapeXml(merged.param1 || '')}</para1>\n`;
        xmlContent += `\t\t\t\t<para2>${escapeXml(merged.param2 || '')}</para2>\n`;
        xmlContent += `\t\t\t\t<para3>${escapeXml(merged.param3 || '')}</para3>\n`;
        xmlContent += `\t\t\t\t<para4>${escapeXml(merged.param4 || '')}</para4>\n`;
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

const getOrderedPrefixIds = (sectionMap = {}) => {
  return Object.keys(sectionMap).sort((a, b) => Number(a) - Number(b));
};

const buildPrefixSectionXml = (sectionKey, tagName, targetLang) => {
  const sectionMap = prefixTranslations[sectionKey] || {};
  const ids = getOrderedPrefixIds(sectionMap);
  let sectionXml = `\t\t<${sectionKey}>\n`;

  ids.forEach((id) => {
    const translations = sectionMap[id] || {};
    const value = translations[targetLang] ?? translations.zh ?? translations.en ?? '';
    sectionXml += `\t\t\t<${tagName} id="${id}">${escapeXml(value)}</${tagName}>\n`;
  });

  sectionXml += `\t\t</${sectionKey}>\n`;
  return sectionXml;
};

const buildPrefixXml = (targetLang) => {
  let prefixXml = '\t<prefix>\n';
  prefixXml += buildPrefixSectionXml('prefix_arm', 'arm_num', targetLang);
  prefixXml += buildPrefixSectionXml('prefix_axis', 'axis_num', targetLang);
  prefixXml += buildPrefixSectionXml('prefix_patient', 'axis_num', targetLang);
  prefixXml += '\t</prefix>\n';
  return prefixXml;
};

// 多语言XML导出功能
const exportMultiLanguageXML = async (req, res) => {
  try {
    const { languages = 'zh' } = req.query;
    const langList = languages.split(',').map(lang => lang.trim());
    console.log(`[exportMultiLanguageXML] start languages=${languages}`);

    // 语言代码映射
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
      'da': 'da',      // 丹麦语
      'lv': 'lv',      // 拉脱维亚语
      'ru': 'ru'       // 俄语
    };

    // 转换语言代码
    const targetLangList = langList.map(lang => langMap[lang] || lang);
    const i18nQueryLangs = Array.from(new Set([...targetLangList, 'zh']));
    const i18nQueryLangSet = new Set(i18nQueryLangs);
    const queryStart = Date.now();

    // 获取所有故障码
    const queryErrorCodesStart = Date.now();
    const errorCodes = await ErrorCode.findAll({
      attributes: [
        'id',
        'subsystem',
        'code',
        'is_axis_error',
        'is_arm_error',
        'for_expert',
        'for_novice',
        'related_log',
        'solution'
      ],
      order: [['subsystem', 'ASC'], ['code', 'ASC']],
      raw: true
    });
    const queryErrorCodesMs = Date.now() - queryErrorCodesStart;
    const errorCodeIds = errorCodes.map(item => item.id);

    // 只取目标语言和中文回退的多语言行，避免联表放大
    const queryI18nStart = Date.now();
    const i18nRows = await I18nErrorCode.findAll({
      where: {
        error_code_id: { [Op.in]: errorCodeIds }
      },
      attributes: [
        'error_code_id',
        'lang',
        'short_message',
        'user_hint',
        'operation',
        'detail',
        'method',
        'param1',
        'param2',
        'param3',
        'param4'
      ],
      raw: true
    });
    const queryI18nMs = Date.now() - queryI18nStart;
    const queryCostMs = Date.now() - queryStart;

    if (errorCodes.length === 0) {
      return res.status(404).json({ message: '没有找到故障码数据' });
    }

    const xmlBuildStart = Date.now();
    const xmlResults = {};
    const i18nByErrorCodeId = new Map();
    i18nRows.forEach(row => {
      if (!i18nQueryLangSet.has(row.lang)) return;
      let byLang = i18nByErrorCodeId.get(row.error_code_id);
      if (!byLang) {
        byLang = Object.create(null);
        i18nByErrorCodeId.set(row.error_code_id, byLang);
      }
      byLang[row.lang] = row;
    });
    const groupedByCodes = {};
    errorCodes.forEach(errorCode => {
      if (!groupedByCodes[errorCode.subsystem]) {
        groupedByCodes[errorCode.subsystem] = [];
      }
      groupedByCodes[errorCode.subsystem].push(errorCode);
    });
    const sortedSubsystems = Object.keys(groupedByCodes).sort();

    // 为每种语言生成XML
    for (const language of langList) {
      const targetLang = langMap[language] || language;
      let xmlContent = "<?xml version='1.0' encoding='utf-8'?>\n<Medbot>\n";

      // 前缀信息使用固定翻译表（不依赖数据库）
      xmlContent += buildPrefixXml(targetLang);
      xmlContent += '\t<instance>\n';

      // 生成每个子系统的故障码
      sortedSubsystems.forEach(subsystem => {
        xmlContent += `\t\t<subsystem id="${subsystem}">\n`;

        groupedByCodes[subsystem].forEach(errorCode => {
          // 获取当前语言内容，缺失时回退 zh
          const i18nByLang = i18nByErrorCodeId.get(errorCode.id) || Object.create(null);
          const i18nContent = i18nByLang[targetLang] || i18nByLang.zh || null;

          xmlContent += `\t\t\t<error_code id="${errorCode.code}">\n`;
          xmlContent += `\t\t\t\t<axis>${errorCode.is_axis_error ? 'True' : 'False'}</axis>\n`;
          const detail = i18nContent?.detail || '';
          const method = i18nContent?.method || '';
          const param1 = i18nContent?.param1 || '';
          const param2 = i18nContent?.param2 || '';
          const param3 = i18nContent?.param3 || '';
          const param4 = i18nContent?.param4 || '';
          const shortMessage = i18nContent?.short_message || '';
          const userHint = i18nContent?.user_hint || '';
          const operation = i18nContent?.operation || '';
          xmlContent += `\t\t\t\t<description>${escapeXml(detail || '')}</description>\n`;

          xmlContent += `\t\t\t\t<simple>${escapeXml(shortMessage || '')}</simple>\n`;
          xmlContent += `\t\t\t\t<userInfo>${escapeXml(userHint || '')}</userInfo>\n`;
          xmlContent += `\t\t\t\t<opinfo>${escapeXml(operation || '')}</opinfo>\n`;

          xmlContent += `\t\t\t\t<isArm>${errorCode.is_arm_error ? 'True' : 'False'}</isArm>\n`;
          xmlContent += `\t\t\t\t<detInfo>${escapeXml(detail || '')}</detInfo>\n`;
          xmlContent += `\t\t\t\t<method>${escapeXml(method || '')}</method>\n`;
          xmlContent += `\t\t\t\t<para1>${escapeXml(param1 || '')}</para1>\n`;
          xmlContent += `\t\t\t\t<para2>${escapeXml(param2 || '')}</para2>\n`;
          xmlContent += `\t\t\t\t<para3>${escapeXml(param3 || '')}</para3>\n`;
          xmlContent += `\t\t\t\t<para4>${escapeXml(param4 || '')}</para4>\n`;
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

    const xmlBuildCostMs = Date.now() - xmlBuildStart;

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

    console.log(`[exportMultiLanguageXML] done langs=${langList.join(',')} codes=${errorCodes.length} i18nRows=${i18nRows.length} queryMs=${queryCostMs} queryCodesMs=${queryErrorCodesMs} queryI18nMs=${queryI18nMs} buildMs=${xmlBuildCostMs}`);
    res.json({
      message: '多语言XML导出成功',
      languages: langList,
      xmlResults
    });
  } catch (err) {
    console.error('[exportMultiLanguageXML] failed:', err);
    res.status(500).json({ message: '多语言XML导出失败', error: err.message });
  }
};

// CSV导出功能（包含主表全部字段，可选包含多语言字段）
const exportErrorCodesToCSV = async (req, res) => {
  const startedAt = Date.now();
  const stageDurations = {};
  const markStage = (name, fromTs) => {
    stageDurations[name] = Date.now() - fromTs;
  };
  try {
    const { language = '', format = 'csv' } = req.query;
    const targetLang = String(language).trim().toLowerCase();
    const exportLang = targetLang || 'zh';
    const exportLangBase = exportLang.split('-')[0];

    // 根据格式选择分隔符
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

    // 先只拉取主表字段，避免与多关联 JOIN 导致行数膨胀
    const structuralFields = ['id', 'subsystem', 'code', 'is_axis_error', 'is_arm_error', 'solution', 'for_expert', 'for_novice', 'related_log', 'stop_report', 'level', 'category'];
    const queryMainStartedAt = Date.now();
    const errorCodes = await ErrorCode.findAll({
      attributes: structuralFields,
      order: [['subsystem', 'ASC'], ['code', 'ASC']],
      raw: true
    });
    markStage('queryMainMs', queryMainStartedAt);

    if (!Array.isArray(errorCodes) || errorCodes.length === 0) {
      console.info('[ErrorCodeExportTiming] exportErrorCodesToCSV empty result', {
        format,
        language: exportLang,
        totalMs: Date.now() - startedAt,
        ...stageDurations
      });
      return res.status(404).json({ message: '没有找到故障码数据' });
    }
    const header = [...baseFields];
    const errorCodeIds = errorCodes.map((ec) => ec.id);

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

    // 多语言字段列表（这些字段如果在 i18n_error_codes 中有对应语言的内容，则替换）
    const i18nFields = ['short_message', 'user_hint', 'operation', 'detail', 'method', 'param1', 'param2', 'param3', 'param4', 'tech_solution', 'explanation'];
    const i18nLangWhere = [
      { lang: exportLang },
      { lang: { [Op.like]: `${exportLang}-%` } }
    ];
    if (exportLangBase && exportLangBase !== exportLang) {
      i18nLangWhere.push({ lang: exportLangBase });
      i18nLangWhere.push({ lang: { [Op.like]: `${exportLangBase}-%` } });
    }
    const queryI18nStartedAt = Date.now();
    const allI18nRows = await I18nErrorCode.findAll({
      where: {
        error_code_id: { [Op.in]: errorCodeIds },
        [Op.or]: i18nLangWhere
      },
      attributes: ['error_code_id', 'lang', ...i18nFields],
      raw: true
    });
    markStage('queryI18nMs', queryI18nStartedAt);

    if (allI18nRows.length === 0) {
      console.info('[ErrorCodeExportTiming] exportErrorCodesToCSV no language data', {
        format,
        language: exportLang,
        rowCount: errorCodes.length,
        totalMs: Date.now() - startedAt,
        ...stageDurations
      });
      return res.status(404).json({ message: '无对应语言' });
    }

    // 预聚合：每个 error_code_id 按语言匹配优先级填充字段（不回退中文）
    const buildI18nMapStartedAt = Date.now();
    const scoreLang = (langRaw) => {
      const lang = String(langRaw || '').toLowerCase();
      if (lang === exportLang) return 3;
      if (lang === exportLangBase) return 2;
      if (lang.startsWith(`${exportLang}-`) || lang.startsWith(`${exportLangBase}-`)) return 1;
      return 0;
    };
    const i18nByErrorCode = new Map();
    for (const row of allI18nRows) {
      const errorCodeId = row.error_code_id;
      const langScore = scoreLang(row.lang);
      if (langScore <= 0) continue;
      let bucket = i18nByErrorCode.get(errorCodeId);
      if (!bucket) {
        bucket = { values: {}, fieldScore: {} };
        i18nByErrorCode.set(errorCodeId, bucket);
      }
      i18nFields.forEach((field) => {
        const v = row[field];
        if (v === null || v === undefined || v === '') return;
        const currentScore = bucket.fieldScore[field] || 0;
        if (!bucket.values[field] || langScore >= currentScore) {
          bucket.values[field] = v;
          bucket.fieldScore[field] = langScore;
        }
      });
    }
    markStage('buildI18nMapMs', buildI18nMapStartedAt);

    // 分析分类改为分步查询，避免与 i18n 联表产生笛卡尔放大
    const queryRelationsStartedAt = Date.now();
    const relationRows = await ErrorCodeAnalysisCategory.findAll({
      where: { error_code_id: { [Op.in]: errorCodeIds } },
      attributes: ['error_code_id', 'analysis_category_id'],
      raw: true
    });
    markStage('queryCategoryRelationMs', queryRelationsStartedAt);
    const categoryIds = [...new Set(relationRows.map((r) => r.analysis_category_id).filter(Boolean))];
    const queryCategoriesStartedAt = Date.now();
    const categories = categoryIds.length > 0
      ? await AnalysisCategory.findAll({
        where: { id: { [Op.in]: categoryIds } },
        attributes: ['id', 'category_key', 'name_zh', 'name_en'],
        raw: true
      })
      : [];
    markStage('queryCategoriesMs', queryCategoriesStartedAt);
    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const buildCategoryMapStartedAt = Date.now();
    const categoryNamesByErrorCode = new Map();
    for (const rel of relationRows) {
      const ecId = rel.error_code_id;
      const cat = categoryById.get(rel.analysis_category_id);
      if (!cat) continue;
      const name = cat.name_zh || cat.name_en || cat.category_key || '';
      if (!name) continue;
      if (!categoryNamesByErrorCode.has(ecId)) categoryNamesByErrorCode.set(ecId, []);
      categoryNamesByErrorCode.get(ecId).push(name);
    }
    markStage('buildCategoryMapMs', buildCategoryMapStartedAt);

    // 记录操作日志
    if (req.user) {
      try {
        await logOperation({
          user_id: req.user.id,
          username: req.user.username,
          operation: 'CSV导出',
          description: `导出故障码CSV文件 (语言: ${exportLang})`,
          details: { language: exportLang, exportCount: errorCodes.length }
        });
      } catch { }
    }

    // 输出 CSV/TSV（带 BOM 以兼容 Excel），采用流式写出降低内存占用
    const extension = isTsv ? 'tsv' : 'csv';
    const mimeType = isTsv ? 'text/tab-separated-values' : 'text/csv';
    const filename = `error_codes_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${extension}`;
    res.setHeader('Content-Type', `${mimeType}; charset=utf-8`);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    const streamWriteStartedAt = Date.now();
    res.write('\uFEFF');
    res.write(`${header.map(escapeValue).join(separator)}\r\n`);

    for (const ec of errorCodes) {
      const row = [];
      const categoryNames = (categoryNamesByErrorCode.get(ec.id) || []).join('|');
      const effectiveI18n = i18nByErrorCode.get(ec.id)?.values || null;

      for (const field of baseFields) {
        if (field === 'category' && categoryNames) {
          row.push(escapeValue(categoryNames));
          continue;
        }

        if (field === 'subsystem') {
          row.push(escapeValue(ec[field]));
          continue;
        }

        if (i18nFields.includes(field)) {
          if (effectiveI18n && Object.prototype.hasOwnProperty.call(effectiveI18n, field)) {
            row.push(escapeValue(effectiveI18n[field] || ''));
          } else {
            row.push(escapeValue(''));
          }
        } else {
          row.push(escapeValue(ec[field]));
        }
      }
      res.write(`${row.join(separator)}\r\n`);
    }
    markStage('streamWriteMs', streamWriteStartedAt);
    const totalMs = Date.now() - startedAt;
    console.info('[ErrorCodeExportTiming] exportErrorCodesToCSV done', {
      format,
      language: exportLang,
      rowCount: errorCodes.length,
      i18nRowCount: allI18nRows.length,
      relationRowCount: relationRows.length,
      uniqueCategoryCount: categoryIds.length,
      totalMs,
      ...stageDurations
    });
    return res.end();
  } catch (err) {
    console.error('[ErrorCodeExportTiming] exportErrorCodesToCSV failed', {
      totalMs: Date.now() - startedAt,
      ...stageDurations,
      error: err?.message || String(err)
    });
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

    // 优先使用ES精确查询，失败时fallback到MySQL
    let errorCode = null;
    try {
      const { searchByCode: searchErrorCodeByCodeEs } = require('../services/errorCodeSearchService');
      const esResult = await searchErrorCodeByCodeEs({
        code,
        subsystem,
        lang: req.headers['accept-language'] || req.query.lang || 'zh'
      });

      if (esResult.ok && esResult.item) {
        // ES查询成功，从MySQL获取完整数据（包括关联数据）
        errorCode = await ErrorCode.findByPk(esResult.item.id, {
          include: [
            {
              model: I18nErrorCode,
              as: 'i18nContents',
              required: false,
              attributes: ['id', 'lang', 'short_message', 'user_hint', 'operation', 'detail', 'method', 'param1', 'param2', 'param3', 'param4', 'tech_solution', 'explanation']
            }
          ]
        });
      }
    } catch (esError) {
      // ES查询失败，fallback到MySQL
      console.warn('[故障码查询] ES查询失败，fallback到MySQL:', esError?.message || esError);
    }

    // 如果ES查询失败或没有结果，使用MySQL查询
    if (!errorCode) {
      errorCode = await ErrorCode.findOne({
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
    }

    if (!errorCode) {
      return res.json({ errorCode: null });
    }

    // 根据请求语言合并多语言内容
    // 从 Accept-Language 头或查询参数获取语言偏好
    const acceptLanguage = req.headers['accept-language'] || req.query.lang || 'zh';
    // 标准化语言代码：'en-US' -> 'en', 'zh-CN' -> 'zh', 'zh' -> 'zh'
    const targetLang = acceptLanguage.startsWith('en') ? 'en' : (acceptLanguage.startsWith('zh') ? 'zh' : acceptLanguage.split('-')[0]);

    const errorCodeData = errorCode.toJSON();

    const i18nContent = pickI18nContent(errorCodeData.i18nContents || [], targetLang);
    applyI18nTextFields(errorCodeData, i18nContent);

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
          const client = await getOssClient();
          objectKey = buildTempOssObjectKey(path.basename(file.filename || file.originalname || 'file'));
          const result = await client.put(objectKey, file.path);
          url = withQueryToken(buildOssUrl(objectKey, result?.url), req);
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
    let techSolutionText = '';

    // 语言优先：当 Accept-Language 不是中文时，尝试使用 i18n 版本
    const acceptLanguage = req.headers['accept-language'] || req.query.lang || 'zh';
    const targetLang = acceptLanguage.startsWith('en')
      ? 'en'
      : (acceptLanguage.startsWith('zh') ? 'zh' : acceptLanguage.split('-')[0]);

    const i18nContent = pickI18nContent(errorCode.i18nContents || [], targetLang);
    if (i18nContent && typeof i18nContent.tech_solution === 'string') {
      techSolutionText = i18nContent.tech_solution;
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
        const client = await getOssClient();
        const destKey = result.object_key.replace('/tmp/', '/');
        try {
          await client.copy(destKey, result.object_key);
          await client.delete(result.object_key);
          result.object_key = destKey;
          result.url = withQueryToken(buildOssUrl(destKey), req);
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

    // 在删除数据库记录之前，先获取要删除的图片信息，以便删除OSS文件
    const existingImages = await TechSolutionImage.findAll({
      where: { error_code_id: id }
    });

    const acceptLanguage = req.headers['accept-language'] || req.query.lang || 'zh';
    const targetLang = acceptLanguage.startsWith('en')
      ? 'en'
      : (acceptLanguage.startsWith('zh') ? 'zh' : acceptLanguage.split('-')[0]);

    await sequelize.transaction(async (t) => {
      const [i18nContent] = await I18nErrorCode.findOrCreate({
        where: { error_code_id: id, lang: targetLang },
        defaults: { error_code_id: id, lang: targetLang },
        transaction: t
      });
      await i18nContent.update({ tech_solution: tech_solution || null }, { transaction: t });
      await TechSolutionImage.destroy({ where: { error_code_id: id }, transaction: t });
      if (assetsToSave.length > 0) {
        await TechSolutionImage.bulkCreate(assetsToSave, { transaction: t });
      }
    });

    // 删除OSS上的旧文件（在事务提交后执行，避免影响事务）
    if (existingImages.length > 0) {
      // 找出不在新列表中的文件（即被删除的文件）
      // 使用 object_key 进行比较，因为它是文件的唯一标识
      const newObjectKeys = new Set(
        assetsToSave
          .map(img => {
            // 从 object_key 或 url 中提取 object_key
            if (img.object_key) return String(img.object_key).replace(/^\//, '');
            if (img.url) {
              // 尝试从 URL 中提取 object_key
              const urlStr = String(img.url);
              if (urlStr.includes('/tech-solution/')) {
                const match = urlStr.match(/tech-solution\/([^?]+)/);
                if (match) return `tech-solution/${match[1]}`;
              }
            }
            return null;
          })
          .filter(Boolean)
      );

      const toDelete = existingImages.filter(img => {
        const imgKey = img.object_key ? String(img.object_key).replace(/^\//, '') : null;
        return imgKey && !newObjectKeys.has(imgKey);
      });

      // 删除OSS或本地文件
      for (const img of toDelete) {
        try {
          if (img.storage === 'oss' && img.object_key) {
            const client = await getOssClient();
            const objectKey = String(img.object_key).replace(/^\//, '');
            await client.delete(objectKey);
            console.log(`已删除OSS技术方案附件: ${objectKey}`);
          } else if (img.storage === 'local' && img.object_key) {
            const filePath = path.resolve(LOCAL_DIR, String(img.object_key));
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              console.log(`已删除本地技术方案附件: ${filePath}`);
            }
          }
        } catch (e) {
          // 静默处理删除失败，避免影响主要操作
          console.warn(`删除技术方案附件文件失败 (${img.object_key || img.url}):`, e.message);
        }
      }
    }

    const freshImages = await TechSolutionImage.findAll({
      where: { error_code_id: id },
      order: [['sort_order', 'ASC'], ['id', 'ASC']]
    });

    syncErrorCodeAllLangsToEs(id).catch(() => { });

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
        const client = await getOssClient();
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

// 批量同步故障码到ES
const syncErrorCodesToEs = async (req, res) => {
  try {
    const { errorCodeIds, lang, recreateIndex } = req.body;

    // 检查ES是否启用
    if (!isErrorCodeEsEnabled()) {
      return res.status(503).json({
        message: 'ES同步功能已禁用',
        error: 'ERROR_CODE_ES_ENABLED=false'
      });
    }

    const { bulkIndexErrorCodes, ensureErrorCodeIndex } = require('../services/errorCodeIndexService');
    const targetLang = lang || 'zh';

    // 如果需要重建索引
    if (recreateIndex) {
      try {
        await ensureErrorCodeIndex({ recreate: true });
        console.log('✅ 故障码ES索引已重建');
      } catch (e) {
        console.error('重建ES索引失败:', e);
        return res.status(500).json({
          message: '重建ES索引失败',
          error: e?.message || e
        });
      }
    }

    // 批量同步
    const summary = await bulkIndexErrorCodes({
      errorCodeIds: errorCodeIds && Array.isArray(errorCodeIds) ? errorCodeIds : null,
      lang: targetLang,
      batchSize: 100
    });

    res.json({
      message: '批量同步完成',
      summary: {
        indexed: summary.indexed,
        failed: summary.failed,
        total: summary.indexed + summary.failed,
        errors: summary.errors.slice(0, 10) // 只返回前10个错误
      }
    });
  } catch (err) {
    console.error('批量同步故障码到ES失败:', err);
    res.status(500).json({ message: '批量同步失败', error: err.message });
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
  cleanupTempTechFiles,
  syncErrorCodesToEs
}; 
