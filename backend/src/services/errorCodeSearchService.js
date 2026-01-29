const { getElasticsearchClient } = require('../config/elasticsearch');
const { ensureErrorCodeIndex } = require('./errorCodeIndexService');
const fs = require('fs');
const path = require('path');

function getErrorCodeIndexName() {
  return String(process.env.ERROR_CODE_ES_INDEX || 'error_codes_index').trim();
}

function normalizeLang(lang) {
  const s = String(lang || '').trim().toLowerCase();
  return s.startsWith('en') ? 'en' : 'zh';
}

function clampInt(n, min, max, fallback) {
  const v = Number.parseInt(n, 10);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(Math.max(v, min), max);
}

/**
 * 获取检索字段权重配置
 * 优先级：JSON配置文件 > 环境变量 > 默认值
 * 
 * 支持方式：
 * 1. JSON配置文件：backend/src/config/errorCodeSearchWeights.json
 * 2. 环境变量：ERROR_CODE_ES_FIELD_WEIGHTS=code:5,short_message:3,...
 * 
 * 支持动态添加新字段，不限制在默认字段列表中
 * 
 * @returns {Object} 字段权重映射对象，格式：{ field: weight, ... }
 */
function getSearchFieldWeights() {
  const defaultWeights = {
    code: 5,
    short_message: 3,
    user_hint: 2,
    operation: 2,
    detail: 1,
    tech_solution: 1,
    method: 0.5,
    explanation: 0.5
  };

  let configWeights = {};

  // 方式1：优先从JSON配置文件读取
  const configPath = path.join(__dirname, '../config/errorCodeSearchWeights.json');
  try {
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configContent);

      // 支持两种JSON格式：
      // 1. { weights: { field: { weight: 5, description: "..." }, ... } }
      // 2. { weights: { field: 5, ... } } 或 { field: 5, ... }
      if (config.weights && typeof config.weights === 'object') {
        for (const [field, value] of Object.entries(config.weights)) {
          if (value && typeof value === 'object' && value.weight !== undefined) {
            // 格式1：{ weight: 5, description: "..." }
            const weight = Number.parseFloat(value.weight);
            if (Number.isFinite(weight) && weight > 0) {
              configWeights[field] = weight;
            }
          } else if (typeof value === 'number' || typeof value === 'string') {
            // 格式2：直接是数字或字符串
            const weight = Number.parseFloat(value);
            if (Number.isFinite(weight) && weight > 0) {
              configWeights[field] = weight;
            }
          }
        }
      } else if (typeof config === 'object' && !Array.isArray(config)) {
        // 直接是 { field: weight, ... } 格式
        // 忽略元数据字段（以$开头的字段）
        const metadataFields = ['$schema', '$comment', '$description', '$note', 'description', 'comment'];
        for (const [field, value] of Object.entries(config)) {
          if (!metadataFields.includes(field) && !field.startsWith('$')) {
            const weight = Number.parseFloat(value);
            if (Number.isFinite(weight) && weight > 0) {
              configWeights[field] = weight;
            }
          }
        }
      }
    }
  } catch (fileError) {
    console.warn('[检索权重配置] JSON配置文件读取失败，尝试其他方式:', fileError?.message || fileError);
  }

  // 方式2：从环境变量读取（向后兼容）
  const envWeights = process.env.ERROR_CODE_ES_FIELD_WEIGHTS;
  if (envWeights && Object.keys(configWeights).length === 0) {
    try {
      const envStr = String(envWeights).trim();

      // 尝试解析JSON格式的环境变量
      if (envStr.startsWith('{') || envStr.startsWith('[')) {
        try {
          const parsed = JSON.parse(envStr);
          if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            for (const [field, weight] of Object.entries(parsed)) {
              const numWeight = Number.parseFloat(weight);
              if (Number.isFinite(numWeight) && numWeight > 0) {
                configWeights[field] = numWeight;
              }
            }
          }
        } catch (jsonError) {
          // JSON解析失败，尝试键值对格式
        }
      }

      // 键值对格式：code:5,short_message:3,...
      if (Object.keys(configWeights).length === 0) {
        const pairs = envStr.split(',');
        for (const pair of pairs) {
          const [field, weight] = pair.split(':').map(s => s.trim());
          if (field && weight) {
            const numWeight = Number.parseFloat(weight);
            if (Number.isFinite(numWeight) && numWeight > 0) {
              configWeights[field] = numWeight;
            }
          }
        }
      }
    } catch (envError) {
      console.warn('[检索权重配置] 环境变量解析失败:', envError?.message || envError);
    }
  }

  // 合并权重：先使用默认权重，然后用配置文件/环境变量覆盖
  // 注意：配置文件/环境变量可以添加新字段（不在默认列表中的字段），这些新字段会被保留
  const mergedWeights = { ...defaultWeights };
  for (const [field, weight] of Object.entries(configWeights)) {
    if (weight > 0) {
      mergedWeights[field] = weight;
    }
  }

  return mergedWeights;
}

/**
 * 构建ES multi_match查询的fields数组（带权重）
 * @param {Object} weights - 字段权重映射
 * @returns {string[]} fields数组，格式：['field^weight', ...]
 */
function buildSearchFields(weights) {
  const fields = [];
  for (const [field, weight] of Object.entries(weights)) {
    if (weight > 0) {
      fields.push(`${field}^${weight}`);
    }
  }
  return fields;
}

/**
 * 检查ES是否可用
 * @returns {Promise<boolean>}
 */
async function isElasticsearchAvailable() {
  try {
    const client = getElasticsearchClient();
    await client.ping();
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 按关键词搜索故障码
 * @param {Object} params
 * @param {string[]} params.keywords - 关键词数组
 * @param {string} params.lang - 语言代码（默认'zh'）
 * @param {number} params.limit - 返回数量限制（默认10）
 * @returns {Promise<{ok: boolean, items: Array, debug: Object}>}
 */
async function searchByKeywords({ keywords, lang = 'zh', limit = 10 }) {
  const kwList = Array.isArray(keywords) ? keywords.map((k) => String(k || '').trim()).filter(Boolean) : [];
  if (kwList.length === 0) {
    return { ok: true, items: [], debug: { skipped: true, reason: 'no_keywords' } };
  }

  const safeLimit = clampInt(limit, 1, 50, 10);
  const targetLang = normalizeLang(lang);

  // 检查ES是否可用
  if (!(await isElasticsearchAvailable())) {
    return { ok: false, items: [], error: { code: 'es_unavailable', message: 'Elasticsearch不可用' }, debug: { skipped: true, reason: 'es_unavailable' } };
  }

  const client = getElasticsearchClient();
  const index = getErrorCodeIndexName();

  // 确保索引存在
  await ensureErrorCodeIndex({ recreate: false });

  // 获取配置的字段权重
  const fieldWeights = getSearchFieldWeights();
  const searchFields = buildSearchFields(fieldWeights);

  // 构建查询：对每个关键词进行多字段匹配
  // 对于故障码格式的查询（如"010A" / "0X010A" / "142010A"），需要特殊处理 code 字段（keyword）的匹配：
  // - code 在索引里是 keyword（精确匹配），不适合用 suffix/wildcard（性能差/不可控）
  // - 兼容“完整故障码”输入：提取末尾4位十六进制作为 typeCode，再做 terms 精确匹配
  const shouldQueries = kwList.map((kw) => {
    const raw = String(kw).trim();

    // 识别“可能的 typeCode”：
    // 1) 010A / 0x010A / 0X010A
    // 2) 142010A / 165100A 等“完整故障码”，取末尾4位十六进制
    let typeCode = null;
    let maybeSubsystem = null;

    const mExact = raw.match(/^(0[xX])?([0-9a-fA-F]{4})$/);
    if (mExact) {
      typeCode = String(mExact[2] || '').toUpperCase();
    } else {
      const mTail = raw.match(/([0-9a-fA-F]{4})$/);
      if (mTail) {
        typeCode = String(mTail[1] || '').toUpperCase();
        // 常见“完整故障码”第一位是子系统（1-9或A）
        if (/^[1-9A]/i.test(raw)) {
          maybeSubsystem = raw.charAt(0).toUpperCase();
        }
      }
    }

    if (typeCode) {
      // 是（或包含）故障码类型码，构建包含精确匹配的查询
      const codeValue = typeCode; // 4位码（如"010A"）
      const codeVariants = [
        codeValue,           // "010A"
        `0x${codeValue}`,    // "0x010A"
        `0X${codeValue}`     // "0X010A"
      ];

      return {
        bool: {
          should: [
            // 如果能推断 subsystem，则优先精确匹配 (subsystem + code)
            ...(maybeSubsystem ? [{
              bool: {
                must: [
                  { term: { subsystem: String(maybeSubsystem) } },
                  { terms: { code: codeVariants } }
                ]
              }
            }] : []),
            // 精确匹配code字段（使用term查询，支持keyword类型）
            {
              terms: {
                code: codeVariants
              }
            },
            // 同时也在其他文本字段中搜索（支持部分匹配）
            {
              multi_match: {
                query: raw,
                type: 'best_fields',
                fields: searchFields.filter(f => !f.startsWith('code^')), // 排除code字段，避免重复
                operator: 'or'
              }
            }
          ],
          minimum_should_match: 1
        }
      };
    } else {
      // 不是故障码格式，使用标准的多字段匹配
      return {
        multi_match: {
          query: raw,
          type: 'best_fields',
          fields: searchFields,
          operator: 'or'
        }
      };
    }
  });

  try {
    const resp = await client.search({
      index,
      size: safeLimit * 2, // 多取一些，后续去重
      track_total_hits: true,
      _source: [
        'errorCodeId', 'lang', 'subsystem', 'code', 'level', 'category',
        'short_message', 'user_hint', 'operation', 'detail', 'tech_solution', 'explanation',
        'is_axis_error', 'is_arm_error', 'param1', 'param2', 'param3', 'param4'
      ],
      query: {
        bool: {
          should: shouldQueries,
          minimum_should_match: 1, // 至少匹配一个关键词
          filter: [{ term: { lang: targetLang } }]
        }
      }
    });

    const hits = Array.isArray(resp?.hits?.hits) ? resp.hits.hits : [];
    const seen = new Set();
    const items = [];

    for (const hit of hits) {
      const source = hit._source || {};
      const key = `${source.errorCodeId || ''}:${source.code || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);

      items.push({
        id: source.errorCodeId,
        subsystem: source.subsystem || '',
        code: source.code || '',
        level: source.level || '',
        category: source.category || '',
        short_message: source.short_message || '',
        user_hint: source.user_hint || '',
        operation: source.operation || '',
        detail: source.detail || '',
        tech_solution: source.tech_solution || '',
        explanation: source.explanation || '',
        is_axis_error: source.is_axis_error || false,
        is_arm_error: source.is_arm_error || false,
        param1: source.param1 || '',
        param2: source.param2 || '',
        param3: source.param3 || '',
        param4: source.param4 || '',
        _match: { type: 'keyword', keywords: kwList },
        _score: hit._score || null
      });

      if (items.length >= safeLimit) break;
    }

    return {
      ok: true,
      items: items.slice(0, safeLimit),
      debug: {
        keywords: kwList,
        lang: targetLang,
        total: resp?.hits?.total?.value ?? items.length,
        returned: items.length
      }
    };
  } catch (e) {
    return {
      ok: false,
      items: [],
      error: { code: 'es_search_failed', message: String(e?.message || e) },
      debug: { keywords: kwList, lang: targetLang, error: String(e?.message || e) }
    };
  }
}

/**
 * 按精确故障码搜索
 * @param {Object} params
 * @param {string} params.code - 故障码（如'0X010A'）
 * @param {string} params.subsystem - 子系统（可选）
 * @param {string} params.lang - 语言代码（默认'zh'）
 * @returns {Promise<{ok: boolean, item: Object|null}>}
 */
async function searchByCode({ code, subsystem = null, lang = 'zh' }) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) {
    return { ok: true, item: null, debug: { skipped: true, reason: 'no_code' } };
  }

  const targetLang = normalizeLang(lang);

  // 检查ES是否可用
  if (!(await isElasticsearchAvailable())) {
    return { ok: false, item: null, error: { code: 'es_unavailable', message: 'Elasticsearch不可用' } };
  }

  const client = getElasticsearchClient();
  const index = getErrorCodeIndexName();

  await ensureErrorCodeIndex({ recreate: false });

  // 构建查询
  const must = [{ term: { code: c } }, { term: { lang: targetLang } }];
  if (subsystem) {
    must.push({ term: { subsystem: String(subsystem).trim().toUpperCase() } });
  }

  try {
    const resp = await client.search({
      index,
      size: 1,
      query: {
        bool: { must }
      }
    });

    const hits = Array.isArray(resp?.hits?.hits) ? resp.hits.hits : [];
    if (hits.length === 0) {
      return { ok: true, item: null, debug: { code: c, subsystem, lang: targetLang, found: false } };
    }

    const source = hits[0]._source || {};
    const item = {
      id: source.errorCodeId,
      subsystem: source.subsystem || '',
      code: source.code || '',
      level: source.level || '',
      category: source.category || '',
      short_message: source.short_message || '',
      user_hint: source.user_hint || '',
      operation: source.operation || '',
      detail: source.detail || '',
      tech_solution: source.tech_solution || '',
      explanation: source.explanation || '',
      is_axis_error: source.is_axis_error || false,
      is_arm_error: source.is_arm_error || false,
      param1: source.param1 || '',
      param2: source.param2 || '',
      param3: source.param3 || '',
      param4: source.param4 || '',
      _match: { type: 'exact_code', code: c },
      _score: hits[0]._score || null
    };

    return { ok: true, item, debug: { code: c, subsystem, lang: targetLang, found: true } };
  } catch (e) {
    return {
      ok: false,
      item: null,
      error: { code: 'es_search_failed', message: String(e?.message || e) },
      debug: { code: c, subsystem, lang: targetLang, error: String(e?.message || e) }
    };
  }
}

/**
 * 按故障类型搜索（前缀匹配，匹配所有子系统）
 * @param {Object} params
 * @param {string[]} params.typeCodes - 故障类型数组（如['0X010A']）
 * @param {string} params.lang - 语言代码（默认'zh'）
 * @param {number} params.limit - 返回数量限制（默认10）
 * @returns {Promise<{ok: boolean, items: Array, debug: Object}>}
 */
async function searchByTypeCodes({ typeCodes, lang = 'zh', limit = 10 }) {
  const codes = Array.isArray(typeCodes) ? typeCodes.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean) : [];
  if (codes.length === 0) {
    return { ok: true, items: [], debug: { skipped: true, reason: 'no_type_codes' } };
  }

  const safeLimit = clampInt(limit, 1, 50, 10);
  const targetLang = normalizeLang(lang);

  // 检查ES是否可用
  if (!(await isElasticsearchAvailable())) {
    return { ok: false, items: [], error: { code: 'es_unavailable', message: 'Elasticsearch不可用' }, debug: { skipped: true, reason: 'es_unavailable' } };
  }

  const client = getElasticsearchClient();
  const index = getErrorCodeIndexName();

  await ensureErrorCodeIndex({ recreate: false });

  // 构建查询：使用prefix匹配故障类型
  const shouldQueries = codes.map((code) => ({
    prefix: { code }
  }));

  try {
    const resp = await client.search({
      index,
      size: safeLimit * 3, // 多取一些，因为可能匹配多个子系统
      track_total_hits: true,
      _source: [
        'errorCodeId', 'lang', 'subsystem', 'code', 'level', 'category',
        'short_message', 'user_hint', 'operation', 'detail', 'tech_solution', 'explanation',
        'is_axis_error', 'is_arm_error', 'param1', 'param2', 'param3', 'param4'
      ],
      query: {
        bool: {
          should: shouldQueries,
          minimum_should_match: 1,
          filter: [{ term: { lang: targetLang } }]
        }
      },
      sort: [{ code: { order: 'asc' } }] // 按故障码排序
    });

    const hits = Array.isArray(resp?.hits?.hits) ? resp.hits.hits : [];
    const seen = new Set();
    const items = [];

    for (const hit of hits) {
      const source = hit._source || {};
      const key = `${source.errorCodeId || ''}:${source.code || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);

      items.push({
        id: source.errorCodeId,
        subsystem: source.subsystem || '',
        code: source.code || '',
        level: source.level || '',
        category: source.category || '',
        short_message: source.short_message || '',
        user_hint: source.user_hint || '',
        operation: source.operation || '',
        detail: source.detail || '',
        tech_solution: source.tech_solution || '',
        explanation: source.explanation || '',
        is_axis_error: source.is_axis_error || false,
        is_arm_error: source.is_arm_error || false,
        param1: source.param1 || '',
        param2: source.param2 || '',
        param3: source.param3 || '',
        param4: source.param4 || '',
        _match: { type: 'fault_type', typeCodes: codes },
        _score: hit._score || null
      });

      if (items.length >= safeLimit) break;
    }

    return {
      ok: true,
      items: items.slice(0, safeLimit),
      debug: {
        typeCodes: codes,
        lang: targetLang,
        total: resp?.hits?.total?.value ?? items.length,
        returned: items.length
      }
    };
  } catch (e) {
    return {
      ok: false,
      items: [],
      error: { code: 'es_search_failed', message: String(e?.message || e) },
      debug: { typeCodes: codes, lang: targetLang, error: String(e?.message || e) }
    };
  }
}

module.exports = {
  getErrorCodeIndexName,
  isElasticsearchAvailable,
  searchByKeywords,
  searchByCode,
  searchByTypeCodes
};
