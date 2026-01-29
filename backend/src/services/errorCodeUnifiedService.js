const { Op } = require('sequelize');
const ErrorCode = require('../models/error_code');
const I18nErrorCode = require('../models/i18n_error_code');
const AnalysisCategory = require('../models/analysis_category');
const { normalizePagination, MAX_PAGE_SIZE } = require('../constants/pagination');
const { searchByKeywords } = require('./errorCodeSearchService');
const { buildExplanationPreview } = require('../utils/explanationPreview');

function normalizeLangFromAccept(acceptLanguage) {
  const al = String(acceptLanguage || '').trim() || 'zh';
  if (al.startsWith('en')) return 'en';
  if (al.startsWith('zh')) return 'zh';
  return al.split('-')[0] || 'zh';
}

function normalizeBool(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

/**
 * 统一的故障码检索：识别(完整码/类型码/关键词) + ES/DB + 可选 preview
 *
 * 返回结构与 GET /api/error-codes 一致：
 * { errorCodes, total, _meta: { searchMethod, recognized?, ... }, preview? }
 */
async function searchErrorCodesUnified({
  // query params
  code,
  subsystem,
  level,
  category,
  keyword,
  q,
  ids,
  page,
  limit,
  // preview
  preview,
  param1,
  param2,
  param3,
  param4,
  // headers / i18n
  acceptLanguage,
  t
}) {
  const keywordQueryInit = (keyword ?? q);
  let keywordQuery = keywordQueryInit;
  const { page: safePage, limit: safeLimit } = normalizePagination(page, limit, MAX_PAGE_SIZE.STANDARD);

  const where = {};
  let esScoreMap = null;
  let searchMethod = null; // 'es' | 'mysql' | 'exact'
  let esDebugInfo = null;

  const targetLang = normalizeLangFromAccept(acceptLanguage);

  // 识别 q/keyword 是否为“纯故障码输入”（完整故障码 / 类型码）
  let recognized = null;
  const rawInput = String(keywordQuery ?? '').trim();
  if (rawInput) {
    const upper = rawInput.toUpperCase();
    const isPure = !/\s/.test(rawInput);
    if (isPure) {
      // 完整故障码：141010A（首位子系统 1-9/A，后 5 位十六进制，末位 A-E）
      if (/^[1-9A][0-9A-F]{5}[A-E]$/.test(upper)) {
        const derivedSubsystem = upper.charAt(0);
        const typeCode = upper.slice(-4); // 010A
        const variants = [typeCode, `0x${typeCode}`, `0X${typeCode}`];
        if (!subsystem) where.subsystem = derivedSubsystem;
        where.code = { [Op.in]: variants };
        keywordQuery = null;
        searchMethod = 'exact';
        recognized = { kind: 'full_code', input: rawInput, subsystem: derivedSubsystem, typeCode };
      } else {
        // 类型码：010A / 0x010A / 0X010A
        const mType = upper.match(/^(?:0X|0x)?([0-9A-F]{3}[A-E])$/);
        if (mType) {
          const typeCode = String(mType[1] || '').toUpperCase();
          const variants = [typeCode, `0x${typeCode}`, `0X${typeCode}`];
          where.code = { [Op.in]: variants };
          keywordQuery = null;
          searchMethod = 'exact';
          recognized = { kind: 'type_code', input: rawInput, typeCode };
        } else {
          recognized = { kind: 'keyword', input: rawInput };
        }
      }
    } else {
      recognized = { kind: 'keyword', input: rawInput };
    }
  }

  // ids 批量查询：用于回显
  if (ids) {
    const idList = String(ids)
      .split(',')
      .map((s) => Number(String(s).trim()))
      .filter((n) => Number.isFinite(n));
    if (idList.length > 0) {
      where.id = { [Op.in]: idList };
    } else {
      return { errorCodes: [], total: 0, _meta: { searchMethod: 'none', hasKeywordSearch: false } };
    }
  } else {
    // 若识别为完整码/类型码：优先用 ES 做精确检索（可跨子系统），失败再回落 DB
    // 注：这里复用 errorCodeSearchService.searchByKeywords 的“typeCode识别+terms(codeVariants)”逻辑
    if (recognized && (recognized.kind === 'full_code' || recognized.kind === 'type_code')) {
      try {
        const esLimit = Math.min(Math.max(safeLimit * 3, 10), 50);
        const esResult = await searchByKeywords({
          keywords: [rawInput],
          lang: targetLang,
          limit: esLimit
        });
        if (esResult.ok && Array.isArray(esResult.items) && esResult.items.length > 0) {
          const esMatchedIds = esResult.items.map((item) => item.id).filter((id) => Number.isFinite(id));
          if (esMatchedIds.length > 0) {
            where.id = { [Op.in]: esMatchedIds };
            esScoreMap = new Map();
            esResult.items.forEach((item) => {
              if (item.id && item._score !== null && item._score !== undefined) {
                esScoreMap.set(item.id, item._score);
              }
            });
            searchMethod = 'es';
            esDebugInfo = {
              method: 'es',
              input: rawInput,
              esMatchedCount: esResult.items.length,
              esTotal: esResult.debug?.total || esResult.items.length,
              lang: targetLang
            };
          }
        }
      } catch (_) {
        // ignore and fallback to DB where.code variants (below)
      }
    }

    if (code) {
      const c = String(code).trim();
      // 兼容 010A / 0x010A / 0X010A，避免库内格式不一致导致"精确查"查不到
      const m = c.match(/^(0x)?([0-9a-fA-F]{4})$/i);
      if (m) {
        const tail = String(m[2] || '').toUpperCase();
        where.code = { [Op.in]: [tail, `0x${tail}`, `0X${tail}`] };
      } else {
        where.code = c;
      }
    }
    if (subsystem) where.subsystem = subsystem;
    if (level) where.level = level;
    if (category) where.category = category;

    // 关键词检索：优先 ES，失败 fallback MySQL
    let esMatchedIds = null;
    if (keywordQuery) {
      const kw = String(keywordQuery).trim();
      if (kw) {
        try {
          const esLimit = Math.max(
            safePage * safeLimit,
            safeLimit * 3,
            100
          );
          const esResult = await searchByKeywords({
            keywords: [kw],
            lang: targetLang,
            limit: esLimit
          });

          if (esResult.ok && esResult.items && esResult.items.length > 0) {
            esMatchedIds = esResult.items.map(item => item.id).filter(id => Number.isFinite(id));
            esScoreMap = new Map();
            esResult.items.forEach(item => {
              if (item.id && item._score !== null && item._score !== undefined) {
                esScoreMap.set(item.id, item._score);
              }
            });

            if (esMatchedIds.length > 0) {
              where.id = { [Op.in]: esMatchedIds };
              searchMethod = 'es';
              esDebugInfo = {
                method: 'es',
                keywords: [kw],
                esMatchedCount: esResult.items.length,
                esTotal: esResult.debug?.total || esResult.items.length,
                lang: targetLang
              };
            } else {
              esMatchedIds = null;
              esScoreMap = null;
              searchMethod = 'mysql';
            }
          } else {
            esMatchedIds = null;
            esScoreMap = null;
            searchMethod = 'mysql';
          }
        } catch (_) {
          esMatchedIds = null;
          esScoreMap = null;
          searchMethod = 'mysql';
        }

        if (!esMatchedIds || esMatchedIds.length === 0) {
          where[Op.or] = [
            { short_message: { [Op.like]: `%${kw}%` } },
            { user_hint: { [Op.like]: `%${kw}%` } },
            { operation: { [Op.like]: `%${kw}%` } },
            { code: { [Op.like]: `%${kw}%` } }
          ];
          esScoreMap = null;
          if (!searchMethod) searchMethod = 'mysql';
        }
      }
    }
  }

  const include = [];
  if (!ids) {
    include.push({
      model: AnalysisCategory,
      as: 'analysisCategories',
      through: { attributes: [] },
      attributes: ['id', 'category_key', 'name_zh', 'name_en']
    });
  }
  if (!ids && targetLang !== 'zh') {
    include.push({
      model: I18nErrorCode,
      as: 'i18nContents',
      required: false,
      attributes: ['id', 'lang', 'short_message', 'user_hint', 'operation', 'detail', 'method', 'param1', 'param2', 'param3', 'param4', 'tech_solution', 'explanation']
    });
  }

  const findOptions = { where, distinct: true, include };
  if (!(esScoreMap && esScoreMap.size > 0)) {
    findOptions.order = [['subsystem', 'ASC'], ['code', 'ASC']];
  }

  let total = 0;
  let errorCodes = [];
  if (ids) {
    errorCodes = await ErrorCode.findAll(findOptions);
    total = errorCodes.length;
  } else {
    const result = await ErrorCode.findAndCountAll({
      ...findOptions,
      offset: (safePage - 1) * safeLimit,
      limit: safeLimit
    });
    total = result.count;
    errorCodes = result.rows;

    if (esScoreMap && esScoreMap.size > 0) {
      errorCodes.sort((a, b) => {
        const scoreA = esScoreMap.get(a.id) || 0;
        const scoreB = esScoreMap.get(b.id) || 0;
        if (scoreB !== scoreA) return scoreB - scoreA;
        if (a.subsystem !== b.subsystem) return a.subsystem.localeCompare(b.subsystem);
        return a.code.localeCompare(b.code);
      });
    }
  }

  const processedErrorCodes = errorCodes.map(errorCode => {
    const errorCodeData = errorCode.toJSON();
    if (targetLang === 'zh' || targetLang === 'zh-CN') {
      delete errorCodeData.i18nContents;
      return errorCodeData;
    }

    const i18nContent = errorCodeData.i18nContents?.find(content => {
      const contentLang = content.lang.split('-')[0];
      return contentLang === targetLang;
    });

    if (i18nContent) {
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

    delete errorCodeData.i18nContents;
    return errorCodeData;
  });

  const response = { errorCodes: processedErrorCodes, total };

  if (keywordQuery && String(keywordQuery).trim()) {
    response._meta = {
      searchMethod: searchMethod || 'none',
      keyword: String(keywordQuery).trim(),
      hasKeywordSearch: true
    };
    if (esDebugInfo) response._meta.esDebug = esDebugInfo;
    if (esScoreMap && esScoreMap.size > 0) {
      response._meta.sorting = { method: 'es_relevance', sortedByScore: true, scoreCount: esScoreMap.size };
    } else if (searchMethod === 'mysql') {
      response._meta.sorting = { method: 'mysql_default', sortedByScore: false };
    }
  } else {
    response._meta = { searchMethod: searchMethod || 'none', hasKeywordSearch: false };
  }

  if (recognized) {
    response._meta = response._meta || {};
    response._meta.recognized = recognized;
  }

  if (normalizeBool(preview)) {
    try {
      const previewResult = await buildExplanationPreview({
        rawCode: rawInput,
        subsystem: (subsystem ? String(subsystem).trim().toUpperCase() : null),
        params: { param1, param2, param3, param4 },
        t: t || ((k) => k)
      });
      response.preview = previewResult;
    } catch (e) {
      response.preview = null;
      response._meta = response._meta || {};
      response._meta.previewError = { status: e?.status || 500, message: e?.message || 'preview_failed' };
    }
  }

  return response;
}

module.exports = {
  searchErrorCodesUnified
};

