const { getElasticsearchClient } = require('../config/elasticsearch');
const ErrorCode = require('../models/error_code');
const I18nErrorCode = require('../models/i18n_error_code');

function getErrorCodeIndexName() {
  return String(process.env.ERROR_CODE_ES_INDEX || 'error_codes_index').trim();
}

function getAnalyzerIndex() {
  return String(process.env.ERROR_CODE_ES_ANALYZER_INDEX || process.env.KB_ES_ANALYZER_INDEX || 'ik_max_word').trim();
}

function getAnalyzerSearch() {
  return String(process.env.ERROR_CODE_ES_ANALYZER_SEARCH || process.env.KB_ES_ANALYZER_SEARCH || 'ik_smart').trim();
}

/**
 * 确保故障码ES索引存在
 * @param {Object} options
 * @param {boolean} options.recreate - 是否重建索引
 * @returns {Promise<{ok: boolean, created: boolean, index: string}>}
 */
async function ensureErrorCodeIndex({ recreate = false } = {}) {
  const client = getElasticsearchClient();
  const index = getErrorCodeIndexName();
  const existsResp = await client.indices.exists({ index });
  const exists = (typeof existsResp === 'boolean')
    ? existsResp
    : (existsResp && typeof existsResp === 'object' && Object.prototype.hasOwnProperty.call(existsResp, 'body'))
      ? !!existsResp.body
      : !!existsResp;

  if (recreate && exists) {
    await client.indices.delete({ index });
  }

  const existsAfter = recreate ? false : exists;
  if (existsAfter) return { ok: true, created: false, index };

  const analyzerIndex = getAnalyzerIndex();
  const analyzerSearch = getAnalyzerSearch();

  try {
    const createBody = (ai, as) => ({
      index,
      settings: {
        index: {
          number_of_shards: Number.parseInt(process.env.ERROR_CODE_ES_SHARDS || '1', 10) || 1,
          number_of_replicas: Number.parseInt(process.env.ERROR_CODE_ES_REPLICAS || '0', 10) || 0
        }
      },
      mappings: {
        properties: {
          // 标识字段（keyword）
          errorCodeId: { type: 'keyword' },
          lang: { type: 'keyword' },
          subsystem: { type: 'keyword' },
          code: { type: 'keyword' },

          // 分类字段（keyword）
          level: { type: 'keyword' },
          category: { type: 'keyword' },
          is_axis_error: { type: 'boolean' },
          is_arm_error: { type: 'boolean' },

          // 可搜索文本字段（text + keyword）
          short_message: {
            type: 'text',
            analyzer: ai,
            search_analyzer: as,
            fields: { keyword: { type: 'keyword', ignore_above: 256 } }
          },
          user_hint: {
            type: 'text',
            analyzer: ai,
            search_analyzer: as
          },
          operation: {
            type: 'text',
            analyzer: ai,
            search_analyzer: as
          },
          detail: {
            type: 'text',
            analyzer: ai,
            search_analyzer: as
          },
          method: {
            type: 'text',
            analyzer: ai,
            search_analyzer: as
          },
          tech_solution: {
            type: 'text',
            analyzer: ai,
            search_analyzer: as
          },
          explanation: {
            type: 'text',
            analyzer: ai,
            search_analyzer: as
          },
          param1: { type: 'keyword' },
          param2: { type: 'keyword' },
          param3: { type: 'keyword' },
          param4: { type: 'keyword' }
        }
      }
    });

    await client.indices.create({
      ...createBody(analyzerIndex, analyzerSearch)
    });
  } catch (e) {
    // Race-safe: ignore "already exists" errors.
    const type = String(e?.meta?.body?.error?.type || e?.name || '').toLowerCase();
    if (type.includes('resource_already_exists')) {
      // ok
    } else {
      // If IK isn't installed yet, fallback to standard analyzers for v1 usability.
      const reason = String(e?.meta?.body?.error?.reason || e?.message || '').toLowerCase();
      const isAnalyzerMissing = reason.includes('analyzer') && (reason.includes('not found') || reason.includes('unknown'));
      if (isAnalyzerMissing && (analyzerIndex.startsWith('ik_') || analyzerSearch.startsWith('ik_'))) {
        await client.indices.create({ ...createBody('standard', 'standard') });
      } else {
        throw e;
      }
    }
  }

  return { ok: true, created: true, index };
}

/**
 * 将MySQL故障码数据转换为ES文档
 * @param {Object} params
 * @param {Object} params.errorCode - error_codes表数据
 * @param {Object} params.i18nData - i18n_error_codes表数据（可选）
 * @param {string} params.lang - 语言代码
 * @returns {Object} ES文档
 */
function makeErrorCodeDoc({ errorCode, i18nData, lang }) {
  const doc = {
    errorCodeId: errorCode.id,
    lang: lang || 'zh',
    subsystem: errorCode.subsystem || '',
    code: errorCode.code || '',
    level: errorCode.level || '',
    category: errorCode.category || '',
    is_axis_error: !!errorCode.is_axis_error,
    is_arm_error: !!errorCode.is_arm_error,
    param1: errorCode.param1 || '',
    param2: errorCode.param2 || '',
    param3: errorCode.param3 || '',
    param4: errorCode.param4 || ''
  };

  // 合并多语言字段
  const i18nFields = [
    'short_message',
    'user_hint',
    'operation',
    'detail',
    'method',
    'tech_solution',
    'explanation'
  ];

  for (const field of i18nFields) {
    if (i18nData && Object.prototype.hasOwnProperty.call(i18nData, field)) {
      // 如果i18n数据中存在该字段（即使为空），使用i18n值
      doc[field] = i18nData[field] ?? '';
    } else if (Object.prototype.hasOwnProperty.call(errorCode, field)) {
      // 否则使用主表的值（中文默认值）
      doc[field] = errorCode[field] || '';
    } else {
      doc[field] = '';
    }
  }

  return doc;
}

/**
 * 索引单个故障码到ES（支持多语言）
 * @param {Object} params
 * @param {number} params.errorCodeId - 故障码ID
 * @param {string} params.lang - 语言代码（默认'zh'）
 * @param {string} params.refresh - 刷新策略（'wait_for'|'false'|'true'，默认'false'）
 * @returns {Promise<{ok: boolean, errorCodeId: number, lang: string}>}
 */
async function indexErrorCodeToEs({ errorCodeId, lang = 'zh', refresh = 'false' }) {
  const client = getElasticsearchClient();
  const index = getErrorCodeIndexName();
  await ensureErrorCodeIndex({ recreate: false });

  // 查询MySQL数据
  const errorCode = await ErrorCode.findByPk(errorCodeId);
  if (!errorCode) {
    throw new Error(`Error code not found: ${errorCodeId}`);
  }

  // 查询多语言数据
  let i18nData = null;
  if (lang !== 'zh') {
    const i18n = await I18nErrorCode.findOne({
      where: { error_code_id: errorCodeId, lang }
    });
    if (i18n) {
      i18nData = i18n.toJSON ? i18n.toJSON() : i18n;
    }
  }

  // 转换为ES文档
  const doc = makeErrorCodeDoc({
    errorCode: errorCode.toJSON ? errorCode.toJSON() : errorCode,
    i18nData,
    lang
  });

  // 文档ID格式：errorCodeId:lang
  const docId = `${errorCodeId}:${lang}`;

  // 索引到ES
  await client.index({
    index,
    id: docId,
    document: doc,
    refresh: refresh === 'wait_for' ? 'wait_for' : (refresh === 'true')
  });

  return { ok: true, errorCodeId, lang, docId };
}

/**
 * 批量索引故障码到ES
 * @param {Object} params
 * @param {number[]} params.errorCodeIds - 故障码ID数组（可选，不传则索引所有）
 * @param {string} params.lang - 语言代码（默认'zh'）
 * @param {number} params.batchSize - 批量大小（默认100）
 * @returns {Promise<{ok: boolean, indexed: number, failed: number, errors: Array}>}
 */
async function bulkIndexErrorCodes({ errorCodeIds = null, lang = 'zh', batchSize = 100 }) {
  const client = getElasticsearchClient();
  const index = getErrorCodeIndexName();
  await ensureErrorCodeIndex({ recreate: false });

  // 查询故障码ID列表
  let ids = errorCodeIds;
  if (!ids || ids.length === 0) {
    const allCodes = await ErrorCode.findAll({
      attributes: ['id'],
      order: [['id', 'ASC']]
    });
    ids = allCodes.map(c => c.id);
  }

  const summary = {
    ok: true,
    indexed: 0,
    failed: 0,
    errors: []
  };

  // 分批处理
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);

    // 批量查询MySQL
    const errorCodes = await ErrorCode.findAll({
      where: { id: { [require('sequelize').Op.in]: batch } }
    });

    // 批量查询多语言数据
    let i18nMap = new Map();
    if (lang !== 'zh') {
      const i18nList = await I18nErrorCode.findAll({
        where: {
          error_code_id: { [require('sequelize').Op.in]: batch },
          lang
        }
      });
      for (const i18n of i18nList) {
        i18nMap.set(i18n.error_code_id, i18n.toJSON ? i18n.toJSON() : i18n);
      }
    }

    // 构建批量操作
    const ops = [];
    for (const errorCode of errorCodes) {
      const ecData = errorCode.toJSON ? errorCode.toJSON() : errorCode;
      const i18nData = i18nMap.get(ecData.id) || null;
      const doc = makeErrorCodeDoc({ errorCode: ecData, i18nData, lang });
      const docId = `${ecData.id}:${lang}`;

      ops.push({ index: { _index: index, _id: docId } });
      ops.push(doc);
    }

    // 批量索引
    if (ops.length > 0) {
      try {
        const resp = await client.bulk({ refresh: false, operations: ops });
        if (resp?.errors) {
          const items = Array.isArray(resp.items) ? resp.items : [];
          const errors = items
            .map((it) => it?.index?.error || it?.create?.error || null)
            .filter(Boolean);
          summary.failed += errors.length;
          summary.errors.push(...errors.slice(0, 10)); // 只保留前10个错误
        }
        summary.indexed += errorCodes.length;
      } catch (e) {
        summary.failed += errorCodes.length;
        summary.errors.push({ message: String(e?.message || e), batch: batch.slice(0, 5) });
      }
    }
  }

  // 刷新索引
  if (summary.indexed > 0) {
    await client.indices.refresh({ index });
  }

  return summary;
}

/**
 * 从ES删除故障码索引
 * @param {Object} params
 * @param {number} params.errorCodeId - 故障码ID（可选，不传则删除所有语言版本）
 * @param {string} params.lang - 语言代码（可选，不传则删除所有语言版本）
 * @param {string} params.refresh - 刷新策略（默认'false'）
 * @returns {Promise<{ok: boolean, deleted: number}>}
 */
async function deleteErrorCodeFromEs({ errorCodeId = null, lang = null, refresh = 'false' }) {
  const client = getElasticsearchClient();
  const index = getErrorCodeIndexName();

  if (!errorCodeId) {
    // 删除所有故障码索引（重建索引时使用）
    await client.deleteByQuery({
      index,
      conflicts: 'proceed',
      refresh: refresh === 'true',
      query: { match_all: {} }
    });
    return { ok: true, deleted: -1 }; // -1表示全部删除
  }

  // 构建查询条件
  const query = { term: { errorCodeId } };
  if (lang) {
    // 删除特定语言版本
    const docId = `${errorCodeId}:${lang}`;
    try {
      await client.delete({
        index,
        id: docId,
        refresh: refresh === 'true'
      });
      return { ok: true, deleted: 1 };
    } catch (e) {
      if (e?.meta?.statusCode === 404) {
        return { ok: true, deleted: 0 }; // 文档不存在，视为成功
      }
      throw e;
    }
  } else {
    // 删除所有语言版本
    const resp = await client.deleteByQuery({
      index,
      conflicts: 'proceed',
      refresh: refresh === 'true',
      query
    });
    return { ok: true, deleted: resp?.deleted || 0 };
  }
}

module.exports = {
  getErrorCodeIndexName,
  ensureErrorCodeIndex,
  makeErrorCodeDoc,
  indexErrorCodeToEs,
  bulkIndexErrorCodes,
  deleteErrorCodeFromEs
};
