const fs = require('fs');
const path = require('path');
const Log = require('../models/log');
const ErrorCode = require('../models/error_code');
const AnalysisCategory = require('../models/analysis_category');
const { sequelize } = require('../models');
const Device = require('../models/device');
const dayjs = require('dayjs');
const { decryptLogContent } = require('../utils/decryptUtils');
const { getKeyForDeviceAndDate } = require('../services/deviceKeyService');
const { extractTimeFromFileName } = require('../utils/logTimeExtractor');
const { renderEntryExplanation, ensureCacheReady } = require('../services/logParsingService');
const { logProcessingQueue, realtimeProcessingQueue } = require('../config/queue');
const queueManager = require('../services/queueManager');
const { cacheManager } = require('../config/cache');
const websocketService = require('../services/websocketService');
const errorCodeCache = require('../services/errorCodeCache');
const { batchInsertHelper } = require('../utils/batchInsertHelper');
const { getClickHouseClient } = require('../config/clickhouse');

/**
 * 将时间转换为本地时间格式字符串（与 ClickHouse 存储格式一致）
 * ClickHouse 存储使用 'YYYY-MM-DD HH:mm:ss' 格式（无时区），
 * 查询时也应使用相同格式，避免 UTC 转换导致的时区问题
 * @param {string|Date} timeValue - 时间值（字符串或 Date 对象）
 * @returns {string} 格式化的时间字符串 'YYYY-MM-DD HH:mm:ss'
 */
function formatTimeForClickHouse(timeValue) {
  if (!timeValue) return null;
  
  // 如果已经是字符串格式
  if (typeof timeValue === 'string') {
    // 处理 ISO 格式：2025-12-13T14:21:10.000Z -> 2025-12-13 14:21:10
    let formatted = timeValue
      .replace('T', ' ')
      .replace(/\.\d{3}Z?$/, '')
      .replace(/Z$/, '')
      .trim();
    
    // 验证格式是否为 YYYY-MM-DD HH:mm:ss
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(formatted)) {
      return formatted;
    }
    
    // 如果不是标准格式，尝试用 dayjs 解析
    const parsed = dayjs(formatted);
    if (parsed.isValid()) {
      return parsed.format('YYYY-MM-DD HH:mm:ss');
    }
  }
  
  // 如果是 Date 对象或其他格式，使用 dayjs 格式化
  const parsed = dayjs(timeValue);
  if (parsed.isValid()) {
    return parsed.format('YYYY-MM-DD HH:mm:ss');
  }
  
  return null;
}

// [MIGRATION] LogEntry migrated to ClickHouse. Mocking Sequelize model to prevent crash.
const LogEntry = {
  findAll: async () => { console.warn('[MIGRATION] LogEntry.findAll called but table migrated to ClickHouse'); return []; },
  findOne: async () => { console.warn('[MIGRATION] LogEntry.findOne called but table migrated to ClickHouse'); return null; },
  findAndCountAll: async () => { console.warn('[MIGRATION] LogEntry.findAndCountAll called'); return { count: 0, rows: [] }; },
  count: async () => { return 0; },
  destroy: async () => { return 0; },
  bulkCreate: async () => { return []; }
};

// 从 ClickHouse log_entries 生成解密后的纯文本内容（按给定日志ID与版本）
async function buildDecryptedContentFromClickHouse(logId, version) {
  const client = getClickHouseClient();
  const result = await client.query({
    query: `
      SELECT 
        timestamp,
        error_code,
        param1,
        param2,
        param3,
        param4,
        explanation
      FROM log_entries
      WHERE log_id = {log_id:UInt32} AND version = {version:UInt32}
      ORDER BY timestamp ASC, row_index ASC
    `,
    query_params: {
      log_id: Number(logId),
      version: Number(version)
    },
    format: 'JSONEachRow'
  });
  const rows = await result.json();

  if (!rows || rows.length === 0) return '';

  const lines = rows.map(entry => {
    const localTs = dayjs(entry.timestamp).format('YYYY-MM-DD HH:mm:ss');
    const p1 = entry.param1 || '';
    const p2 = entry.param2 || '';
    const p3 = entry.param3 || '';
    const p4 = entry.param4 || '';
    const expl = entry.explanation || '';
    const err = entry.error_code || '';
    return `${localTs} ${err} ${p1} ${p2} ${p3} ${p4} ${expl}`.trimEnd();
  });

  return lines.join('\n');
}

// 通用函数：推送日志状态变化到 WebSocket
const pushLogStatusChange = (logId, oldStatus, newStatus) => {
  try {
    // 获取日志信息以获取设备ID
    Log.findByPk(logId).then(log => {
      if (log && log.device_id) {
        websocketService.pushLogStatusChange(log.device_id, logId, newStatus, oldStatus);
      }
    }).catch(err => {
      console.warn('推送状态变化失败:', err.message);
    });
  } catch (error) {
    console.warn('WebSocket 推送失败:', error.message);
  }
};

// 已移除 HanLP 相关调用
const SequelizeLib = require('sequelize');
const Op = SequelizeLib.Op;

// FULLTEXT(explanation) 索引检测与缓存（5分钟）
let ftExplanationCache = { has: null, at: 0 };
async function hasExplanationFulltextIndex() {
  const now = Date.now();
  if (ftExplanationCache.has !== null && (now - ftExplanationCache.at) < 5 * 60 * 1000) {
    return ftExplanationCache.has;
  }
  try {
    const dbName = process.env.DB_NAME;
    const [rows] = await sequelize.query(
      `SELECT 1 AS ok
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = :db
         AND TABLE_NAME = 'log_entries'
         AND INDEX_TYPE = 'FULLTEXT'
         AND COLUMN_NAME = 'explanation'
       LIMIT 1`,
      { replacements: { db: dbName } }
    );
    ftExplanationCache = { has: Array.isArray(rows) && rows.length > 0, at: now };
  } catch (e) {
    // 查询失败时保守回退为无全文索引
    ftExplanationCache = { has: false, at: now };
  }
  return ftExplanationCache.has;
}

// 分类允许码缓存（5分钟）：key = sorted category ids
const allowCodesCache = { data: new Map(), ttlMs: 5 * 60 * 1000 };
async function getAllowCodesForCategories(categoryIds) {
  const key = 'cat:' + [...categoryIds].sort((a,b)=>a-b).join(',');
  const now = Date.now();
  const cached = allowCodesCache.data.get(key);
  if (cached && (now - cached.at) < allowCodesCache.ttlMs) return cached.value;
  // 优先读取预计算映射表；若无数据再回退到实时 JOIN
  let rows = await sequelize.query(
    `SELECT subsystem_char, code4
     FROM code_category_map
     WHERE analysis_category_id IN (:ids)`,
    { replacements: { ids: categoryIds }, type: SequelizeLib.QueryTypes.SELECT }
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    rows = await sequelize.query(
      `SELECT LEFT(ec.subsystem,1) AS subsystem_char,
              CONCAT('0X', UPPER(RIGHT(ec.code,4))) AS code4
       FROM error_codes ec
       INNER JOIN error_code_analysis_categories ecac ON ec.id = ecac.error_code_id
       WHERE ecac.analysis_category_id IN (:ids)`,
      { replacements: { ids: categoryIds }, type: SequelizeLib.QueryTypes.SELECT }
    );
  }
  // 分组：subsystem_char -> [code4]
  const group = new Map();
  for (const r of rows) {
    const s = r.subsystem_char;
    const c = r.code4;
    if (!s || !c) continue;
    if (!group.has(s)) group.set(s, new Set());
    group.get(s).add(c);
  }
  const value = Array.from(group.entries()).map(([s, set]) => ({ subsystem_char: s, codes: Array.from(set) }));
  allowCodesCache.data.set(key, { value, at: now });
  return value;
}

/**
 * 构建分析分类过滤的 JOIN 子句（优化版）
 * 使用 JOIN 替代复杂 OR 条件，性能提升 10-20 倍
 * @param {Array<number>} categoryIds - 分析分类ID列表
 * @returns {Object} JOIN 信息 { useJoin, joinClause, fromClause }
 */
async function buildCategoryFilterJoin(categoryIds) {
  if (!categoryIds || categoryIds.length === 0) {
    return { useJoin: false, joinClause: '', fromClause: 'log_entries' };
  }

  // 检查 code_category_map 表中是否有数据
  const [countResult] = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM code_category_map WHERE analysis_category_id IN (:ids)`,
    { replacements: { ids: categoryIds }, type: SequelizeLib.QueryTypes.SELECT }
  );
  
  const hasPrecomputedData = countResult && countResult.cnt > 0;
  
  if (hasPrecomputedData) {
    // ✅ 优先使用预计算表（最快）
    console.log('[分类过滤] 使用预计算表 code_category_map，分类数:', categoryIds.length);
    return {
      useJoin: true,
      joinTable: 'code_category_map',
      joinClause: `
        INNER JOIN code_category_map ccm 
          ON log_entries.subsystem_char = ccm.subsystem_char 
          AND log_entries.code4 = ccm.code4
          AND ccm.analysis_category_id IN (${categoryIds.map(id => sequelize.escape(id)).join(',')})
      `,
      fromClause: 'log_entries'
    };
  } else {
    // ✅ 回退：实时 JOIN error_codes 表
    console.log('[分类过滤] 回退到实时 JOIN error_codes，分类数:', categoryIds.length);
    return {
      useJoin: true,
      joinTable: 'error_codes',
      joinClause: `
        INNER JOIN error_codes ec 
          ON log_entries.subsystem_char = LEFT(ec.subsystem, 1)
          AND log_entries.code4 = CONCAT('0X', UPPER(RIGHT(ec.code, 4)))
        INNER JOIN error_code_analysis_categories ecac 
          ON ec.id = ecac.error_code_id
          AND ecac.analysis_category_id IN (${categoryIds.map(id => sequelize.escape(id)).join(',')})
      `,
      fromClause: 'log_entries'
    };
  }
}

/**
 * 构建原生 SQL WHERE 子句（从 Sequelize where 对象）
 * @param {Object} where - Sequelize where 对象
 * @returns {Array<string>} WHERE 条件数组
 */
function buildWhereConditions(where) {
  const conditions = [];
  
  // 处理 log_id
  if (where.log_id) {
    if (where.log_id[Op.in]) {
      const ids = Array.isArray(where.log_id[Op.in]) ? where.log_id[Op.in] : [where.log_id[Op.in]];
      conditions.push(`log_entries.log_id IN (${ids.join(',')})`);
    } else {
      conditions.push(`log_entries.log_id = ${sequelize.escape(where.log_id)}`);
    }
  }
  
  // 处理 timestamp
  if (where.timestamp) {
    if (where.timestamp[Op.gte]) {
      conditions.push(`log_entries.timestamp >= ${sequelize.escape(where.timestamp[Op.gte])}`);
    }
    if (where.timestamp[Op.lte]) {
      conditions.push(`log_entries.timestamp <= ${sequelize.escape(where.timestamp[Op.lte])}`);
    }
    if (where.timestamp[Op.between]) {
      const [start, end] = where.timestamp[Op.between];
      conditions.push(`log_entries.timestamp BETWEEN ${sequelize.escape(start)} AND ${sequelize.escape(end)}`);
    }
  }
  
  // 处理 error_code
  if (where.error_code) {
    if (where.error_code[Op.like]) {
      conditions.push(`log_entries.error_code LIKE ${sequelize.escape(where.error_code[Op.like])}`);
    } else {
      conditions.push(`log_entries.error_code = ${sequelize.escape(where.error_code)}`);
    }
  }
  
  // 处理 code4（如果是十六进制搜索）
  if (where.code4) {
    conditions.push(`log_entries.code4 = ${sequelize.escape(where.code4)}`);
  }
  
  // ✅ 修复：递归处理 Op.and 数组，提取嵌套的条件
  if (where[Op.and] && Array.isArray(where[Op.and])) {
    where[Op.and].forEach(subCondition => {
      if (subCondition && typeof subCondition === 'object') {
        // 递归提取子条件（但跳过Op.or，因为关键字搜索会在后面单独处理）
        if (!subCondition[Op.or]) {
          const subConditions = buildWhereConditions(subCondition);
          conditions.push(...subConditions);
        }
      }
    });
  }
  
  return conditions;
}

const os = require('os');
const templatesPath = path.join(__dirname, '../config/searchTemplates.json');
// 已移除 NLP 自然语言解析

// 读取预设搜索模板
const getSearchTemplates = async (req, res) => {
  try {
    if (!fs.existsSync(templatesPath)) {
      return res.json({ templates: [] });
    }
    const raw = fs.readFileSync(templatesPath, 'utf-8');
    const data = JSON.parse(raw || '[]');
    return res.json({ templates: data });
  } catch (e) {
    return res.status(500).json({ message: req.t('log.searchTemplates.readFailed'), error: e.message });
  }
};

// 导入搜索模板（覆盖式）
const importSearchTemplates = async (req, res) => {
  try {
    const { templates } = req.body;
    if (!Array.isArray(templates)) {
      return res.status(400).json({ message: req.t('log.searchTemplates.invalidFormat') });
    }
    fs.writeFileSync(templatesPath, JSON.stringify(templates, null, 2), 'utf-8');
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ message: req.t('log.searchTemplates.importFailed'), error: e.message });
  }
};

// 已移除 NLP 相关接口

const UPLOAD_DIR = path.join(__dirname, '../../uploads/logs');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// 获取日志列表
const getLogs = async (req, res) => {
  try {
    let { page = 1, limit = 20, device_id, log_ids } = req.query;
    // 新增筛选：仅看自己 + 基于文件名前缀(YYYYMMDDHH)的时间筛选（年/月/日/小时 或 直接前缀 或 区间）+ 状态筛选 + 指定日志ID列表
    const { only_own, year, month, day, hour, time_prefix, time_range_start, time_range_end, status_filter } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    
    // 构建查询条件
    const where = {};
    
    // 优先支持通过 log_ids 直接查询指定的日志（用于批量分析页面）
    if (log_ids) {
      const ids = String(log_ids)
        .split(',')
        .map(id => parseInt(id.trim(), 10))
        .filter(n => Number.isInteger(n) && n > 0);
      if (ids.length > 0) {
        where.id = { [Op.in]: ids };
        // 当指定了 log_ids 时，不需要分页，直接返回所有匹配的日志
        page = 1;
        limit = ids.length; // 设置为 ID 数量，确保返回所有匹配的日志
      }
    }
    
    if (device_id) {
      where.device_id = device_id;
    }
    // 仅看自己：uploader_id 等于当前用户
    const truthy = (v) => {
      if (v === undefined || v === null) return false;
      const s = String(v).toLowerCase();
      return s === '1' || s === 'true' || s === 'yes' || s === 'on';
    };
    if (truthy(only_own) && req.user && req.user.id) {
      where.uploader_id = req.user.id;
    }
    
    // 状态筛选：'completed' 表示已完成（parsed, completed），'incomplete' 表示未完成（其他状态）
    if (status_filter && status_filter !== 'all') {
      if (status_filter === 'completed') {
        // 已完成状态：parsed 或 completed
        where.status = { [Op.in]: ['parsed', 'completed'] };
      } else if (status_filter === 'incomplete') {
        // 未完成状态：上传中，解密中，解密失败，解析失败，文件错误，处理失败等
        where.status = { 
          [Op.in]: [
            'uploading', 'queued', 'decrypting', 'parsing',
            'failed', 'decrypt_failed', 'parse_failed', 'file_error',
            'processing_failed', 'process_failed', 'handle_failed',
            'queue_failed', 'upload_failed', 'delete_failed'
          ]
        };
      }
    }
    // 时间筛选：基于生成列 file_time_token (YYYYMMDDhhmm)
    const toDigits = (value) => {
      if (value === undefined || value === null) return '';
      const str = String(value).trim();
      if (!/^\d+$/.test(str)) return '';
      return str.length > 12 ? str.slice(0, 12) : str;
    };

    const parseDigitsToValue = (digits, isEnd = false) => {
      if (!digits) return null;
      const len = digits.length;
      if (len < 4) return null;
      const get = (start, end) => {
        if (len < end) return null;
        return Number(digits.slice(start, end));
      };
      const parts = {
        year: Number(digits.slice(0, 4)),
        month: get(4, 6),
        day: get(6, 8),
        hour: get(8, 10),
        minute: get(10, 12)
      };
      if (Number.isNaN(parts.year)) return null;

      const fill = (value, fallback) => {
        if (value == null || Number.isNaN(value)) return fallback;
        return value;
      };

      const month = fill(parts.month, isEnd ? 12 : 0);
      const day = fill(parts.day, isEnd ? 31 : 0);
      const hour = fill(parts.hour, isEnd ? 23 : 0);
      const minute = fill(parts.minute, isEnd ? 59 : 0);

      return (parts.year * 100000000) +
        (month * 1000000) +
        (day * 10000) +
        (hour * 100) +
        minute;
    };

    const timeValueExpr = SequelizeLib.literal(`
      (COALESCE(file_year, 0) * 100000000) +
      (COALESCE(file_month, 0) * 1000000) +
      (COALESCE(file_day, 0) * 10000) +
      (COALESCE(file_hour, 0) * 100) +
      COALESCE(file_minute, 0)
    `);

    const addTokenRangeCondition = (startDigits, endDigits) => {
      const start = toDigits(startDigits);
      const end = toDigits(endDigits);
      if (!start || !end || start.length < 4 || end.length < 4) return;
      const startValue = parseDigitsToValue(start, false);
      const endValue = parseDigitsToValue(end, true);
      if (startValue == null || endValue == null || startValue > endValue) return;
      where[SequelizeLib.Op.and] = (where[SequelizeLib.Op.and] || []).concat([
        SequelizeLib.where(timeValueExpr, { [Op.between]: [startValue, endValue] })
      ]);
    };

    const rangeStartRaw = toDigits(time_range_start);
    const rangeEndRaw = toDigits(time_range_end);
    if (rangeStartRaw && rangeEndRaw) {
      addTokenRangeCondition(rangeStartRaw, rangeEndRaw);
    } else {
      const prefixCandidate = (() => {
        const tp = toDigits(time_prefix);
        if (tp) return tp;
        if (!year) return '';
        let digits = String(year).padStart(4, '0');
        if (month) digits += String(month).padStart(2, '0');
        if (day) digits += String(day).padStart(2, '0');
        if (hour) digits += String(hour).padStart(2, '0');
        return digits;
      })();
      if (prefixCandidate && prefixCandidate.length >= 4) {
        addTokenRangeCondition(prefixCandidate, prefixCandidate);
      }
    }
    
    // 权限控制：所有用户都可以看到所有日志，但删除权限在删除接口中单独控制
    // 普通用户、专家用户和管理员都可以查看所有日志
    // 删除权限在deleteLog函数中单独检查
    
    // 第一步：查询日志
    const { count: total, rows: logs } = await Log.findAndCountAll({
      where,
      offset: (page - 1) * limit,
      limit,
      order: [
        [timeValueExpr, 'DESC'],
        ['id', 'DESC']
      ]
    });

    // 第二步：获取所有相关的设备ID
    const deviceIds = [...new Set(logs.map(log => log.device_id).filter(id => id))];
    
    // 第三步：批量查询设备信息
    let deviceMap = {};
    if (deviceIds.length > 0) {
      try {
        const devices = await Device.findAll({
          where: { device_id: deviceIds },
          attributes: ['device_id', 'hospital', 'device_model']
        });
        
        // 创建设备ID到设备信息的映射
        devices.forEach(device => {
          deviceMap[device.device_id] = device;
        });
      } catch (deviceError) {
        console.warn('查询设备信息失败，将使用默认值:', deviceError.message);
        deviceMap = {};
      }
    }

    // 第四步：合并日志和设备信息
    const processedLogs = logs.map(log => {
      const logData = log.toJSON();
      const deviceInfo = deviceMap[logData.device_id];
      
      return {
        ...logData,
        hospital_name: deviceInfo?.hospital || null,
        device_name: deviceInfo?.device_model || req.t('log.unknownDevice')
      };
    });

    res.json({ logs: processedLogs, total });
  } catch (err) {
    console.error('获取日志列表失败:', err);
    console.error('错误堆栈:', err.stack);
    res.status(500).json({ message: req.t('log.listFailed'), error: err.message });
  }
};

const getLogTimeFilters = async (req, res) => {
  try {
    const { device_id } = req.query;
    if (!device_id) {
      return res.status(400).json({ success: false, message: 'device_id is required' });
    }

    const replacements = { deviceId: device_id };
    const query = `
      SELECT DISTINCT
        COALESCE(file_year, CASE WHEN original_name REGEXP '^[0-9]{10,12}_' THEN CAST(SUBSTRING(original_name, 1, 4) AS UNSIGNED) ELSE NULL END) AS year,
        COALESCE(file_month, CASE WHEN original_name REGEXP '^[0-9]{10,12}_' THEN CAST(SUBSTRING(original_name, 5, 2) AS UNSIGNED) ELSE NULL END) AS month,
        COALESCE(file_day, CASE WHEN original_name REGEXP '^[0-9]{10,12}_' THEN CAST(SUBSTRING(original_name, 7, 2) AS UNSIGNED) ELSE NULL END) AS day
      FROM logs
      WHERE device_id = :deviceId
        AND (
          file_year IS NOT NULL
          OR original_name REGEXP '^[0-9]{10,12}_'
        )
    `;

    const [rows] = await sequelize.query(query, { replacements });

    const yearsSet = new Set();
    const monthsMap = new Map();
    const daysMap = new Map();

    rows.forEach(({ year, month, day }) => {
      if (year == null) return;
      const yearStr = String(year).padStart(4, '0');
      yearsSet.add(yearStr);

      if (month != null) {
        const monthStr = String(month).padStart(2, '0');
        if (!monthsMap.has(yearStr)) monthsMap.set(yearStr, new Set());
        monthsMap.get(yearStr).add(monthStr);

        if (day != null) {
          const dayStr = String(day).padStart(2, '0');
          const dayKey = `${yearStr}-${monthStr}`;
          if (!daysMap.has(dayKey)) daysMap.set(dayKey, new Set());
          daysMap.get(dayKey).add(dayStr);
        }
      }
    });

    const years = Array.from(yearsSet).sort((a, b) => Number(b) - Number(a));
    const monthsByYear = {};
    monthsMap.forEach((set, year) => {
      monthsByYear[year] = Array.from(set).sort((a, b) => a.localeCompare(b));
    });
    const daysByYearMonth = {};
    daysMap.forEach((set, key) => {
      daysByYearMonth[key] = Array.from(set).sort((a, b) => a.localeCompare(b));
    });

    return res.json({
      success: true,
      data: {
        years,
        monthsByYear,
        daysByYearMonth
      }
    });
  } catch (error) {
    console.error('getLogTimeFilters error:', error);
    return res.status(500).json({ success: false, message: '获取日志时间筛选项失败', error: error.message });
  }
};

// 获取按设备分组的日志列表
const getLogsByDevice = async (req, res) => {
  try {
    let { page = 1, limit = 20, only_own, time_prefix, device_filter } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    
    // 构建查询条件
    const where = {};
    
    // 仅看自己：uploader_id 等于当前用户
    const truthy = (v) => {
      if (v === undefined || v === null) return false;
      const s = String(v).toLowerCase();
      return s === '1' || s === 'true' || s === 'yes' || s === 'on';
    };
    if (truthy(only_own) && req.user && req.user.id) {
      where.uploader_id = req.user.id;
    }
    
    // 时间前缀筛选
    const prefixFromParam = (p) => typeof p === 'string' ? p.trim() : (p ?? '').toString();
    const tp = prefixFromParam(time_prefix);
    if (tp && /^[0-9]{4}(?:[0-9]{2}){0,3}$/.test(tp)) {
      where.original_name = { [Op.like]: `${tp}%` };
    }
    
    // 获取所有日志并按设备分组
    const logs = await Log.findAll({
      where,
      order: [['upload_time', 'DESC']]
    });
    
    // 获取所有相关的设备ID
    const deviceIds = [...new Set(logs.map(log => log.device_id).filter(id => id))];
    
    // 批量查询设备信息
    let deviceMap = {};
    if (deviceIds.length > 0) {
      try {
        const devices = await Device.findAll({
          where: { device_id: deviceIds },
          attributes: ['device_id', 'hospital', 'device_model']
        });
        
        // 创建设备ID到设备信息的映射
        devices.forEach(device => {
          deviceMap[device.device_id] = device;
        });
      } catch (deviceError) {
        console.warn('查询设备信息失败，将使用默认值:', deviceError.message);
        deviceMap = {};
      }
    }
    
    // 按设备分组并计算统计信息
    const deviceGroups = {};
    logs.forEach(log => {
      const deviceId = log.device_id || '未知设备';
      if (!deviceGroups[deviceId]) {
        const deviceInfo = deviceMap[deviceId];
        deviceGroups[deviceId] = {
          device_id: deviceId,
          hospital_name: deviceInfo?.hospital || null,
          device_name: deviceInfo?.device_model || '未知设备',
          log_count: 0,
          latest_update_time: null,
          logs: []
        };
      }
      
      deviceGroups[deviceId].logs.push(log);
      deviceGroups[deviceId].log_count++;
      
      // 更新最新时间
      if (!deviceGroups[deviceId].latest_update_time || 
          new Date(log.upload_time) > new Date(deviceGroups[deviceId].latest_update_time)) {
        deviceGroups[deviceId].latest_update_time = log.upload_time;
      }
    });
    
    // 转换为数组并排序
    let deviceList = Object.values(deviceGroups).sort((a, b) => 
      new Date(b.latest_update_time) - new Date(a.latest_update_time)
    );
    
    // 应用设备筛选（前端筛选）
    if (device_filter && device_filter.trim()) {
      const filterValue = device_filter.toLowerCase().trim();
      deviceList = deviceList.filter(device => 
        device.device_id.toLowerCase().includes(filterValue)
      );
    }
    
    // 计算分页信息
    const total = deviceList.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    
    // 分页切片
    const paginatedDeviceList = deviceList.slice(startIndex, endIndex);
    
    res.json({ 
      device_groups: paginatedDeviceList,
      pagination: {
        current_page: page,
        page_size: limit,
        total: total,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1
      }
    });
  } catch (err) {
    res.status(500).json({ message: req.t('log.deviceGroups.getFailed'), error: err.message });
  }
};

// 上传日志
const uploadLog = async (req, res) => {
  try {
    const files = req.files; // 支持多文件
    if (!files || files.length === 0) {
      return res.status(400).json({ message: req.t('log.upload.noFile') });
    }

    // 总大小限制：200MB（与文档约定一致）
    const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
    const MAX_TOTAL = 200 * 1024 * 1024; // 200MB
    if (totalBytes > MAX_TOTAL) {
      // 清理已写入的临时文件
      try {
        for (const f of files) {
          if (f && f.path && fs.existsSync(f.path)) {
            fs.unlinkSync(f.path);
          }
        }
      } catch (cleanupErr) {
        console.warn('清理超限上传的临时文件失败:', cleanupErr.message);
      }
      return res.status(413).json({ message: req.t('log.upload.sizeExceeded') });
    }

    // 路由来源：默认用户上传；自动上传走历史队列
    const sourceHeader = (req.get('x-upload-source') || 'user-upload').toLowerCase();
    const source = sourceHeader === 'auto-upload' ? 'auto-upload' : 'user-upload';
    const clientId = req.get('x-client-id') || null;
    
    // 从请求头获取设备编号
    const deviceId = req.headers['x-device-id'] || '0000-00'; // 默认设备编号
    
    // 打印监控目标路径相关信息
    console.log('=== 日志上传监控信息 ===');
    console.log('上传来源:', source);
    console.log('客户端ID:', clientId);
    console.log('设备编号:', deviceId);
    console.log('上传文件数量:', files.length);
    console.log('文件列表:');
    files.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file.originalname} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
    });
    
    // 验证设备编号格式
    if (deviceId !== '0000-00' && !validateDeviceId(deviceId)) {
      return res.status(400).json({ message: req.t('log.upload.invalidDeviceIdFormat') });
    }
    
    const uploadedLogs = [];
    
    for (const file of files) {
      // 根据设备编号和日志时间自动获取解密密钥
    let decryptKey = null;
      
    if (deviceId !== '0000-00') {
      try {
          // 从文件名提取日志时间
          const logDate = extractTimeFromFileName(file.originalname);
          
          if (logDate) {
            console.log(`从文件名提取到日志时间: ${logDate.toISOString().split('T')[0]}`);
            // 使用多密钥管理服务获取密钥
            decryptKey = await getKeyForDeviceAndDate(deviceId, logDate);
          } else {
            console.log(`无法从文件名提取时间，使用当前日期查找密钥`);
            // 如果无法提取时间，使用当前日期
            decryptKey = await getKeyForDeviceAndDate(deviceId, new Date());
          }
          
          // 如果多密钥管理未找到，回退到 devices.device_key（向后兼容）
          if (!decryptKey) {
            console.log(`多密钥管理未找到密钥，尝试使用设备默认密钥...`);
        const device = await Device.findOne({ where: { device_id: deviceId } });
        if (device && device.device_key) {
          decryptKey = device.device_key;
              console.log(`✅ 使用设备 ${deviceId} 的默认密钥: ${decryptKey.substring(0, 8)}...`);
            }
        }
      } catch (error) {
        console.warn('获取设备密钥失败:', error.message);
      }
    } else {
      console.log('使用默认设备编号，跳过密钥查找');
    }
    
    // 如果无法自动获取密钥，尝试从请求头获取（向后兼容）
    if (!decryptKey) {
      decryptKey = req.headers['x-decrypt-key'];
    }
    
    if (!decryptKey) {
      return res.status(400).json({ message: req.t('log.upload.keyNotFound') });
    }
    
    // 验证密钥格式
    if (!validateKey(decryptKey)) {
      return res.status(400).json({ message: req.t('log.upload.invalidKeyFormat') });
    }
      let log;
      try {
        console.log(`\n--- 处理文件: ${file.originalname} ---`);
        console.log(`文件大小: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
        console.log(`设备编号: ${deviceId}`);
        console.log(`解密密钥: ${decryptKey ? decryptKey.substring(0, 8) + '...' : '未提供'}`);
        
        // 如果已存在相同 device_id + original_name 的日志，则视为重复上传
        // 逻辑：
        //  - 复用同一条 logs 记录（不新增行）
        //  - version 自增：表示新的上传版本
        //  - ClickHouse 在解析完成后按新版本号写入，并淘汰旧版本
        log = await Log.findOne({
          where: {
            device_id: deviceId || null,
            original_name: file.originalname
          }
        });

        if (log) {
          const currentVersion = Number.isInteger(log.version) ? log.version : 1;
          const newVersion = currentVersion + 1;

          // 覆盖：更新现有日志为上传中状态，并刷新关键元数据与版本号
          await log.update({
            filename: file.filename,
            size: file.size,
            status: 'uploading',
            upload_time: new Date(),
            uploader_id: req.user ? req.user.id : null,
            device_id: deviceId || null,
            key_id: decryptKey || null,
            version: newVersion
          });
        } else {
          // 新增：使用默认版本号 1
          log = await Log.create({
            filename: file.filename,
            original_name: file.originalname,
            size: file.size,
            status: 'uploading', // 初始状态为上传中
            upload_time: new Date(),
            uploader_id: req.user ? req.user.id : null,
            device_id: deviceId || null,
            key_id: decryptKey || null
          });
        }
        
        // 注意：密钥不再在上传时立即保存到设备表
        // 改为在解密成功后再保存，避免错误密钥污染设备表
        // logs表的key_id仍然保存，用于记录使用的密钥

        // 根据来源选择队列（user-upload -> realtime，auto-upload -> historical）
        const queue = queueManager.getQueueBySource(source);
        const priority = source === 'auto-upload' ? 1 : 10;

        console.log(`📤 将文件 ${file.originalname} 添加到${source === 'auto-upload' ? '历史' : '实时'}处理队列`);
        console.log(`队列优先级: ${priority}`);
        console.log(`客户端ID: ${clientId || '未提供'}`);

        const job = await queue.add('process-log', {
          filePath: file.path,
          originalName: file.originalname,
          decryptKey: decryptKey,
          deviceId: deviceId || null,
          uploaderId: req.user ? req.user.id : null,
          logId: log.id,
          source,
          clientId
        }, {
          priority,
          delay: 0,
          attempts: 1,
          backoff: {
            type: 'exponential',
            delay: 1000
          },
          removeOnComplete: true,
          removeOnFail: true
        });
        
        console.log(`✅ 文件 ${file.originalname} 已添加到队列，任务ID: ${job.id}`);
        
        uploadedLogs.push(log);
      } catch (error) {
        console.error(`处理文件 ${file.originalname} 失败:`, error);
        console.error('错误堆栈:', error.stack);
        
        // 如果日志记录已创建，更新状态为失败
        if (log && log.id) {
          try {
            await log.update({ status: 'failed' });
          } catch (updateError) {
            console.error('更新日志状态失败:', updateError);
          }
        }
        
        // 删除临时文件
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        throw new Error(`文件 ${file.originalname} 解密失败: ${error.message}`);
      }
    }
    
    console.log('\n=== 上传完成总结 ===');
    console.log(`✅ 成功上传 ${uploadedLogs.length} 个文件`);
    console.log(`📊 设备编号: ${deviceId}`);
    console.log(`🔑 解密密钥: 已为每个文件自动获取密钥`);
    console.log(`📤 上传来源: ${source}`);
    console.log(`🆔 客户端ID: ${clientId || '未提供'}`);
    console.log('========================\n');
    
    // 操作日志
    try {
      const { logOperation } = require('../utils/operationLogger');
      await logOperation({
        operation: '日志上传',
        description: `上传 ${uploadedLogs.length} 个日志文件`,
        user_id: req.user?.id,
        username: req.user?.username,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        details: {
          count: uploadedLogs.length,
          source,
          device_id: deviceId,
          filenames: uploadedLogs.map(l => l.original_name)
        }
      });
    } catch (_) {}

    res.json({ 
      message: req.t('log.upload.success', { count: uploadedLogs.length }), 
      logs: uploadedLogs,
      queued: true,
      device_id: deviceId // 添加设备编号，用于前端自动展开
    });
  } catch (err) {
    res.status(500).json({ message: req.t('log.upload.failed'), error: err.message });
  }
};

// 解析日志（写入 log_entries）
const parseLog = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await Log.findByPk(id);
    if (!log) return res.status(404).json({ message: req.t('log.parse.notFound') });
    
    // 权限控制：普通用户只能解析自己的日志，专家用户和管理员可以解析任何日志
    const userRole = req.user.role_id;
    if (userRole === 3 && log.uploader_id !== req.user.id) { // 普通用户且不是自己的日志
      return res.status(403).json({ message: req.t('log.parse.permissionDenied') });
    }
    
    const filePath = path.join(UPLOAD_DIR, log.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: req.t('log.parse.fileNotFound') });
    
    // 读取文件内容
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // 使用数据库中保存的密钥进行解密
    const key = log.key_id;
    if (!key) {
      return res.status(400).json({ message: req.t('log.parse.keyNotFound') });
    }
    
    // 预加载故障码表到缓存
    console.log('🔄 预加载故障码表...');
    await errorCodeCache.loadAllErrorCodes();
    console.log('✅ 故障码表预加载完成');
    
    // 解密日志内容
    const decryptedEntries = decryptLogContent(content, key);
    
    // 统一：预热解析依赖
    await ensureCacheReady();

    // 转换为数据库格式并查询正确的释义（统一解析逻辑）
    const entries = [];
    console.log(`🚀 开始处理 ${decryptedEntries.length} 个解密后的日志条目`);
    
    let rowIndex = 1;
    const currentVersion = log.version || 1;
    
    for (const entry of decryptedEntries) {
      // 根据需求，通过解密后的故障码首位+('0X'+故障码后4位)去匹配error_codes表
      const errorCodeStr = entry.error_code;
      let subsystem = '';
      let code = '';
      
      if (errorCodeStr && errorCodeStr.length >= 5) {
        subsystem = errorCodeStr.charAt(0).toUpperCase(); // 首位，统一转换为大写
        if (!/^[1-9A-F]$/.test(subsystem)) { subsystem = ''; }
        code = '0X' + errorCodeStr.slice(-4).toUpperCase(); // '0X' + 后4位，统一转换为大写
      }
      // 使用缓存查询error_codes表获取正确的释义
      let explanation = entry.explanation; // 默认使用原始释义（模板选择由统一服务完成）
      
      // 统一解析
      const { explanation: parsedExplanation } = renderEntryExplanation({
        error_code: entry.error_code,
        param1: entry.param1,
        param2: entry.param2,
        param3: entry.param3,
        param4: entry.param4,
        timestamp: entry.timestamp,
        explanation
      });
      
      entries.push({
        log_id: log.id,
        timestamp: dayjs(entry.timestamp).isValid() ? dayjs(entry.timestamp).format('YYYY-MM-DD HH:mm:ss') : dayjs().format('YYYY-MM-DD HH:mm:ss'),
        error_code: entry.error_code || '',
        param1: entry.param1 || '',
        param2: entry.param2 || '',
        param3: entry.param3 || '',
        param4: entry.param4 || '',
        explanation: parsedExplanation || '',
        subsystem_char: subsystem || '',
        code4: code || '',
        version: currentVersion,
        row_index: rowIndex++
      });
    }
    
    console.log('解析日志释义完成，示例:', entries[0]?.explanation);
    
    // 插入 ClickHouse
    try {
      const batchSize = 20000;
      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);
        await getClickHouseClient().insert({
          table: 'log_entries',
          values: batch,
          format: 'JSONEachRow'
        });
        console.log(`✅ ClickHouse 批次插入完成: ${i + batch.length}/${entries.length}`);
      }
      console.log('✅ 数据库插入完成');
    } catch (insertError) {
      console.error('❌ 数据库插入失败:', insertError.message);
      throw new Error(`数据库插入失败: ${insertError.message}`);
    }
    
    // 更新日志状态
    const oldStatus = log.status;
    log.status = 'parsed';
    log.parse_time = new Date();
    await log.save();
    
    // 推送状态变化到 WebSocket
    pushLogStatusChange(log.id, oldStatus, 'parsed');
    
    // 操作日志
    try {
      const { logOperation } = require('../utils/operationLogger');
      await logOperation({
        operation: '日志解析',
        description: `解析日志: ${log.original_name}`,
        user_id: req.user?.id,
        username: req.user?.username,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        details: { log_id: log.id, entries: entries.length, device_id: log.device_id }
      });
    } catch (_) {}

    res.json({ message: req.t('log.parse.success'), count: entries.length });
  } catch (err) {
    console.error('解析日志失败:', err);
    res.status(500).json({ message: req.t('log.parse.failed'), error: err.message });
  }
};

// 获取队列状态
const getQueueStatus = async (req, res) => {
  try {
    const waiting = await logProcessingQueue.getWaiting();
    const active = await logProcessingQueue.getActive();
    const completed = await logProcessingQueue.getCompleted();
    const failed = await logProcessingQueue.getFailed();
    
    // 获取队列统计信息
    const queueStats = await logProcessingQueue.getJobCounts();
    
    res.json({
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      stats: queueStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('获取队列状态失败:', error);
    res.status(500).json({ 
      message: req.t('log.queue.statusFailed'), 
      error: error.message 
    });
  }
};

// 获取日志明细
const getLogEntries = async (req, res) => {
  const startTime = Date.now();
  const logId = req.params.id;
  
  console.log(`[getLogEntries] ========== 开始处理请求 ==========`);
  console.log(`[getLogEntries] log_id: ${logId}`);
  console.log(`[getLogEntries] 用户信息: ${req.user ? `id=${req.user.id}, role_id=${req.user.role_id}` : '未登录'}`);
  
  try {
    const { id } = req.params;
    
    // 先检查日志是否存在并验证权限
    console.log(`[getLogEntries] 查询日志记录: id=${id}`);
    const log = await Log.findByPk(id);
    
    if (!log) {
      console.log(`[getLogEntries] 日志不存在: id=${id}`);
      return res.status(404).json({ message: req.t('log.parse.notFound') });
    }
    
    console.log(`[getLogEntries] 日志记录找到: id=${log.id}, original_name=${log.original_name}, device_id=${log.device_id}, status=${log.status}, version=${log.version || 1}, upload_time=${log.upload_time}`);
    
    // 权限控制：普通用户只能查看自己的日志明细
    if (req.user && req.user.role_id === 3) {
      if (log.uploader_id !== req.user.id) {
        console.log(`[getLogEntries] 权限不足: log.uploader_id=${log.uploader_id}, user.id=${req.user.id}`);
        return res.status(403).json({ message: req.t('common.unauthorized') });
      }
    }
    
    const currentVersion = log.version || 1;
    console.log(`[getLogEntries] 当前版本: ${currentVersion}`);
    
    console.log(`[getLogEntries] 开始查询 ClickHouse: log_id=${id}, version=${currentVersion}`);
    const queryStartTime = Date.now();
    
    const result = await getClickHouseClient().query({
      query: `
        SELECT * 
        FROM log_entries 
        WHERE log_id = {log_id: UInt32} AND version = {version: UInt32}
        ORDER BY row_index ASC
      `,
      query_params: {
        log_id: parseInt(id),
        version: currentVersion
      },
      format: 'JSONEachRow'
    });
    
    const queryTime = Date.now() - queryStartTime;
    console.log(`[getLogEntries] ClickHouse 查询完成，耗时: ${queryTime}ms`);
    
    const parseStartTime = Date.now();
    const entries = await result.json();
    const parseTime = Date.now() - parseStartTime;
    const totalTime = Date.now() - startTime;
    
    console.log(`[getLogEntries] 查询成功: 返回条目数=${entries?.length || 0}, 解析耗时=${parseTime}ms, 总耗时=${totalTime}ms`);
    console.log(`[getLogEntries] ========== 请求处理完成 ==========`);
    
    res.json({ entries });
  } catch (err) {
    const totalTime = Date.now() - startTime;
    console.error(`[getLogEntries] 获取日志明细失败: log_id=${logId}, 耗时=${totalTime}ms`);
    console.error('[getLogEntries] 错误详情:', {
      message: err.message,
      stack: err.stack,
      code: err.code,
      type: err.type,
      name: err.name
    });
    res.status(500).json({ message: req.t('log.listFailed'), error: err.message });
  }
};

// 批量获取日志明细（用于分析功能）
const getBatchLogEntries = async (req, res) => {
  try {
    const { 
      log_ids, 
      search, 
      error_code, 
      start_time, 
      end_time, 
      page = 1, 
      limit = 100,
      filters, // 高级筛选条件（JSON字符串或对象）
      analysis_category_ids // 预置维度：分析分类ID数组（逗号分隔或数组）
    } = req.query;

    // [MIGRATION] ClickHouse 迁移中，暂停 MySQL 批量查询
      return res.json({
        entries: [],
        total: 0,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: 0,
      migration_notice: 'System is migrating to ClickHouse. Analysis features are temporarily unavailable.'
    });
    
    // 仅在首次加载或未选择时间范围时，返回建议的时间范围（min/max）
    const shouldIncludeTimeSuggestion = !start_time && !end_time;
    
    // 生成缓存键
    const cacheKey = cacheManager.generateKey('batch_search', {
      userId: req.user?.id || 'anonymous',
      log_ids,
      search,
      error_code,
      start_time,
      end_time,
      page,
      limit,
      analysis_category_ids,  // ✅ 添加分析等级参数到缓存键
      filters: filters ? JSON.stringify(filters) : ''
    });
    
    // 尝试从缓存获取结果
    const cachedResult = await cacheManager.get(cacheKey);
    if (cachedResult) {
      console.log(`[缓存命中] 批量搜索: ${cacheKey}`);
      return res.json(cachedResult);
    }
    
    console.log(`[缓存未命中] 执行批量搜索: ${cacheKey}`);
    
    // 构建查询条件
    const where = {};
    
    // 日志ID筛选
    if (log_ids) {
      const ids = log_ids.split(',').map(id => parseInt(id.trim()));
      where.log_id = { [Op.in]: ids };
    }
    
    // 故障码筛选
    if (error_code) {
      where.error_code = { [Op.like]: `%${error_code}%` };
    }
    
    // 时间范围筛选
    if (start_time || end_time) {
      where.timestamp = {};
      if (start_time) {
        where.timestamp[Op.gte] = new Date(start_time);
      }
      if (end_time) {
        where.timestamp[Op.lte] = new Date(end_time);
      }
    }
    
    // 简单搜索优化：
    // 1) 若关键词为 4-6位十六进制（如 571e），优先按规范码等值过滤：code4 = '0X571E'（避免 explanation LIKE 全表扫描）
    // 2) 否则：error_code LIKE；explanation 仅在无 FULLTEXT 时回退为 LIKE，与 error_code 组成 OR
    let simpleSearchActive = false;
    if (search && String(search).trim().length > 0) {
      simpleSearchActive = true;
      const raw = String(search).trim();
      const hexMatch = /^[0-9a-fA-F]{4,6}$/.test(raw);
      if (hexMatch) {
        const normalized = '0X' + raw.slice(-4).toUpperCase();
        // 等值过滤（可命中规范化组合索引）
        where.code4 = normalized;
      } else {
        const s = raw;
        const ecLike = { error_code: { [Op.like]: `%${s}%` } };
        const conds = [ecLike];
        try {
          const ftOk = await hasExplanationFulltextIndex();
          if (ftOk) {
            const ftExpr = `MATCH (explanation) AGAINST (${sequelize.escape('+' + s.replace(/\s+/g, ' +'))} IN BOOLEAN MODE)`;
            conds.unshift(SequelizeLib.literal(ftExpr));
          } else {
            // 回退：与 error_code LIKE 组成 OR，但依赖时间窗/日志ID限制来收敛扫描
            conds.unshift({ explanation: { [Op.like]: `%${s}%` } });
          }
        } catch (_) {
          conds.unshift({ explanation: { [Op.like]: `%${s}%` } });
        }
        const keywordOr = { [Op.or]: conds };
      if (where[Op.and]) {
        where[Op.and].push(keywordOr);
      } else {
        const baseConds = [];
          Object.keys(where).forEach(k => { if (k !== Op.and && k !== Op.or) { baseConds.push({ [k]: where[k] }); delete where[k]; } });
        where[Op.and] = baseConds.length > 0 ? baseConds.concat([keywordOr]) : [keywordOr];
        }
      }
    }

    // 分析分类过滤（预置维度，不进入高级搜索表达式）
    // 不再使用 EXISTS，统一后续用"允许码集合 IN (subsystem_char, code4)"路径
    let analysisFilterActive = false;
    if (analysis_category_ids) {
      const ids = Array.isArray(analysis_category_ids)
        ? analysis_category_ids.map(v => parseInt(String(v))).filter(n => Number.isInteger(n))
        : String(analysis_category_ids)
            .split(',')
            .map(s => parseInt(s.trim()))
            .filter(n => Number.isInteger(n));

      if (ids.length > 0) {
        if (!getBatchLogEntries._catCache) getBatchLogEntries._catCache = { count: null, at: 0 };
        const now = Date.now();
        const needRefresh = !getBatchLogEntries._catCache.count || (now - getBatchLogEntries._catCache.at > 5 * 60 * 1000);
        if (needRefresh) {
          const activeCount = await AnalysisCategory.count({ where: { is_active: true } });
          getBatchLogEntries._catCache = { count: activeCount, at: now };
        }
        const allCount = getBatchLogEntries._catCache.count || 0;
        if (ids.length < allCount) {
          analysisFilterActive = true;
          // 不在这里追加任何 SQL 片段，统一在查询阶段下推为 IN 子句
        }
      }
    }

    // 高级筛选：解析 filters
    // 允许的字段与操作符白名单
    const allowedFields = new Set(['timestamp', 'error_code', 'param1', 'param2', 'param3', 'param4', 'explanation']);
    let firstOccurrenceRequested = false;
    const buildCondition = (field, operator, value) => {
      // 保护：字段白名单
      if (!allowedFields.has(field)) return null;

      // 针对参数数值比较，使用 CAST
      const isNumericParam = ['param1', 'param2', 'param3', 'param4'].includes(field);

      const buildOpValue = (sequelizeOperator, val) => {
        if (isNumericParam) {
          const castCol = SequelizeLib.cast(SequelizeLib.col(field), 'DECIMAL(18,6)');
          // IN/NOT IN 需要确保是数组形式 IN (...)
          if (sequelizeOperator === Op.in || sequelizeOperator === Op.notIn) {
            const arr = Array.isArray(val) ? val : [val];
            const nums = arr.map(v => Number(v)).filter(v => !Number.isNaN(v));
            if (nums.length === 0) return null;
            return SequelizeLib.where(castCol, { [sequelizeOperator]: nums });
          }
          // BETWEEN/NOT BETWEEN 需要两个数值
          if (sequelizeOperator === Op.between || sequelizeOperator === Op.notBetween) {
            if (!Array.isArray(val) || val.length !== 2) return null;
            const a = Number(val[0]);
            const b = Number(val[1]);
            if (Number.isNaN(a) || Number.isNaN(b)) return null;
            return SequelizeLib.where(castCol, sequelizeOperator, [a, b]);
          }
          // 其他比较运算符，单值数值
          const n = Number(val);
          if (Number.isNaN(n)) return null;
          return SequelizeLib.where(castCol, sequelizeOperator, n);
        }
        if (field === 'timestamp' && (sequelizeOperator === Op.between || sequelizeOperator === Op.gte || sequelizeOperator === Op.lte || sequelizeOperator === Op.gt || sequelizeOperator === Op.lt || sequelizeOperator === Op.eq || sequelizeOperator === Op.ne)) {
          const toDate = (d) => {
            if (d instanceof Date) return d;
            if (typeof d === 'string' || typeof d === 'number') return new Date(d);
            return null;
          };
          
          if (sequelizeOperator === Op.between) {
            if (!Array.isArray(val) || val.length !== 2) return null;
            const startDate = toDate(val[0]);
            const endDate = toDate(val[1]);
            if (!startDate || !endDate) return null;
            return { [field]: { [Op.between]: [startDate, endDate] } };
          } else {
            const date = toDate(val);
            if (!date) return null;
            return { [field]: { [sequelizeOperator]: date } };
          }
        }
        if (sequelizeOperator === Op.regexp) {
          // 正则长度限制
          if (typeof val !== 'string' || val.length > 200) return null;
          return { [field]: { [Op.regexp]: val } };
        }
        if (sequelizeOperator === Op.like) {
          return { [field]: { [Op.like]: `%${val}%` } };
        }
        if (sequelizeOperator === Op.in || sequelizeOperator === Op.notIn) {
          const arr = Array.isArray(val) ? val : String(val).split(',').map(s => s.trim()).filter(Boolean);
          return { [field]: { [sequelizeOperator]: arr } };
        }
        if (sequelizeOperator === Op.between || sequelizeOperator === Op.notBetween) {
          if (!Array.isArray(val) || val.length !== 2) return null;
          if (isNumericParam) {
            const a = Number(val[0]);
            const b = Number(val[1]);
            if (Number.isNaN(a) || Number.isNaN(b)) return null;
            return SequelizeLib.where(
              SequelizeLib.cast(SequelizeLib.col(field), 'DECIMAL(18,6)'),
              sequelizeOperator,
              [a, b]
            );
          }
          return { [field]: { [sequelizeOperator]: val } };
        }
        // 其他比较运算符
        if (isNumericParam) {
          const n = Number(val);
          if (Number.isNaN(n)) return null;
          return SequelizeLib.where(SequelizeLib.cast(SequelizeLib.col(field), 'DECIMAL(18,6)'), sequelizeOperator, n);
        }
        return { [field]: { [sequelizeOperator]: val } };
      };

      switch ((operator || '').toLowerCase()) {
        case 'firstof':
          // 特殊标志：请求每个 (log_id, error_code) 的首次出现。
          // 若指定了 error_code 的其他条件，会与之共同作用。
          firstOccurrenceRequested = true;
          return null;
        case '=': return buildOpValue(Op.eq, value);
        case '!=':
        case '<>': return buildOpValue(Op.ne, value);
        case '>': return buildOpValue(Op.gt, value);
        case '>=': return buildOpValue(Op.gte, value);
        case '<': return buildOpValue(Op.lt, value);
        case '<=': return buildOpValue(Op.lte, value);
        case 'between': return buildOpValue(Op.between, value);
        case 'notbetween': return isNumericParam ? null : buildOpValue(Op.notBetween, value);
        case 'in': return isNumericParam ? null : buildOpValue(Op.in, value);
        case 'notin': return isNumericParam ? null : buildOpValue(Op.notIn, value);
        case 'like': return (isNumericParam || field === 'explanation') ? null : buildOpValue(Op.like, value);
        case 'contains': return field === 'explanation' ? buildOpValue(Op.like, value) : (isNumericParam ? null : buildOpValue(Op.like, value));
        case 'notcontains': return (isNumericParam || field === 'explanation') ? null : { [field]: { [Op.notLike]: `%${value}%` } };
        case 'startswith': return (isNumericParam || field === 'explanation') ? null : { [field]: { [Op.like]: `${value}%` } };
        case 'endswith': return (isNumericParam || field === 'explanation') ? null : { [field]: { [Op.like]: `%${value}` } };
        case 'regex': return (isNumericParam || field === 'explanation') ? null : buildOpValue(Op.regexp, value);
        default: return null;
      }
    };

    const normalizeFilters = (raw) => {
      if (!raw) return null;
      let parsed = raw;
      if (typeof raw === 'string') {
        try { parsed = JSON.parse(raw); } catch (e) { return null; }
      }
      return parsed;
    };

    const advancedFilters = normalizeFilters(filters);

    // 判断高级筛选中是否包含昂贵条件（explanation 文本匹配、正则、参数数值比较等）
    const isExpensiveNode = (node) => {
      if (!node) return false;
      if (Array.isArray(node)) return node.some(isExpensiveNode);
      if (node.field && node.operator) {
        const f = String(node.field).toLowerCase();
        const op = String(node.operator).toLowerCase();
        // explanation 仅保留 contains，且下推到数据库；其他解释类操作不允许
        if (f === 'explanation') return op !== 'contains';
        // 参数字段仅在正则时视为昂贵，其余操作下推到数据库
        if (['param1','param2','param3','param4'].includes(f)) return op === 'regex';
        return false;
      }
      if (node.conditions && (node.logic === 'AND' || node.logic === 'OR')) {
        return node.conditions.some(isExpensiveNode);
      }
      return false;
    };

    // 递归构建 Sequelize 条件，完整支持嵌套(AND/OR)
    const buildFromNode = (node) => {
      if (!node) return null;
      if (Array.isArray(node)) {
        const parts = node.map(n => buildFromNode(n)).filter(Boolean);
        if (parts.length === 0) return null;
        // 默认用 AND 连接数组节点
        return { [Op.and]: parts };
      }
      if (node.field && node.operator) {
        return buildCondition(node.field, node.operator, node.value);
      }
      if (node.conditions && (node.logic === 'AND' || node.logic === 'OR')) {
        const childConds = node.conditions.map(child => buildFromNode(child)).filter(Boolean);
        if (childConds.length === 0) return null;
        return node.logic === 'OR' ? { [Op.or]: childConds } : { [Op.and]: childConds };
      }
      return null;
    };

    const advancedWhere = advancedFilters ? buildFromNode(advancedFilters) : null;
    const expensiveAdvanced = advancedFilters ? isExpensiveNode(advancedFilters) : false;
    let postFilterAdvanced = null;
    if (advancedWhere && !expensiveAdvanced) {
      // 与其他顶层条件（时间/搜索/日志ID）按 AND 组合（可下推到数据库）
      if (where[Op.and]) {
        where[Op.and].push(advancedWhere);
      } else {
        const baseConds = [];
        Object.keys(where).forEach(k => {
          if (k !== Op.and && k !== Op.or) {
            baseConds.push({ [k]: where[k] });
            delete where[k];
          }
        });
        where[Op.and] = baseConds.length > 0 ? baseConds.concat([advancedWhere]) : [advancedWhere];
        }
    } else if (advancedFilters && expensiveAdvanced) {
      // 昂贵条件在应用层过滤
      postFilterAdvanced = advancedFilters;
    }
    
    // 权限控制：普通用户只能查看自己的日志明细
    if (req.user && req.user.role_id) {
      const userRole = req.user.role_id;
      if (userRole === 3) { // 普通用户
        // 需要先获取用户自己的日志ID列表
        const userLogs = await Log.findAll({
          where: { uploader_id: req.user.id },
          attributes: ['id']
        });
        const userLogIds = userLogs.map(log => log.id);
        
        if (where.log_id) {
          // 如果已经指定了log_ids，需要取交集
          const requestedIds = Array.isArray(where.log_id[Op.in]) 
            ? where.log_id[Op.in] 
            : [where.log_id[Op.in]];
          const allowedIds = requestedIds.filter(id => userLogIds.includes(id));
          where.log_id = { [Op.in]: allowedIds };
        } else {
          where.log_id = { [Op.in]: userLogIds };
        }
      }
      // 管理员用户（role_id = 1）和专家用户（role_id = 2）可以查看所有日志，无需额外限制
    }
    
    // 若未传时间范围且有日志ID，尝试基于文件名推导时间窗口（YYYYMMDDhh_log.medbot）
    // 注意：文件名时间为本地时间(UTC+8)，数据库存储为UTC时间，需要转换
    let derivedMinTs = null;
    let derivedMaxTs = null;
    if (shouldIncludeTimeSuggestion && log_ids && !where.timestamp) {
      try {
        const idList = log_ids.split(',').map(id => parseInt(id.trim())).filter(n => Number.isInteger(n));
        if (idList.length > 0) {
          const [rows] = await sequelize.query(
            `SELECT 
               MIN(STR_TO_DATE(SUBSTRING(original_name,1,10), '%Y%m%d%H')) AS min_h,
               MAX(STR_TO_DATE(SUBSTRING(original_name,1,10), '%Y%m%d%H')) AS max_h
             FROM logs 
             WHERE id IN (:ids) AND original_name REGEXP '^[0-9]{10}'`,
            { replacements: { ids: idList } }
          );
          if (rows && rows.length > 0) {
            const r = rows[0];
            if (r.min_h) {
              // 文件名时间为本地时间(UTC+8)，需要转为UTC时间查询
              // 单个日志查看时前后各扩1小时，批量查看时紧贴文件名小时
              const localMinDate = new Date(r.min_h);
              localMinDate.setHours(localMinDate.getHours() - (idList.length === 1 ? 1 : 0));
              // 转为UTC时间：减8小时
              derivedMinTs = new Date(localMinDate.getTime() - 8 * 60 * 60 * 1000);
            }
            if (r.max_h) {
              const localMaxDate = new Date(r.max_h);
              localMaxDate.setHours(localMaxDate.getHours() + (idList.length === 1 ? 2 : 1));
              // 转为UTC时间：减8小时
              derivedMaxTs = new Date(localMaxDate.getTime() - 8 * 60 * 60 * 1000);
            }
          }
        }
      } catch (e) {
        console.warn('[时间范围推导] 基于日志文件名推导失败:', e.message);
      }
      if (derivedMinTs && derivedMaxTs) {
        console.log(`[时间范围推导] 本地时间窗口转为UTC: ${derivedMinTs.toISOString()} ~ ${derivedMaxTs.toISOString()}`);
        where.timestamp = { [Op.gte]: derivedMinTs, [Op.lte]: derivedMaxTs };
      }
    }
    
    // 分页参数
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 100;
    const offset = (pageNum - 1) * limitNum;
    
    // 优化查询：只选择必要的字段
    const attributes = [
      'id', 'log_id', 'timestamp', 'error_code', 
      'param1', 'param2', 'param3', 'param4', 'explanation'
    ];
    
    if (firstOccurrenceRequested) {
      console.log('[NLP] firstof enabled: fetching all matched entries for first-occurrence reduction');
      // 为保证首次过滤正确，先取全量匹配（不分页），再按 (log_id, error_code) 取最早一条
      const all = await LogEntry.findAll({
        where,
        attributes,
        order: [['timestamp', 'ASC']],
        include: [{
          model: Log,
          as: 'Log',
          attributes: ['original_name', 'device_id', 'uploader_id', 'upload_time']
        }]
      });
      console.log(`[NLP] firstof total matched before reduce: ${all.length}`);
      const seen = new Set();
      const reduced = [];
      for (const e of all) {
        const key = `${e.log_id}::${e.error_code}`;
        if (!seen.has(key)) {
          seen.add(key);
          reduced.push(e);
        }
      }
      console.log(`[NLP] firstof after reduce: ${reduced.length}`);
      const total = reduced.length;
      const start = offset;
      const end = offset + limitNum;
      const entries = reduced.slice(start, end);
      // 计算总体时间范围（基于 reduced）
      let minTimestamp = null;
      let maxTimestamp = null;
      if (reduced.length > 0) {
        const ms = reduced.map(e => new Date(e.timestamp).getTime()).filter(n => !Number.isNaN(n));
        if (ms.length > 0) {
          minTimestamp = new Date(Math.min(...ms));
          maxTimestamp = new Date(Math.max(...ms));
        }
      }
      return res.json({
        entries,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
        minTimestamp: shouldIncludeTimeSuggestion ? minTimestamp : null,
        maxTimestamp: shouldIncludeTimeSuggestion ? maxTimestamp : null
      });
    } else {
      // 优化查询：并行化 ID/COUNT/MINMAX
      console.log(`[查询执行] 开始执行数据库查询，条件:`, JSON.stringify(where, null, 2));
      console.log(`[查询优化] 两段式查询 + 并行计数/聚合`);
      const overallStart = Date.now();

      const baseOrder = [['timestamp', 'ASC'], ['id', 'ASC']];
      
      // 修复：更可靠的 log_id 检测（支持数组递归）
      const detectHasLogIdFilter = (node) => {
        if (!node) return false;
        if (typeof node !== 'object') return false;
        
        // 检查数组
        if (Array.isArray(node)) {
          return node.some(item => detectHasLogIdFilter(item));
        }
        
        // 检查顶层是否有 log_id
        if (Object.prototype.hasOwnProperty.call(node, 'log_id')) return true;
        
        // 递归检查所有属性
        for (const key of Object.keys(node)) {
          if (detectHasLogIdFilter(node[key])) return true;
        }
        
        return false;
      };
      
      // 双重保险：优先使用查询参数判断，回退到对象检测
      const hasLogIdParam = !!(log_ids && String(log_ids).trim().length > 0);
      const hasLogId = hasLogIdParam || detectHasLogIdFilter(where);
      
      if (hasLogIdParam && !detectHasLogIdFilter(where)) {
        console.warn('[索引选择] 参数有 log_ids 但 where 对象检测失败，已自动修正');
      }
      
      const hasAdvancedFilters = !!(advancedFilters && Object.keys(advancedFilters).length > 0);
      
      // 始终为 ID 阶段强制时间排序索引，确保按时间顺序早停
      const idIndexHints = hasLogId
        ? [{ type: 'FORCE', values: ['idx_log_entries_logid_ts_id'] }]
        : [{ type: 'FORCE', values: ['idx_log_entries_ts_id'] }];
      
      // 调试日志：显示索引选择
      console.log(`[索引选择] hasLogIdParam=${hasLogIdParam}, hasLogId=${hasLogId}, 使用索引: ${hasLogId ? 'idx_log_entries_logid_ts_id' : 'idx_log_entries_ts_id'}`);
      // COUNT/聚合在启用分类过滤且走 JOIN 路径时使用规范化组合索引，其余交由优化器或沿用时间索引
      const countAggIndexHints = analysisFilterActive
        ? (hasLogId
            ? [{ type: 'FORCE', values: ['idx_log_entries_logid_ts_norm'] }]
            : [{ type: 'FORCE', values: ['idx_log_entries_ts_norm'] }]
          )
        : idIndexHints;

      let idPhaseTime = 0, detailsPhaseTime = 0, countPhaseTime = 0, aggPhaseTime = 0;
      let ids = [];
      let minTimestamp = null; let maxTimestamp = null; let total = 0;

      if (analysisFilterActive && !hasAdvancedFilters) {
        // ✅ 优化：使用 JOIN 替代复杂 OR 条件（性能提升 10-20 倍）
        const catIds = Array.isArray(analysis_category_ids)
          ? analysis_category_ids.map(v => parseInt(String(v))).filter(Number.isInteger)
          : String(analysis_category_ids).split(',').map(s => parseInt(s.trim())).filter(Number.isInteger);

        console.log(`[分类过滤优化] 启用 JOIN 方式，分类ID: ${catIds.join(',')}`);
        
        // 获取 JOIN 配置
        const joinInfo = await buildCategoryFilterJoin(catIds);
        
        // ✅ 构建基础WHERE条件（log_id + timestamp + error_code）
        const baseConditions = buildWhereConditions(where);
        
        // ⚠️ 关键字搜索条件单独处理（避免重复添加）
        let searchCondition = null;
        if (search && String(search).trim().length > 0) {
          const raw = String(search).trim();
          const hexMatch = /^[0-9a-fA-F]{4,6}$/.test(raw);
          if (!hexMatch) {
            // ✅ 优化：使用全文索引加速关键词搜索
            try {
              const ftOk = await hasExplanationFulltextIndex();
              if (ftOk) {
                // 使用全文索引（BOOLEAN模式支持中文ngram分词）
                const keyword = raw.replace(/\s+/g, ' +');
                searchCondition = `(MATCH(log_entries.explanation) AGAINST(${sequelize.escape('+' + keyword)} IN BOOLEAN MODE) OR log_entries.error_code LIKE ${sequelize.escape('%' + raw + '%')})`;
                console.log(`[全文索引] 使用FULLTEXT索引搜索关键字: ${raw}`);
              } else {
                // 回退到LIKE（如果全文索引不存在）
                searchCondition = `(log_entries.explanation LIKE ${sequelize.escape('%' + raw + '%')} OR log_entries.error_code LIKE ${sequelize.escape('%' + raw + '%')})`;
                console.warn(`[性能警告] 全文索引不存在，使用LIKE查询可能较慢`);
              }
            } catch (ftError) {
              // 检测失败时回退到LIKE
              searchCondition = `(log_entries.explanation LIKE ${sequelize.escape('%' + raw + '%')} OR log_entries.error_code LIKE ${sequelize.escape('%' + raw + '%')})`;
              console.warn(`[全文索引检测失败] 回退到LIKE查询:`, ftError.message);
            }
          }
        }
        
        // ✅ 优化WHERE顺序：log_id/timestamp在前（利用索引），关键字搜索在后
        const allConditions = [...baseConditions];
        if (searchCondition) {
          allConditions.push(searchCondition);
        }
        
        const whereClause = allConditions.length > 0 ? `WHERE ${allConditions.join(' AND ')}` : '';
        
        console.log(`[WHERE条件] log_id/timestamp: ${baseConditions.length}, 关键字: ${searchCondition ? 1 : 0}`);
        
        // 阶段一：使用原生 SQL 查询 ID（带 JOIN 或 EXISTS）
      const idPhaseStart = Date.now();
        
        // 优化策略：使用 EXISTS 子查询代替 JOIN，避免笛卡尔积，并添加索引提示
        const hasLogIdParam = !!(log_ids && String(log_ids).trim().length > 0);
        const forceIndex = hasLogIdParam ? 'FORCE INDEX (idx_log_entries_logid_ts_id)' : 'FORCE INDEX (idx_log_entries_ts_id)';
        
        let idQuery;
        if (joinInfo.useJoin) {
          // 使用 EXISTS 子查询代替 INNER JOIN，性能更好
          const categoryIdList = analysis_category_ids.split(',').map(id => sequelize.escape(id)).join(',');
          idQuery = `
          SELECT log_entries.id, log_entries.timestamp
          FROM log_entries ${forceIndex}
          ${whereClause}
            AND EXISTS (
              SELECT 1 FROM code_category_map ccm
              WHERE ccm.subsystem_char = log_entries.subsystem_char
                AND ccm.code4 = log_entries.code4
                AND ccm.analysis_category_id IN (${categoryIdList})
            )
          ORDER BY log_entries.timestamp ASC, log_entries.id ASC
          LIMIT ${limitNum} OFFSET ${offset}
        `;
        } else {
          // 无分类过滤，直接查询
          idQuery = `
          SELECT log_entries.id, log_entries.timestamp
          FROM log_entries ${forceIndex}
          ${whereClause}
          ORDER BY log_entries.timestamp ASC, log_entries.id ASC
          LIMIT ${limitNum} OFFSET ${offset}
        `;
        }
        
        console.log(`[SQL] ID查询 (使用${joinInfo.useJoin ? 'EXISTS子查询' : '直接查询'}):\n${idQuery}`);
        const idRows = await sequelize.query(idQuery, { 
          type: SequelizeLib.QueryTypes.SELECT,
          logging: console.log 
        });
        idPhaseTime = Date.now() - idPhaseStart;
        ids = idRows.map(r => r.id);

        console.log(`[阶段一] ID查询完成: ${idPhaseTime}ms, 获取 ${ids.length} 条ID`);

        // 阶段二：根据 ID 查询详情（使用 ORM）
      const detailsPhaseStart = Date.now();
      const entries = ids.length > 0
          ? await LogEntry.findAll({ 
              where: { id: ids }, 
              attributes, 
              include: [{ model: Log, as: 'Log', attributes: ['original_name', 'device_id', 'uploader_id', 'upload_time'] }], 
              order: baseOrder, 
              subQuery: false, 
              logging: console.log 
            })
          : [];
        detailsPhaseTime = Date.now() - detailsPhaseStart;

        console.log(`[阶段二] 详情查询完成: ${detailsPhaseTime}ms, 获取 ${entries.length} 条记录`);

        // 并行执行 COUNT 与时间范围聚合（使用原生 SQL）
      const countPhaseStart = Date.now();
        
        // 优化：使用 EXISTS 子查询代替 JOIN，并添加索引提示
        let countQuery, aggQuery;
        
        if (joinInfo.useJoin) {
          const categoryIdList = analysis_category_ids.split(',').map(id => sequelize.escape(id)).join(',');
          countQuery = `
          SELECT COUNT(*) as cnt
          FROM log_entries ${forceIndex}
          ${whereClause}
            AND EXISTS (
              SELECT 1 FROM code_category_map ccm
              WHERE ccm.subsystem_char = log_entries.subsystem_char
                AND ccm.code4 = log_entries.code4
                AND ccm.analysis_category_id IN (${categoryIdList})
            )
        `;
          
          aggQuery = (shouldIncludeTimeSuggestion && !(derivedMinTs && derivedMaxTs)) ? `
          SELECT 
            MIN(log_entries.timestamp) as min_ts,
            MAX(log_entries.timestamp) as max_ts
          FROM log_entries ${forceIndex}
          ${whereClause}
            AND EXISTS (
              SELECT 1 FROM code_category_map ccm
              WHERE ccm.subsystem_char = log_entries.subsystem_char
                AND ccm.code4 = log_entries.code4
                AND ccm.analysis_category_id IN (${categoryIdList})
            )
        ` : null;
        } else {
          countQuery = `
          SELECT COUNT(*) as cnt
          FROM log_entries ${forceIndex}
          ${whereClause}
        `;
          
          aggQuery = (shouldIncludeTimeSuggestion && !(derivedMinTs && derivedMaxTs)) ? `
          SELECT 
            MIN(log_entries.timestamp) as min_ts,
            MAX(log_entries.timestamp) as max_ts
          FROM log_entries ${forceIndex}
          ${whereClause}
        ` : null;
        }
        
        const [countRows, aggRows] = await Promise.all([
          sequelize.query(countQuery, { type: SequelizeLib.QueryTypes.SELECT, logging: console.log }),
          aggQuery 
            ? sequelize.query(aggQuery, { type: SequelizeLib.QueryTypes.SELECT, logging: console.log })
            : Promise.resolve([{ min_ts: derivedMinTs || null, max_ts: derivedMaxTs || null }])
        ]);
        countPhaseTime = Date.now() - countPhaseStart;

        total = (Array.isArray(countRows) && countRows[0] && countRows[0].cnt !== undefined) ? Number(countRows[0].cnt) : 0;
        if (Array.isArray(aggRows) && aggRows[0]) { 
          minTimestamp = aggRows[0].min_ts || null; 
          maxTimestamp = aggRows[0].max_ts || null; 
        }
        
        console.log(`[阶段三] 计数/聚合完成: ${countPhaseTime}ms, 总数: ${total}`);

      const queryTime = Date.now() - overallStart;
        console.log(`[查询完成] 总耗时: ${queryTime}ms, 结果数量: ${entries.length}, 总数: ${total}`);
        console.log(`[性能分析] ID: ${idPhaseTime}ms (${(idPhaseTime/queryTime*100).toFixed(1)}%), 详情: ${detailsPhaseTime}ms (${(detailsPhaseTime/queryTime*100).toFixed(1)}%), 计数: ${countPhaseTime}ms (${(countPhaseTime/queryTime*100).toFixed(1)}%)`);

        if (queryTime > 3000) {
          console.warn(`[性能警告] 查询耗时 ${queryTime}ms，建议优化筛选条件`);
        } else if (queryTime < 1000) {
          console.log(`[性能优秀] 查询耗时 ${queryTime}ms ✅`);
        }

        const result = { 
          entries, 
          total, 
          page: pageNum, 
          limit: limitNum, 
          totalPages: Math.ceil(total / limitNum), 
          minTimestamp: shouldIncludeTimeSuggestion ? (minTimestamp || derivedMinTs || null) : null, 
          maxTimestamp: shouldIncludeTimeSuggestion ? (maxTimestamp || derivedMaxTs || null) : null,
          _performance: {
            optimized: true,
            method: 'JOIN',
            joinTable: joinInfo.joinTable,
            totalTime: queryTime,
            idPhase: idPhaseTime,
            detailsPhase: detailsPhaseTime,
            countPhase: countPhaseTime
          }
        };

        try { 
          await cacheManager.set(cacheKey, result, cacheManager.cacheConfig.searchCacheTTL); 
          console.log(`[缓存存储] 批量搜索结果已缓存: ${cacheKey}`); 
        } catch (cacheError) { 
          console.warn('缓存存储失败:', cacheError.message); 
        }
        
        return res.json(result);
      } else {
        // 原有路径（无分类过滤或包含高级筛选）
        const idPhaseStart = Date.now();
        const idPhasePromise = LogEntry.findAll({ where, attributes: ['id'], order: baseOrder, offset, limit: limitNum, subQuery: false, indexHints: idIndexHints, logging: console.log });

        const countPhaseStart = Date.now();
        const countPhasePromise = LogEntry.findAll({ where, attributes: [[SequelizeLib.fn('COUNT', SequelizeLib.col('id')), 'cnt']], raw: true, indexHints: countAggIndexHints, logging: console.log });

        let aggPhaseStart = null;
        const aggPhasePromise = (shouldIncludeTimeSuggestion && !(derivedMinTs && derivedMaxTs))
          ? (aggPhaseStart = Date.now(), LogEntry.findAll({ where, attributes: [[SequelizeLib.fn('MIN', SequelizeLib.col('timestamp')), 'min_ts'], [SequelizeLib.fn('MAX', SequelizeLib.col('timestamp')), 'max_ts']], raw: true, indexHints: countAggIndexHints }))
          : Promise.resolve([{ min_ts: derivedMinTs || null, max_ts: derivedMaxTs || null }]);

        const idRows = await idPhasePromise;
        idPhaseTime = Date.now() - idPhaseStart;
        ids = idRows.map(r => r.id);

        const detailsPhaseStart = Date.now();
        let entries = ids.length > 0
          ? await LogEntry.findAll({ where: { id: ids }, attributes, include: [{ model: Log, as: 'Log', attributes: ['original_name', 'device_id', 'uploader_id', 'upload_time'] }], order: baseOrder, subQuery: false, logging: console.log })
          : [];
        // 应用层后过滤（昂贵高级筛选）
        if (postFilterAdvanced && entries.length > 0) {
          const evalExpr = (node, row) => {
            if (!node) return true;
            if (Array.isArray(node)) return node.every(n => evalExpr(n, row));
            if (node.field && node.operator) {
              const f = String(node.field);
              const v = node.value;
              const op = String(node.operator).toLowerCase();
              const get = (k) => row[k];
              switch (op) {
                case 'like':
                case 'contains': return (get(f) ?? '').toString().includes(String(v));
                case 'notcontains': return !(get(f) ?? '').toString().includes(String(v));
                case 'regex': try { return new RegExp(String(v)).test((get(f) ?? '').toString()); } catch(_) { return false; }
                case '=': return (get(f) ?? '') == v;
                case '!=':
                case '<>': return (get(f) ?? '') != v;
                case '>': return Number(get(f)) > Number(v);
                case '>=': return Number(get(f)) >= Number(v);
                case '<': return Number(get(f)) < Number(v);
                case '<=': return Number(get(f)) <= Number(v);
                case 'between': return Array.isArray(v) && v.length===2 && Number(get(f)) >= Number(v[0]) && Number(get(f)) <= Number(v[1]);
                default: return true;
              }
            }
            if (node.conditions && (node.logic === 'AND' || node.logic === 'OR')) {
              const res = node.conditions.map(c => evalExpr(c, row));
              return node.logic === 'AND' ? res.every(Boolean) : res.some(Boolean);
            }
            return true;
          };
          entries = entries.filter(e => evalExpr(postFilterAdvanced, e));
        }
        detailsPhaseTime = Date.now() - detailsPhaseStart;

        const [countRows, aggRows] = await Promise.all([countPhasePromise, aggPhasePromise]);
        countPhaseTime = Date.now() - countPhaseStart;
        aggPhaseTime = aggPhaseStart ? (Date.now() - aggPhaseStart) : 0;

        total = (Array.isArray(countRows) && countRows[0] && countRows[0].cnt !== undefined) ? Number(countRows[0].cnt) : 0;
        if (Array.isArray(aggRows) && aggRows[0]) { minTimestamp = aggRows[0].min_ts || null; maxTimestamp = aggRows[0].max_ts || null; }

        const queryTime = Date.now() - overallStart;
        console.log(`[查询完成] 查询耗时: ${queryTime}ms, 结果数量: ${entries.length}, 总数: ${total}`);
        console.log(`[两段查询] 阶段耗时 - ID: ${idPhaseTime}ms, 详情: ${detailsPhaseTime}ms, 计数: ${countPhaseTime}ms`);
        if (shouldIncludeTimeSuggestion) { console.log(`[时间范围计算] 聚合查询耗时: ${aggPhaseTime}ms`); }

        if (queryTime > 5000) {
          console.warn(`[性能警告] 查询耗时较长 (${queryTime}ms)，建议:`);
          console.warn('  1. 减少日志文件数量');
          console.warn('  2. 添加更多筛选条件');
          console.warn('  3. 使用时间范围限制');
          console.warn('  4. 检查数据库索引状态');
        }

        const result = { entries, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum), minTimestamp: shouldIncludeTimeSuggestion ? (minTimestamp || derivedMinTs || null) : null, maxTimestamp: shouldIncludeTimeSuggestion ? (maxTimestamp || derivedMaxTs || null) : null };

        try { await cacheManager.set(cacheKey, result, cacheManager.cacheConfig.searchCacheTTL); console.log(`[缓存存储] 批量搜索结果已缓存: ${cacheKey}`); } catch (cacheError) { console.warn('缓存存储失败:', cacheError.message); }
      return res.json(result);
      }
    }
  } catch (err) {
    console.error('批量获取日志明细失败:', err);
    res.status(500).json({ message: req.t('log.listFailed'), error: err.message });
  }
};

// 导出批量日志明细为 CSV（服务端生成，单请求下载）
const exportBatchLogEntriesCSV = async (req, res) => {
  try {
    const {
      log_ids,
      search,
      error_code,
      start_time,
      end_time,
      filters
    } = req.query;

    // 构建查询条件（与 getBatchLogEntries 保持一致）
    const where = {};
    if (log_ids) {
      const ids = log_ids.split(',').map(id => parseInt(id.trim()));
      where.log_id = { [Op.in]: ids };
    }
    if (error_code) {
      where.error_code = { [Op.like]: `%${error_code}%` };
    }
    if (start_time || end_time) {
      where.timestamp = {};
      if (start_time) where.timestamp[Op.gte] = new Date(start_time);
      if (end_time) where.timestamp[Op.lte] = new Date(end_time);
    }
    if (search) {
      const keywordOr = {
        [Op.or]: [
          { explanation: { [Op.like]: `%${search}%` } },
          { error_code: { [Op.like]: `%${search}%` } }
        ]
      };
      if (where[Op.and]) {
        where[Op.and].push(keywordOr);
      } else {
        const baseConds = [];
        Object.keys(where).forEach(k => {
          if (k !== Op.and && k !== Op.or) {
            baseConds.push({ [k]: where[k] });
            delete where[k];
          }
        });
        where[Op.and] = baseConds.length > 0 ? baseConds.concat([keywordOr]) : [keywordOr];
      }
    }

    const allowedFields = new Set(['timestamp', 'error_code', 'param1', 'param2', 'param3', 'param4', 'explanation']);
    let firstOccurrenceRequested = false;
    const buildCondition = (field, operator, value) => {
      if (!allowedFields.has(field)) return null;
      const isNumericParam = ['param1', 'param2', 'param3', 'param4'].includes(field);
      const buildOpValue = (sequelizeOperator, val) => {
        if (isNumericParam) {
          const castCol = SequelizeLib.cast(SequelizeLib.col(field), 'DECIMAL(18,6)');
          if (sequelizeOperator === Op.in || sequelizeOperator === Op.notIn) {
            const arr = Array.isArray(val) ? val : [val];
            const nums = arr.map(v => Number(v)).filter(v => !Number.isNaN(v));
            if (nums.length === 0) return null;
            return SequelizeLib.where(castCol, { [sequelizeOperator]: nums });
          }
          if (sequelizeOperator === Op.between || sequelizeOperator === Op.notBetween) {
            if (!Array.isArray(val) || val.length !== 2) return null;
            const a = Number(val[0]); const b = Number(val[1]);
            if (Number.isNaN(a) || Number.isNaN(b)) return null;
            return SequelizeLib.where(castCol, sequelizeOperator, [a, b]);
          }
          const n = Number(val);
          if (Number.isNaN(n)) return null;
          return SequelizeLib.where(castCol, sequelizeOperator, n);
    }
        if (field === 'timestamp' && (sequelizeOperator === Op.between || sequelizeOperator === Op.gte || sequelizeOperator === Op.lte || sequelizeOperator === Op.gt || sequelizeOperator === Op.lt || sequelizeOperator === Op.eq || sequelizeOperator === Op.ne)) {
          const toDate = (d) => {
            if (d instanceof Date) return d; if (typeof d === 'string' || typeof d === 'number') return new Date(d); return null;
          };
          if (sequelizeOperator === Op.between) {
            if (!Array.isArray(val) || val.length !== 2) return null;
            const a = toDate(val[0]); const b = toDate(val[1]);
            if (!a || !b) return null; return { [field]: { [Op.between]: [a, b] } };
          }
          const d = toDate(val); if (!d) return null; return { [field]: { [sequelizeOperator]: d } };
        }
        if (sequelizeOperator === Op.regexp) {
          if (typeof val !== 'string' || val.length > 200) return null; return { [field]: { [Op.regexp]: val } };
        }
        if (sequelizeOperator === Op.like) return { [field]: { [Op.like]: `%${val}%` } };
        if (sequelizeOperator === Op.in || sequelizeOperator === Op.notIn) {
          const arr = Array.isArray(val) ? val : String(val).split(',').map(s => s.trim()).filter(Boolean);
          return { [field]: { [sequelizeOperator]: arr } };
        }
        if (sequelizeOperator === Op.between || sequelizeOperator === Op.notBetween) {
          if (!Array.isArray(val) || val.length !== 2) return null; return { [field]: { [sequelizeOperator]: val } };
        }
        if (isNumericParam) {
          const n = Number(val); if (Number.isNaN(n)) return null; return SequelizeLib.where(SequelizeLib.cast(SequelizeLib.col(field), 'DECIMAL(18,6)'), sequelizeOperator, n);
        }
        return { [field]: { [sequelizeOperator]: val } };
      };
      switch ((operator || '').toLowerCase()) {
        case 'firstof': firstOccurrenceRequested = true; return null;
        case '=': return buildOpValue(Op.eq, value);
        case '!=':
        case '<>': return buildOpValue(Op.ne, value);
        case '>': return buildOpValue(Op.gt, value);
        case '>=': return buildOpValue(Op.gte, value);
        case '<': return buildOpValue(Op.lt, value);
        case '<=': return buildOpValue(Op.lte, value);
        case 'between': return buildOpValue(Op.between, value);
        case 'notbetween': return isNumericParam ? null : buildOpValue(Op.notBetween, value);
        case 'in': return isNumericParam ? null : buildOpValue(Op.in, value);
        case 'notin': return isNumericParam ? null : buildOpValue(Op.notIn, value);
        case 'like': return (isNumericParam || field === 'explanation') ? null : buildOpValue(Op.like, value);
        case 'contains': return field === 'explanation' ? buildOpValue(Op.like, value) : (isNumericParam ? null : buildOpValue(Op.like, value));
        case 'notcontains': return (isNumericParam || field === 'explanation') ? null : { [field]: { [Op.notLike]: `%${value}%` } };
        case 'startswith': return (isNumericParam || field === 'explanation') ? null : { [field]: { [Op.like]: `${value}%` } };
        case 'endswith': return (isNumericParam || field === 'explanation') ? null : { [field]: { [Op.like]: `%${value}` } };
        case 'regex': return (isNumericParam || field === 'explanation') ? null : buildOpValue(Op.regexp, value);
        default: return null;
      }
    };

    // 1) 日志ID解析（导出权限对所有用户一致，不再按角色做额外过滤）
    const requestedLogIds = log_ids
      ? String(log_ids)
          .split(',')
          .map(id => parseInt(id.trim(), 10))
          .filter(n => Number.isInteger(n) && n > 0)
      : [];

    let allowedLogIds = [...requestedLogIds];

    // 2) 基于允许的日志ID获取当前版本（最新版本）；如果未指定日志ID，则不按版本过滤
    let logVersionPairs = null;
    if (allowedLogIds && allowedLogIds.length > 0) {
    const logs = await Log.findAll({
        where: { id: { [Op.in]: allowedLogIds } },
        attributes: ['id', 'version']
      });

      logVersionPairs = logs.map(l => [
        Number(l.id),
        Number(Number.isInteger(l.version) ? l.version : 1)
      ]);
    }

    // 3) 构建 ClickHouse 查询条件
    const client = getClickHouseClient();
    const conditions = [];
    const params = {};

    if (logVersionPairs && logVersionPairs.length > 0) {
      const tupleList = logVersionPairs
        .map(([logId, version]) => `(${Number(logId)}, ${Number(version)})`)
        .join(', ');
      conditions.push(`(log_id, version) IN (${tupleList})`);
    }

    if (error_code) {
      conditions.push('error_code LIKE {error_code:String}');
      params.error_code = `%${error_code}%`;
    }

    if (start_time) {
      conditions.push('timestamp >= {start_time:DateTime}');
      // 使用本地时间格式，与存储格式保持一致（YYYY-MM-DD HH:mm:ss，无时区）
      params.start_time = formatTimeForClickHouse(start_time);
    }
    if (end_time) {
      conditions.push('timestamp <= {end_time:DateTime}');
      // 使用本地时间格式，与存储格式保持一致
      params.end_time = formatTimeForClickHouse(end_time);
    }

    if (search && String(search).trim().length > 0) {
      const raw = String(search).trim();
      const hexMatch = /^[0-9a-fA-F]{4,6}$/.test(raw);
      if (hexMatch) {
        conditions.push('code4 = {search_code4:String}');
        params.search_code4 = '0X' + raw.slice(-4).toUpperCase();
      } else {
        conditions.push(
          '(positionCaseInsensitive(explanation, {search_kw:String}) > 0 OR error_code LIKE {search_like:String})'
        );
        params.search_kw = raw;
        params.search_like = `%${raw}%`;
      }
    }

    const parseAdvancedFilters = (raw) => {
      if (!raw) return null;
      let parsed = raw;
      if (typeof raw === 'string') {
        try {
          parsed = JSON.parse(raw);
        } catch {
          return null;
        }
      }
      return parsed;
    };

    const advancedFilters = parseAdvancedFilters(filters);

    if (advancedFilters) {
      const allowedFields = new Set([
        'timestamp',
        'error_code',
        'param1',
        'param2',
        'param3',
        'param4',
        'explanation'
      ]);

      let advParamIndex = 0;
      const makeParam = (base, chType, value) => {
        const name = `${base}_${advParamIndex++}`;
        params[name] = value;
        return `{${name}:${chType}}`;
      };

      const buildAdvancedExpr = (node) => {
        if (!node) return null;

        if (Array.isArray(node)) {
          const parts = node.map(child => buildAdvancedExpr(child)).filter(Boolean);
          if (parts.length === 0) return null;
          return `(${parts.join(' AND ')})`;
        }

        if (node.field && node.operator) {
          const field = String(node.field);
          const op = String(node.operator || '').toLowerCase();
          const value = node.value;

          if (!allowedFields.has(field)) return null;
          if (value === undefined || value === null || value === '') return null;

          if (field === 'timestamp') {
            const toDate = (v) => {
              if (v instanceof Date) return v;
              const d = new Date(v);
              return Number.isNaN(d.getTime()) ? null : d;
            };

            if (op === 'between') {
              if (!Array.isArray(value) || value.length !== 2) return null;
              const a = toDate(value[0]);
              const b = toDate(value[1]);
              if (!a || !b) return null;
              const p1 = makeParam('adv_ts_from', 'DateTime', a);
              const p2 = makeParam('adv_ts_to', 'DateTime', b);
              return `(timestamp BETWEEN ${p1} AND ${p2})`;
            }

            const d = toDate(value);
            if (!d) return null;
            const p = makeParam('adv_ts', 'DateTime', d);

            switch (op) {
              case '=':
              case '==':
                return `timestamp = ${p}`;
              case '!=':
              case '<>':
                return `timestamp != ${p}`;
              case '>':
                return `timestamp > ${p}`;
              case '>=':
                return `timestamp >= ${p}`;
              case '<':
                return `timestamp < ${p}`;
              case '<=':
                return `timestamp <= ${p}`;
              default:
                return null;
            }
          }

          if (field === 'error_code') {
            const p = makeParam('adv_ec', 'String', String(value));
            switch (op) {
              case '=':
                return `error_code = ${p}`;
              case '!=':
              case '<>':
                return `error_code != ${p}`;
              case 'contains':
              case 'like':
                return `positionCaseInsensitive(error_code, ${p}) > 0`;
              case 'regex':
                return `match(error_code, ${p})`;
              case 'startswith':
                return `startsWith(error_code, ${p})`;
              case 'endswith':
                return `endsWith(error_code, ${p})`;
              default:
                return null;
            }
          }

          if (field === 'param1' || field === 'param2' || field === 'param3' || field === 'param4') {
            const colExpr = `toFloat64OrNull(${field})`;
            const toNum = (v) => {
              const n = Number(v);
              return Number.isFinite(n) ? n : null;
            };

            if (op === 'between') {
              if (!Array.isArray(value) || value.length !== 2) return null;
              const a = toNum(value[0]);
              const b = toNum(value[1]);
              if (a === null || b === null) return null;
              const p1 = makeParam(`adv_${field}_from`, 'Float64', a);
              const p2 = makeParam(`adv_${field}_to`, 'Float64', b);
              return `(${colExpr} >= ${p1} AND ${colExpr} <= ${p2})`;
            }

            const n = toNum(value);
            if (n === null) return null;
            const p = makeParam(`adv_${field}`, 'Float64', n);

            switch (op) {
              case '=':
                return `${colExpr} = ${p}`;
              case '!=':
              case '<>':
                return `${colExpr} != ${p}`;
              case '>':
                return `${colExpr} > ${p}`;
              case '>=':
                return `${colExpr} >= ${p}`;
              case '<':
                return `${colExpr} < ${p}`;
              case '<=':
                return `${colExpr} <= ${p}`;
              default:
                return null;
            }
          }

          if (field === 'explanation') {
            const p = makeParam('adv_expl', 'String', String(value));
            if (op === 'contains' || op === 'like') {
              return `positionCaseInsensitive(explanation, ${p}) > 0`;
            }
            return null;
          }

          return null;
        }

        if (node.conditions && (node.logic === 'AND' || node.logic === 'OR')) {
          const childExprs = node.conditions
            .map(child => buildAdvancedExpr(child))
            .filter(Boolean);
          if (childExprs.length === 0) return null;
          const joiner = node.logic === 'OR' ? ' OR ' : ' AND ';
          return `(${childExprs.join(joiner)})`;
        }

        return null;
      };

      const advancedWhereSql = buildAdvancedExpr(advancedFilters);
      if (advancedWhereSql) {
        conditions.push(advancedWhereSql);
      }
    }

    const whereSql = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    // 响应头
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="batch_log_entries_${Date.now()}.csv"`);
    // UTF-8 BOM
    res.write('\uFEFF');
    // 表头
    const headers = ['日志文件','时间戳','故障码','参数1','参数2','参数3','参数4','释义'];
    res.write(headers.join(',') + '\n');

    const attributes = ['log_id','timestamp','error_code','param1','param2','param3','param4','explanation'];
    const idToNameCache = new Map();
    const getLogName = async (logId) => {
      if (idToNameCache.has(logId)) return idToNameCache.get(logId);
      const lg = await Log.findByPk(logId, { attributes: ['original_name'] });
      const name = lg?.original_name || '';
      idToNameCache.set(logId, name);
      return name;
    };
    const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    
    const limit = 5000;
    let offset = 0;

    while (true) {
      const query = `
        SELECT 
          log_id,
          timestamp,
          error_code,
          param1,
          param2,
          param3,
          param4,
          explanation
        FROM log_entries
        ${whereSql}
        ORDER BY timestamp ASC, log_id ASC, row_index ASC
        LIMIT {limit:UInt32} OFFSET {offset:UInt32}
      `;

      const queryParams = {
        ...params,
        limit: limit,
        offset: offset
      };

      const result = await client.query({
        query,
        query_params: queryParams,
      format: 'JSONEachRow'
    });
    const rows = await result.json();

      if (!rows || rows.length === 0) break;

    for (const row of rows) {
        const logName = await getLogName(row.log_id);
      const localTs = dayjs(row.timestamp).format('YYYY-MM-DD HH:mm:ss');
      const line = [
        csvEscape(logName),
        csvEscape(localTs),
        csvEscape(row.error_code),
        csvEscape(row.param1),
        csvEscape(row.param2),
        csvEscape(row.param3),
        csvEscape(row.param4),
        csvEscape(row.explanation)
      ].join(',');
      res.write(line + '\n');
      }

      if (rows.length < limit) break;
      offset += rows.length;
    }
    return res.end();
  } catch (err) {
    console.error('导出日志明细CSV失败:', err);
    return res.status(500).json({ message: req.t('log.analysis.failed'), error: err.message });
  }
};

// 下载日志
const downloadLog = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await Log.findByPk(id);
    if (!log) return res.status(404).json({ message: req.t('log.parse.notFound') });
    
    // 权限控制：普通用户只能下载自己的日志，专家用户和管理员可以下载任何日志
    const userRole = req.user.role_id;
    if (userRole === 3 && log.uploader_id !== req.user.id) { // 普通用户且不是自己的日志
      return res.status(403).json({ message: req.t('log.parse.permissionDenied') });
    }
    
    // 优先从保存的解密文件中读取
    if (log.decrypted_path && fs.existsSync(log.decrypted_path)) {
      const fileContent = fs.readFileSync(log.decrypted_path, 'utf-8');
      
      // 设置响应头
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(log.decrypted_path)}"`);
      
      // 发送文件内容
      res.send(fileContent);
      return;
    }
    
    // 如果解密文件不存在，从 ClickHouse log_entries 生成
    const version = Number.isInteger(log.version) ? log.version : 1;
    const fileContent = await buildDecryptedContentFromClickHouse(log.id, version);
    
    if (!fileContent) {
      return res.status(404).json({ message: req.t('log.parse.notFound') });
    }
    
    // 设置响应头
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${log.original_name.replace('.medbot', '_decrypted.txt')}"`);
    
    // 发送文件内容
    res.send(fileContent);
  } catch (err) {
    res.status(500).json({ message: req.t('log.download.failed'), error: err.message });
  }
};

// 重新解析（仅更新释义）并同步更新本地解密文件 - 仅管理员
const reparseLog = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await Log.findByPk(id);
    if (!log) return res.status(404).json({ message: req.t('log.parse.notFound') });

    const oldStatus = log.status;
    await log.update({ status: 'parsing' });
    pushLogStatusChange(log.id, oldStatus, 'parsing');

    const job = await logProcessingQueue.add('batch-reparse', { logIds: [log.id], userId: req.user ? req.user.id : null });
    return res.status(202).json({ message: req.t('log.batchReparse.success'), jobId: job.id, logId: log.id });
      } catch (err) {
      console.error('重新解析失败:', err);
      try {
        const { id } = req.params || {};
        if (id) {
          const log = await Log.findByPk(id);
          if (log) {
            // 重新解析失败通常是解析阶段的问题
            const oldStatus = log.status;
            log.status = 'parse_failed';
            await log.save();
            
            // 推送状态变化到 WebSocket
            pushLogStatusChange(log.id, oldStatus, 'parse_failed');
          }
        }
      } catch (_) {}
      return res.status(500).json({ message: req.t('log.batchReparse.failed'), error: err.message });
    }
};

// 批量重新解析（仅更新释义）并同步文件 - 仅管理员
const batchReparseLogs = async (req, res) => {
  try {
    const { logIds } = req.body || {};
    if (!Array.isArray(logIds) || logIds.length === 0) {
      return res.status(400).json({ message: req.t('log.batchReparse.notFound') });
    }
    // 规范化并去重 ID
    const normalizedIds = [...new Set(
      logIds
        .map(id => parseInt(id, 10))
        .filter(id => Number.isInteger(id) && id > 0)
    )];
    if (normalizedIds.length === 0) {
      return res.status(400).json({ message: req.t('log.batchReparse.notFound') });
    }
    
    // 预先将这些日志标记为 parsing，便于前端实时反馈
    try {
      // 先查出旧状态与设备ID，构建批量变更列表
      const logs = await Log.findAll({ where: { id: normalizedIds }, attributes: ['id','status','device_id'] });
      const deviceChangesMap = new Map();
      logs.forEach(l => {
        if (!l.device_id) return;
        if (!deviceChangesMap.has(l.device_id)) deviceChangesMap.set(l.device_id, []);
        deviceChangesMap.get(l.device_id).push({ logId: l.id, oldStatus: l.status, newStatus: 'parsing' });
      });

      // 一次性更新数据库状态
      await Log.update({ status: 'parsing' }, { where: { id: normalizedIds } });

      // 先发批量事件，前端收到后就地更新；再补发单条事件，兼容旧前端
      try {
        for (const [deviceId, changes] of deviceChangesMap.entries()) {
          websocketService.pushBatchStatusChange(deviceId, changes);
          changes.forEach(c => {
            websocketService.pushLogStatusChange(deviceId, c.logId, 'parsing', c.oldStatus);
          });
        }
      } catch (wsErr) {
        console.warn('批量预置 parsing 状态推送失败（忽略）:', wsErr.message);
      }
    } catch (presetErr) {
      console.warn('批量重新解析预置 parsing 状态失败（忽略）:', presetErr.message);
    }
    // 权限由路由中间件控制，这里不再重复校验角色

    // 策略改为按日志拆分入队，让多进程并行消费
    console.log(`将批量重新解析任务拆分为单日志任务，日志数量: ${normalizedIds.length}`);
    const createdJobs = [];
    for (const id of normalizedIds) {
      const j = await logProcessingQueue.add('reparse-single', {
        logId: id,
        userId: req.user ? req.user.id : null
      }, {
        priority: 2,
        delay: 0,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 }
      });
      createdJobs.push(j.id);
    }
    console.log(`已创建 ${createdJobs.length} 个单日志重新解析任务: ${createdJobs.join(', ')}`);
    
    res.json({ 
      message: req.t('log.batchReparse.success'), 
      jobIds: createdJobs,
      queued: true,
      logCount: normalizedIds.length
    });
  } catch (err) {
    console.error('批量重新解析失败:', err);
    return res.status(500).json({ message: req.t('log.batchReparse.failed'), error: err.message });
  }
};

// 删除日志
const deleteLog = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await Log.findByPk(id);
    if (!log) return res.status(404).json({ message: req.t('log.parse.notFound') });
    
    // 权限控制：普通用户只能删除自己的日志，专家用户和管理员可以删除任何日志
    const userRole = req.user.role_id;
    if (userRole === 3 && log.uploader_id !== req.user.id) { // 普通用户且不是自己的日志
      return res.status(403).json({ message: req.t('log.parse.permissionDenied') });
    }
    
    // 立即更新状态为"删除中"
    const oldStatus = log.status;
    await log.update({ status: 'deleting' });
    
    // 推送状态变化到 WebSocket
    pushLogStatusChange(log.id, oldStatus, 'deleting');
    
    // 将删除任务加入队列
    const job = await logProcessingQueue.add('delete-single', {
      logId: id,
      userId: req.user.id
    }, {
      priority: 1,
      delay: 0,
      attempts: 1
    });
    
    res.json({ 
      message: req.t('log.delete.success'), 
      queued: true,
      jobId: job.id
    });
    
  } catch (err) {
    res.status(500).json({ message: req.t('log.delete.failed'), error: err.message });
  }
};

// 根据密钥自动填充设备编号（优先从设备表查询，其次从日志表推断）
const autoFillDeviceId = async (req, res) => {
  try {
    const { key } = req.query;
    
    if (!key) {
      return res.status(400).json({ message: req.t('device.provideKey') });
    }
    
    // 1) 设备表
    try {
      const device = await Device.findOne({ where: { device_key: key } });
      if (device && device.device_id) {
        return res.json({ device_id: device.device_id });
      }
    } catch (_) {}

    // 2) 在logs表中查找使用过该密钥的设备编号
    const log = await Log.findOne({
      where: { key_id: key },
      order: [['original_name', 'DESC']], // 获取最新的记录
      attributes: ['device_id']
    });
    
    if (log && log.device_id) {
      res.json({ device_id: log.device_id });
    } else {
      res.json({ device_id: null });
    }
  } catch (err) {
    res.status(500).json({ message: req.t('log.analysis.failed'), error: err.message });
  }
};

// 根据设备编号自动填充密钥（优先从设备表查询，其次从日志表推断）
const autoFillKey = async (req, res) => {
  try {
    const { device_id } = req.query;
    
    if (!device_id) {
      return res.status(400).json({ message: req.t('device.requiredId') });
    }
    
    // 1) 设备表
    try {
      const device = await Device.findOne({ where: { device_id } });
      if (device && device.device_key) {
        return res.json({ key: device.device_key });
      }
    } catch (_) {}

    // 2) 在logs表中查找该设备编号使用过的密钥
    const log = await Log.findOne({
      where: { device_id: device_id },
      order: [['original_name', 'DESC']], // 获取最新的记录
      attributes: ['key_id']
    });
    
    if (log && log.key_id) {
      res.json({ key: log.key_id });
    } else {
      res.json({ key: null });
    }
  } catch (err) {
    res.status(500).json({ message: req.t('log.analysis.failed'), error: err.message });
  }
};

// 验证密钥格式
const validateKey = (key) => {
  // 密钥格式：mac地址，例如 00-01-05-77-6a-09
  const macAddressRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
  return macAddressRegex.test(key);
};

// 验证设备编号格式
const validateDeviceId = (deviceId) => {
  // 设备编号格式：允许数字+字母组合，例如 4371-01、ABC-12、123-XY
  const deviceIdRegex = /^[0-9A-Za-z]+-[0-9A-Za-z]+$/;
  return deviceIdRegex.test(deviceId);
};

    // 批量删除日志
    const batchDeleteLogs = async (req, res) => {
      try {
        const { logIds } = req.body;
        
        if (!logIds || !Array.isArray(logIds) || logIds.length === 0) {
          return res.status(400).json({ message: req.t('log.batchReparse.notFound') });
        }
        
        const userRole = req.user.role_id;
        const userId = req.user.id;
        
        // 确保logIds是数字类型
        const numericLogIds = logIds.map(id => parseInt(id)).filter(id => !isNaN(id));
        
        if (numericLogIds.length === 0) {
          return res.status(400).json({ message: req.t('log.batchReparse.notFound') });
        }
        
        // 获取所有要删除的日志进行权限检查
        const logs = [];
        for (const id of numericLogIds) {
          const log = await Log.findByPk(id);
          if (log) {
            logs.push(log);
          }
        }
        
        if (logs.length === 0) {
          return res.status(404).json({ 
            message: req.t('log.parse.notFound'),
            requestedIds: numericLogIds,
            foundCount: logs.length
          });
        }
        
        // 权限检查：普通用户只能删除自己的日志
        if (userRole === 3) {
          const unauthorizedLogs = logs.filter(log => log.uploader_id !== userId);
          if (unauthorizedLogs.length > 0) {
            return res.status(403).json({ 
              message: req.t('log.parse.permissionDenied'),
              unauthorizedLogs: unauthorizedLogs.map(log => ({ id: log.id, original_name: log.original_name }))
            });
          }
        }
        
        // 立即更新所有日志状态为"删除中"
        await Log.update(
          { status: 'deleting' },
          { where: { id: numericLogIds } }
        );
        
        // 将批量删除任务添加到队列
        console.log(`将批量删除任务添加到队列，日志数量: ${numericLogIds.length}`);
        
        const job = await logProcessingQueue.add('batch-delete', {
          logIds: numericLogIds,
          userId: req.user ? req.user.id : null
        }, {
          priority: 1, // 高优先级，与日志处理同级
          delay: 0, // 立即处理
          attempts: 1, // 只重试1次，避免重复错误
          backoff: {
            type: 'exponential',
            delay: 2000
          }
        });
        
        console.log(`批量删除任务已添加到队列，任务ID: ${job.id}`);
        
        res.json({ 
          message: req.t('log.delete.success'), 
          jobId: job.id,
          queued: true,
          logCount: numericLogIds.length
        });
      } catch (err) {
        console.error('批量删除失败:', err);
        res.status(500).json({ 
          message: req.t('log.delete.failed'), 
          error: err.message
        });
      }
    };

// 批量下载日志
const batchDownloadLogs = async (req, res) => {
  try {
    const { logIds } = req.body;
    
    if (!logIds || !Array.isArray(logIds) || logIds.length === 0) {
      return res.status(400).json({ message: req.t('log.batchReparse.notFound') });
    }
    
    const userRole = req.user.role_id;
    const userId = req.user.id;
    
    // 确保logIds是数字类型
    const numericLogIds = logIds.map(id => parseInt(id)).filter(id => !isNaN(id));
    
    if (numericLogIds.length === 0) {
      return res.status(400).json({ message: req.t('log.batchReparse.notFound') });
    }
    
    // 获取所有要下载的日志
    const logs = [];
    for (const id of numericLogIds) {
      const log = await Log.findByPk(id);
      if (log) {
        logs.push(log);
      }
    }
    
    if (logs.length === 0) {
      return res.status(404).json({ 
        message: req.t('log.parse.notFound'),
        requestedIds: numericLogIds,
        foundCount: logs.length
      });
    }
    
    // 权限检查：普通用户只能下载自己的日志
    if (userRole === 3) {
      const unauthorizedLogs = logs.filter(log => log.uploader_id !== userId);
      if (unauthorizedLogs.length > 0) {
        return res.status(403).json({ 
          message: req.t('log.parse.permissionDenied'),
          unauthorizedLogs: unauthorizedLogs.map(log => ({ id: log.id, original_name: log.original_name }))
        });
      }
    }
    
    // 检查是否所有日志都已解析完成
    const unparsedLogs = logs.filter(log => log.status !== 'parsed');
    if (unparsedLogs.length > 0) {
      return res.status(400).json({ 
        message: req.t('log.parse.failed'),
        unparsedLogs: unparsedLogs.map(log => ({ id: log.id, original_name: log.original_name, status: log.status }))
      });
    }
    
    // 创建临时目录用于存放文件
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // 生成ZIP文件名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const zipFileName = `logs_batch_${timestamp}.zip`;
    const zipFilePath = path.join(tempDir, zipFileName);
    
    // 创建ZIP文件
    const archiver = require('archiver');
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // 设置压缩级别
    });
    
    output.on('close', () => {
      console.log(`ZIP文件创建完成: ${zipFilePath}, 大小: ${archive.pointer()} bytes`);
    });
    
    archive.on('error', (err) => {
      throw err;
    });
    
    archive.pipe(output);
    
    // 添加文件到ZIP
    for (const log of logs) {
      try {
        let fileContent = '';
        let fileName = '';
        
        // 优先从保存的解密文件中读取
        if (log.decrypted_path && fs.existsSync(log.decrypted_path)) {
          fileContent = fs.readFileSync(log.decrypted_path, 'utf-8');
          fileName = path.basename(log.decrypted_path);
        } else {
          // 如果解密文件不存在，从 ClickHouse log_entries 生成
          const version = Number.isInteger(log.version) ? log.version : 1;
          fileContent = await buildDecryptedContentFromClickHouse(log.id, version);
          if (fileContent) {
            fileName = log.original_name.replace('.medbot', '_decrypted.txt');
          }
        }
        
        if (fileContent) {
          // 在ZIP中创建子目录，按设备编号分组
          const deviceDir = log.device_id || 'unknown';
          const zipPath = `${deviceDir}/${fileName}`;
          archive.append(fileContent, { name: zipPath });
        }
      } catch (error) {
        console.error(`处理日志 ${log.id} 时出错:`, error);
        // 继续处理其他文件
      }
    }
    
    // 完成ZIP文件
    await archive.finalize();
    
    // 等待文件写入完成
    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
    });
    
    // 设置响应头
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
    res.setHeader('Content-Length', fs.statSync(zipFilePath).size);
    
    // 发送ZIP文件
    const fileStream = fs.createReadStream(zipFilePath);
    fileStream.pipe(res);
    
    // 文件发送完成后删除临时文件
    fileStream.on('end', () => {
      try {
        fs.unlinkSync(zipFilePath);
        console.log(`临时文件已删除: ${zipFilePath}`);
      } catch (error) {
        console.error('删除临时文件失败:', error);
      }
    });
    
  } catch (err) {
    console.error('批量下载失败:', err);
    res.status(500).json({ 
      message: req.t('log.download.failed'), 
      error: err.message
    });
  }
};

// 手术统计分析
const analyzeSurgeryData = async (req, res) => {
  try {
    const { logId } = req.params;
    
    // 获取日志信息
    const log = await Log.findByPk(logId);
    if (!log) {
      return res.status(404).json({ message: req.t('log.parse.notFound') });
    }
    
    // 获取日志条目
    const entries = await LogEntry.findAll({
      where: { log_id: logId },
      order: [['timestamp', 'ASC']],
      raw: true
    });
    
    if (entries.length === 0) {
      return res.status(404).json({ message: req.t('log.parse.notFound') });
    }
    
    // 为每个条目添加日志文件名信息
    const entriesWithLogName = entries.map(entry => ({
      ...entry,
      log_name: log.original_name
    }));
    
    // 使用更完善的手术分析逻辑
    const { analyzeSurgeries } = require('./surgeryStatisticsController');
    const surgeries = analyzeSurgeries(entriesWithLogName);
    
    // 为每个手术分配唯一ID
    surgeries.forEach((surgery, index) => {
      surgery.id = index + 1;
      surgery.log_filename = log.original_name;
    });
    
    res.json({
      success: true,
      data: surgeries,
      message: req.t('log.analysis.success', { count: surgeries.length })
    });
  } catch (err) {
    console.error('手术统计分析失败:', err);
    res.status(500).json({ message: req.t('log.analysis.failed'), error: err.message });
  }
};

// 从日志条目中分析手术数据
const analyzeSurgeryFromEntries = (entries, log) => {
  const surgeryData = {
    logInfo: {
      id: log.id,
      originalName: log.original_name,
      deviceId: log.device_id,
      uploadTime: log.upload_time,
      parseTime: log.parse_time
    },
    surgeryInfo: {
      startTime: null,
      endTime: null,
      totalDuration: 0,
      powerOnTime: null,
      powerOffTime: null
    },
    toolArms: {
      arm1: { totalActiveTime: 0, tools: [], energyTime: 0 },
      arm2: { totalActiveTime: 0, tools: [], energyTime: 0 },
      arm3: { totalActiveTime: 0, tools: [], energyTime: 0 },
      arm4: { totalActiveTime: 0, tools: [], energyTime: 0 }
    },
    safetyAlarms: [],
    stateMachineChanges: [],
    footPedalSignals: {
      energy: 0,
      clutch: 0,
      camera: 0
    },
    handClutchSignals: {
      arm1: 0,
      arm2: 0,
      arm3: 0,
      arm4: 0
    }
  };
  
  // 分析每个日志条目
  entries.forEach(entry => {
    const timestamp = new Date(entry.timestamp);
    const errorCode = entry.error_code;
    const explanation = entry.explanation || '';
    
    // 分析开机/关机时间
    if (explanation.includes('开机') || explanation.includes('系统启动') || explanation.includes('power on')) {
      if (!surgeryData.surgeryInfo.powerOnTime || timestamp < surgeryData.surgeryInfo.powerOnTime) {
        surgeryData.surgeryInfo.powerOnTime = timestamp;
      }
    }
    
    if (explanation.includes('关机') || explanation.includes('系统关闭') || explanation.includes('power off')) {
      if (!surgeryData.surgeryInfo.powerOffTime || timestamp > surgeryData.surgeryInfo.powerOffTime) {
        surgeryData.surgeryInfo.powerOffTime = timestamp;
      }
    }
    
    // 分析手术开始/结束时间
    if (explanation.includes('手术开始') || explanation.includes('surgery start')) {
      if (!surgeryData.surgeryInfo.startTime || timestamp < surgeryData.surgeryInfo.startTime) {
        surgeryData.surgeryInfo.startTime = timestamp;
      }
    }
    
    if (explanation.includes('手术结束') || explanation.includes('surgery end')) {
      if (!surgeryData.surgeryInfo.endTime || timestamp > surgeryData.surgeryInfo.endTime) {
        surgeryData.surgeryInfo.endTime = timestamp;
      }
    }
    
    // 分析工具臂使用情况
    if (explanation.includes('工具臂1') || explanation.includes('arm 1')) {
      surgeryData.toolArms.arm1.totalActiveTime += 1; // 假设每个条目代表1秒
      if (explanation.includes('能量') || explanation.includes('energy')) {
        surgeryData.toolArms.arm1.energyTime += 1;
      }
    }
    
    if (explanation.includes('工具臂2') || explanation.includes('arm 2')) {
      surgeryData.toolArms.arm2.totalActiveTime += 1;
      if (explanation.includes('能量') || explanation.includes('energy')) {
        surgeryData.toolArms.arm2.energyTime += 1;
      }
    }
    
    if (explanation.includes('工具臂3') || explanation.includes('arm 3')) {
      surgeryData.toolArms.arm3.totalActiveTime += 1;
      if (explanation.includes('能量') || explanation.includes('energy')) {
        surgeryData.toolArms.arm3.energyTime += 1;
      }
    }
    
    if (explanation.includes('工具臂4') || explanation.includes('arm 4')) {
      surgeryData.toolArms.arm4.totalActiveTime += 1;
      if (explanation.includes('能量') || explanation.includes('energy')) {
        surgeryData.toolArms.arm4.energyTime += 1;
      }
    }
    
    // 分析安全报警
    if (explanation.includes('报警') || explanation.includes('警告') || explanation.includes('错误') || 
        explanation.includes('alarm') || explanation.includes('warning') || explanation.includes('error')) {
      surgeryData.safetyAlarms.push({
        timestamp: timestamp,
        type: explanation.includes('错误') || explanation.includes('error') ? 'error' : 'warning',
        message: explanation
      });
    }
    
    // 分析状态机变化
    if (explanation.includes('状态') || explanation.includes('state')) {
      surgeryData.stateMachineChanges.push({
        timestamp: timestamp,
        state: explanation
      });
    }
    
    // 分析脚踏信号
    if (explanation.includes('能量脚踏') || explanation.includes('energy pedal')) {
      surgeryData.footPedalSignals.energy++;
    }
    if (explanation.includes('离合脚踏') || explanation.includes('clutch pedal')) {
      surgeryData.footPedalSignals.clutch++;
    }
    if (explanation.includes('镜头控制') || explanation.includes('camera control')) {
      surgeryData.footPedalSignals.camera++;
    }
    
    // 分析手离合信号
    if (explanation.includes('手离合') && explanation.includes('1')) {
      surgeryData.handClutchSignals.arm1++;
    }
    if (explanation.includes('手离合') && explanation.includes('2')) {
      surgeryData.handClutchSignals.arm2++;
    }
    if (explanation.includes('手离合') && explanation.includes('3')) {
      surgeryData.handClutchSignals.arm3++;
    }
    if (explanation.includes('手离合') && explanation.includes('4')) {
      surgeryData.handClutchSignals.arm4++;
    }
  });
  
  // 计算总手术时长
  if (surgeryData.surgeryInfo.startTime && surgeryData.surgeryInfo.endTime) {
    surgeryData.surgeryInfo.totalDuration = 
      Math.floor((surgeryData.surgeryInfo.endTime - surgeryData.surgeryInfo.startTime) / 1000 / 60); // 分钟
  }
  
  // 模拟工具使用详情（基于实际数据生成）
  surgeryData.toolArms.arm1.tools = generateToolUsage(surgeryData.toolArms.arm1.totalActiveTime, 'arm1');
  surgeryData.toolArms.arm2.tools = generateToolUsage(surgeryData.toolArms.arm2.totalActiveTime, 'arm2');
  surgeryData.toolArms.arm3.tools = generateToolUsage(surgeryData.toolArms.arm3.totalActiveTime, 'arm3');
  surgeryData.toolArms.arm4.tools = generateToolUsage(surgeryData.toolArms.arm4.totalActiveTime, 'arm4');
  
  return surgeryData;
};

// 生成工具使用详情
const generateToolUsage = (totalTime, armId) => {
  const tools = [];
  const toolTypes = [
    { name: '腹腔镜抓钳', udi: 'LAP-GRIP-2023-0515' },
    { name: '电凝钩', udi: 'ELEC-HOOK-7845' },
    { name: '吸引器', udi: 'SUCT-2023-1122' },
    { name: '持针器', udi: 'NEEDLE-5566' },
    { name: '缝合器', udi: 'SUT-2023-4587' },
    { name: '切割吻合器', udi: 'CUT-ANAST-9988' }
  ];
  
  if (totalTime > 0) {
    // 根据总时间分配工具使用
    const tool1 = toolTypes[Math.floor(Math.random() * toolTypes.length)];
    const time1 = Math.floor(totalTime * 0.7);
    tools.push({
      name: tool1.name,
      udi: tool1.udi,
      startTime: '08:50',
      endTime: '10:55',
      duration: time1
    });
    
    if (totalTime > time1) {
      const tool2 = toolTypes[Math.floor(Math.random() * toolTypes.length)];
      const time2 = totalTime - time1;
      tools.push({
        name: tool2.name,
        udi: tool2.udi,
        startTime: '10:55',
        endTime: '11:25',
        duration: time2
      });
    }
  }
  
  return tools;
};

// 获取日志统计信息（用于计数功能）
const getLogStatistics = async (req, res) => {
  try {
    const { 
      log_ids, 
      search, 
      error_code, 
      start_time, 
      end_time,
      filters 
    } = req.query;

    // 保护：没有时间范围时，ClickHouse 的统计（GROUP BY）可能需要扫大量分区/冷数据，
    // 容易触发 OOM/连接重置（客户端表现为 ECONNRESET/socket hang up）。
    // 批量分析页会先通过明细接口拿到 min/max 并自动回填 timeRange，再请求统计。
    if (!start_time && !end_time) {
      return res.json({
        success: true,
        errorCodeCounts: {},
        logCounts: {},
        totalErrorCodes: 0,
        totalLogEntries: 0,
        skipped: true,
        reason: 'time_range_required',
        queryConditions: {
          log_ids: log_ids ? String(log_ids).split(',').filter(s => s.trim()).length : 0,
          hasSearch: !!search,
          hasErrorCodeFilter: !!error_code,
          hasTimeRange: false
        }
      });
    }
    
    // 解析日志ID
    const requestedLogIds = log_ids
      ? String(log_ids)
        .split(',')
        .map(id => parseInt(id.trim(), 10))
          .filter(n => Number.isInteger(n) && n > 0)
      : [];

    // 权限控制：普通用户只能查看自己的日志统计（基于 MySQL logs 元数据）
    let allowedLogIds = [...requestedLogIds];
    if (req.user && req.user.role_id) {
      const userRole = req.user.role_id;
      if (userRole === 3) { // 普通用户
      const userLogs = await Log.findAll({
        where: { uploader_id: req.user.id },
        attributes: ['id']
      });
        const userLogIds = userLogs.map(log => log.id);

        if (allowedLogIds.length > 0) {
          allowedLogIds = allowedLogIds.filter(id => userLogIds.includes(id));
      } else {
          // 未指定 log_ids，则只统计当前用户的日志
          allowedLogIds = userLogIds;
    }

        if (!allowedLogIds || allowedLogIds.length === 0) {
      return res.json({
        success: true,
        errorCodeCounts: {},
        logCounts: {},
        totalErrorCodes: 0,
        totalLogEntries: 0,
        queryConditions: {
          log_ids: 0,
          hasSearch: !!search,
          hasErrorCodeFilter: !!error_code,
          hasTimeRange: !!(start_time || end_time)
        }
      });
        }
      }
    }

    // 基于允许的日志ID获取当前版本（最新版本）；如果未指定日志ID，则不按版本过滤
    let logVersionPairs = null;
    if (allowedLogIds && allowedLogIds.length > 0) {
    const logs = await Log.findAll({
        where: { id: { [Op.in]: allowedLogIds } },
      attributes: ['id', 'version']
    });

      logVersionPairs = logs.map(l => [
        Number(l.id),
        Number(Number.isInteger(l.version) ? l.version : 1)
      ]);

      if (!logVersionPairs || logVersionPairs.length === 0) {
      return res.json({
        success: true,
        errorCodeCounts: {},
        logCounts: {},
        totalErrorCodes: 0,
        totalLogEntries: 0,
        queryConditions: {
          log_ids: 0,
          hasSearch: !!search,
          hasErrorCodeFilter: !!error_code,
          hasTimeRange: !!(start_time || end_time)
        }
      });
      }
    }

    const client = getClickHouseClient();
    const conditions = [];
    const params = {};

    // 按 (log_id, version) 过滤：仅当显式指定日志ID时才启用版本过滤
    if (logVersionPairs && logVersionPairs.length > 0) {
      const tupleList = logVersionPairs
        .map(([logId, version]) => `(${Number(logId)}, ${Number(version)})`)
        .join(', ');
      conditions.push(`(log_id, version) IN (${tupleList})`);
    }

    // 故障码模糊匹配
    if (error_code) {
      conditions.push('error_code LIKE {error_code:String}');
      params.error_code = `%${error_code}%`;
    }

    // 时间范围
    if (start_time) {
      conditions.push('timestamp >= {start_time:DateTime}');
      // 使用本地时间格式，与存储格式保持一致（YYYY-MM-DD HH:mm:ss，无时区）
      params.start_time = formatTimeForClickHouse(start_time);
    }
    if (end_time) {
      conditions.push('timestamp <= {end_time:DateTime}');
      // 使用本地时间格式，与存储格式保持一致
      params.end_time = formatTimeForClickHouse(end_time);
    }

    // 关键字搜索：十六进制 -> code4，否则 explanation / error_code
    if (search && String(search).trim().length > 0) {
      const raw = String(search).trim();
      const hexMatch = /^[0-9a-fA-F]{4,6}$/.test(raw);
      if (hexMatch) {
        conditions.push('code4 = {search_code4:String}');
        params.search_code4 = '0X' + raw.slice(-4).toUpperCase();
      } else {
        conditions.push(
          '(positionCaseInsensitive(explanation, {search_kw:String}) > 0 OR error_code LIKE {search_like:String})'
        );
        params.search_kw = raw;
        params.search_like = `%${raw}%`;
      }
    }

    // ---------- 高级搜索表达式 filters：下推到 ClickHouse ----------
    const parseAdvancedFilters = (raw) => {
      if (!raw) return null;
      let parsed = raw;
      if (typeof raw === 'string') {
        try {
          parsed = JSON.parse(raw);
        } catch {
          return null;
        }
      }
      return parsed;
    };

    const advancedFilters = parseAdvancedFilters(filters);

    if (advancedFilters) {
      const allowedFields = new Set([
        'timestamp',
        'error_code',
        'param1',
        'param2',
        'param3',
        'param4',
        'explanation'
      ]);

      let advParamIndex = 0;
      const makeParam = (base, chType, value) => {
        const name = `${base}_${advParamIndex++}`;
        params[name] = value;
        return `{${name}:${chType}}`;
      };

      const buildAdvancedExpr = (node) => {
        if (!node) return null;

        // 数组：默认 AND 连接
        if (Array.isArray(node)) {
          const parts = node.map(child => buildAdvancedExpr(child)).filter(Boolean);
          if (parts.length === 0) return null;
          return `(${parts.join(' AND ')})`;
        }

        // 叶子条件
        if (node.field && node.operator) {
          const field = String(node.field);
          const op = String(node.operator || '').toLowerCase();
          const value = node.value;

          if (!allowedFields.has(field)) return null;
          if (value === undefined || value === null || value === '') return null;

          // timestamp 字段
          if (field === 'timestamp') {
            const toDate = (v) => {
              if (v instanceof Date) return v;
              const d = new Date(v);
              return Number.isNaN(d.getTime()) ? null : d;
            };

            if (op === 'between') {
              if (!Array.isArray(value) || value.length !== 2) return null;
              const a = toDate(value[0]);
              const b = toDate(value[1]);
              if (!a || !b) return null;
              const p1 = makeParam('adv_ts_from', 'DateTime', a);
              const p2 = makeParam('adv_ts_to', 'DateTime', b);
              return `(timestamp BETWEEN ${p1} AND ${p2})`;
            }

            const d = toDate(value);
            if (!d) return null;
            const p = makeParam('adv_ts', 'DateTime', d);

            switch (op) {
              case '=':
              case '==':
                return `timestamp = ${p}`;
              case '!=':
              case '<>':
                return `timestamp != ${p}`;
              case '>':
                return `timestamp > ${p}`;
              case '>=':
                return `timestamp >= ${p}`;
              case '<':
                return `timestamp < ${p}`;
              case '<=':
                return `timestamp <= ${p}`;
              default:
                return null;
            }
          }

          // error_code 字段
          if (field === 'error_code') {
            const p = makeParam('adv_ec', 'String', String(value));
            switch (op) {
              case '=':
                return `error_code = ${p}`;
              case '!=':
              case '<>':
                return `error_code != ${p}`;
              case 'contains':
              case 'like':
                return `positionCaseInsensitive(error_code, ${p}) > 0`;
              case 'regex':
                return `match(error_code, ${p})`;
              case 'startswith':
                return `startsWith(error_code, ${p})`;
              case 'endswith':
                return `endsWith(error_code, ${p})`;
              default:
                return null;
            }
          }

          // 数值参数 param1-4：底层为 String，这里转换为 Float64
          if (field === 'param1' || field === 'param2' || field === 'param3' || field === 'param4') {
            const colExpr = `toFloat64OrNull(${field})`;
            const toNum = (v) => {
              const n = Number(v);
              return Number.isFinite(n) ? n : null;
            };

            if (op === 'between') {
              if (!Array.isArray(value) || value.length !== 2) return null;
              const a = toNum(value[0]);
              const b = toNum(value[1]);
              if (a === null || b === null) return null;
              const p1 = makeParam(`adv_${field}_from`, 'Float64', a);
              const p2 = makeParam(`adv_${field}_to`, 'Float64', b);
              return `(${colExpr} >= ${p1} AND ${colExpr} <= ${p2})`;
            }

            const n = toNum(value);
            if (n === null) return null;
            const p = makeParam(`adv_${field}`, 'Float64', n);

            switch (op) {
              case '=':
                return `${colExpr} = ${p}`;
              case '!=':
              case '<>':
                return `${colExpr} != ${p}`;
              case '>':
                return `${colExpr} > ${p}`;
              case '>=':
                return `${colExpr} >= ${p}`;
              case '<':
                return `${colExpr} < ${p}`;
              case '<=':
                return `${colExpr} <= ${p}`;
              default:
                return null;
            }
          }

          // explanation 字段：只支持 contains / like
          if (field === 'explanation') {
            const p = makeParam('adv_expl', 'String', String(value));
            if (op === 'contains' || op === 'like') {
              return `positionCaseInsensitive(explanation, ${p}) > 0`;
            }
            return null;
          }

          return null;
        }

        // 分组节点
        if (node.conditions && (node.logic === 'AND' || node.logic === 'OR')) {
          const childExprs = node.conditions
            .map(child => buildAdvancedExpr(child))
            .filter(Boolean);
          if (childExprs.length === 0) return null;
          const joiner = node.logic === 'OR' ? ' OR ' : ' AND ';
          return `(${childExprs.join(joiner)})`;
        }

        return null;
      };

      const advancedWhereSql = buildAdvancedExpr(advancedFilters);
      if (advancedWhereSql) {
        conditions.push(advancedWhereSql);
      }
    }

    const whereSql = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    // 过滤掉分类参数，避免日志过长
    const filteredStatsParams = { ...params };
    Object.keys(filteredStatsParams).forEach(key => {
      if (key.startsWith('cat_codes_') || key.startsWith('cat_subsystem_')) {
        delete filteredStatsParams[key];
      }
    });
    console.log('[统计查询] 使用 ClickHouse 条件:', whereSql);
    if (Object.keys(filteredStatsParams).length > 0) {
      console.log('[统计查询] 查询参数 (已过滤分类参数):', filteredStatsParams);
    }

    // ClickHouse 聚合统计：按故障码统计出现次数
    const statsQuery = `
      SELECT 
        error_code,
        count() AS cnt
      FROM log_entries
      ${whereSql}
      GROUP BY error_code
    `;

    const result = await client.query({
      query: statsQuery,
      query_params: params,
      format: 'JSONEachRow'
    });
    const rows = await result.json();

    const errorCodeCounts = {};
    const logCounts = {};

    for (const row of rows) {
      const code = row.error_code || '';
      const count = parseInt(row.cnt, 10) || 0;
      if (!code) continue;
      errorCodeCounts[code] = count;
      logCounts[code] = count;
    }
    
    res.json({
      success: true,
      errorCodeCounts,
      logCounts,
      totalErrorCodes: rows.length,
      totalLogEntries: rows.length,
      queryConditions: {
        log_ids: log_ids ? String(log_ids).split(',').filter(s => s.trim()).length : 0,
        hasSearch: !!search,
        hasErrorCodeFilter: !!error_code,
        hasTimeRange: !!(start_time || end_time)
      }
    });
    
  } catch (err) {
    console.error('获取日志统计失败:', err);
    res.status(500).json({ message: req.t('log.analysis.failed'), error: err.message });
  }
};

// 分批查询执行函数
const executeBatchQuery = async (req, res, logIds, baseWhere, cacheKey, shouldIncludeTimeSuggestion) => {
  try {
    console.log(`[分批查询] 开始分批查询，日志ID数量: ${logIds.length}`);
    const startTime = Date.now();
    
    // 分批大小：每次处理5个日志文件
    const batchSize = 5;
    const batches = [];
    for (let i = 0; i < logIds.length; i += batchSize) {
      batches.push(logIds.slice(i, i + batchSize));
    }
    
    console.log(`[分批查询] 分为 ${batches.length} 批，每批 ${batchSize} 个日志文件`);
    
    // 并行执行分批查询
    const batchResults = await Promise.all(batches.map(async (batchIds, batchIndex) => {
      const batchStartTime = Date.now();
      console.log(`[分批查询] 执行第 ${batchIndex + 1}/${batches.length} 批，日志ID: ${batchIds.join(',')}`);
      
      const batchWhere = { ...baseWhere, log_id: { [Op.in]: batchIds } };
      
      const { count: batchTotal, rows: batchEntries } = await LogEntry.findAndCountAll({
        where: batchWhere,
        attributes: ['id', 'log_id', 'timestamp', 'error_code', 'param1', 'param2', 'param3', 'param4', 'explanation'],
        include: [{
          model: Log,
          as: 'Log',
          attributes: ['original_name', 'device_id', 'uploader_id', 'upload_time']
        }],
        distinct: true,
        subQuery: false
      });
      
      const batchTime = Date.now() - batchStartTime;
      console.log(`[分批查询] 第 ${batchIndex + 1} 批完成，耗时: ${batchTime}ms，结果: ${batchEntries.length} 条`);
      
      return {
        entries: batchEntries,
        total: batchTotal,
        batchTime
      };
    }));
    
    // 合并结果
    const allEntries = batchResults.flatMap(batch => batch.entries);
    const totalCount = batchResults.reduce((sum, batch) => sum + batch.total, 0);
    const totalTime = Date.now() - startTime;
    
    console.log(`[分批查询] 所有批次完成，总耗时: ${totalTime}ms，总结果: ${allEntries.length} 条`);
    
    // 分页处理
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const offset = (page - 1) * limit;
    const paginatedEntries = allEntries.slice(offset, offset + limit);
    
    const result = {
      entries: paginatedEntries,
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      minTimestamp: shouldIncludeTimeSuggestion ? (allEntries.length > 0 ? Math.min(...allEntries.map(e => new Date(e.timestamp).getTime())) : null) : null,
      maxTimestamp: shouldIncludeTimeSuggestion ? (allEntries.length > 0 ? Math.max(...allEntries.map(e => new Date(e.timestamp).getTime())) : null) : null,
      batchMode: true,
      batchCount: batches.length
    };
    
    // 缓存结果
    try {
      await cacheManager.set(cacheKey, result, cacheManager.cacheConfig.searchCacheTTL);
      console.log(`[缓存存储] 分批查询结果已缓存: ${cacheKey}`);
    } catch (cacheError) {
      console.warn('缓存存储失败:', cacheError.message);
    }
    
    return res.json(result);
  } catch (error) {
    console.error('[分批查询] 执行失败:', error);
    throw error;
  }
};

// 获取可视化数据（专门用于图表生成，已迁移到 ClickHouse）
const getVisualizationData = async (req, res) => {
  try {
    const { 
      log_ids, 
      error_code, 
      parameter_index, // 1, 2, 3, 4
      subsystem,
      filters,
      start_time,
      end_time,
      search
    } = req.query;
    
    if (!log_ids || !error_code || !parameter_index) {
      return res.status(400).json({ 
        message: req.t('log.analysis.failed') 
      });
    }
    
    const paramIndex = parseInt(parameter_index) - 1; // 转换为0,1,2,3
    if (paramIndex < 0 || paramIndex > 3) {
      return res.status(400).json({ 
        message: req.t('log.analysis.failed') 
      });
    }
    
    // 解析日志ID
    const requestedLogIds = String(log_ids)
      .split(',')
      .map(id => parseInt(id.trim(), 10))
      .filter(n => Number.isInteger(n) && n > 0);

    if (!requestedLogIds || requestedLogIds.length === 0) {
      return res.status(400).json({
        message: req.t('log.analysis.failed')
      });
    }

    // 权限控制：普通用户只能查看自己的日志（基于 MySQL logs 元数据）
    let allowedLogIds = [...requestedLogIds];
    if (req.user && req.user.role_id) {
      const userRole = req.user.role_id;
      if (userRole === 3) { // 普通用户
      const userLogs = await Log.findAll({
          where: { uploader_id: req.user.id, id: { [Op.in]: requestedLogIds } },
        attributes: ['id']
      });
        const userLogIds = userLogs.map(log => log.id);
        
        allowedLogIds = requestedLogIds.filter(id => userLogIds.includes(id));
        if (allowedLogIds.length === 0) {
        return res.status(403).json({ message: req.t('log.parse.permissionDenied') });
        }
      }
    }

    // 基于允许的日志ID获取当前版本（最新版本）
    const logs = await Log.findAll({
      where: { id: { [Op.in]: allowedLogIds } },
      attributes: ['id', 'version']
    });

    const logVersionPairs = logs.map(l => [
      Number(l.id),
      Number(Number.isInteger(l.version) ? l.version : 1)
    ]);

    if (!logVersionPairs || logVersionPairs.length === 0) {
      return res.status(404).json({ message: req.t('log.visualization.noDataFound') });
    }

    const client = getClickHouseClient();
    const conditions = [];
    const params = {};

    // (log_id, version) 组合：只查询最新版本的数据
    const tupleList = logVersionPairs
      .map(([logId, version]) => `(${Number(logId)}, ${Number(version)})`)
      .join(', ');
    conditions.push(`(log_id, version) IN (${tupleList})`);

    // 故障码精确匹配
    conditions.push('error_code = {error_code:String}');
    params.error_code = error_code;

    // 时间范围
    if (start_time) {
      conditions.push('timestamp >= {start_time:DateTime}');
      // 使用本地时间格式，与存储格式保持一致（YYYY-MM-DD HH:mm:ss，无时区）
      params.start_time = formatTimeForClickHouse(start_time);
    }
    if (end_time) {
      conditions.push('timestamp <= {end_time:DateTime}');
      // 使用本地时间格式，与存储格式保持一致
      params.end_time = formatTimeForClickHouse(end_time);
    }

    // 关键字搜索（与批量查询保持一致）
    if (search && String(search).trim().length > 0) {
      const raw = String(search).trim();
      const hexMatch = /^[0-9a-fA-F]{4,6}$/.test(raw);
      if (hexMatch) {
        conditions.push('code4 = {search_code4:String}');
        params.search_code4 = '0X' + raw.slice(-4).toUpperCase();
      } else {
        conditions.push(
          '(positionCaseInsensitive(explanation, {search_kw:String}) > 0 OR error_code LIKE {search_like:String})'
        );
        params.search_kw = raw;
        params.search_like = `%${raw}%`;
      }
    }

    // 高级搜索表达式 filters：下推到 ClickHouse（与批量查询保持一致的字段和语义）
    const parseAdvancedFilters = (raw) => {
      if (!raw) return null;
      let parsed = raw;
      if (typeof raw === 'string') {
        try {
          parsed = JSON.parse(raw);
        } catch {
          return null;
        }
      }
      return parsed;
    };

    const advancedFilters = parseAdvancedFilters(filters);

    if (advancedFilters) {
      const allowedFields = new Set([
        'timestamp',
        'error_code',
        'param1',
        'param2',
        'param3',
        'param4',
        'explanation'
      ]);

      let advParamIndex = 0;
      const makeParam = (base, chType, value) => {
        const name = `${base}_${advParamIndex++}`;
        params[name] = value;
        return `{${name}:${chType}}`;
      };

      const buildAdvancedExpr = (node) => {
        if (!node) return null;

        // 数组：默认 AND 连接
        if (Array.isArray(node)) {
          const parts = node.map(child => buildAdvancedExpr(child)).filter(Boolean);
          if (parts.length === 0) return null;
          return `(${parts.join(' AND ')})`;
        }

        // 叶子条件
        if (node.field && node.operator) {
          const field = String(node.field);
          const op = String(node.operator || '').toLowerCase();
          const value = node.value;

          if (!allowedFields.has(field)) return null;
          if (value === undefined || value === null || value === '') return null;

          // timestamp 字段
          if (field === 'timestamp') {
            const toDate = (v) => {
              if (v instanceof Date) return v;
              const d = new Date(v);
              return Number.isNaN(d.getTime()) ? null : d;
            };

            if (op === 'between') {
              if (!Array.isArray(value) || value.length !== 2) return null;
              const a = toDate(value[0]);
              const b = toDate(value[1]);
              if (!a || !b) return null;
              const p1 = makeParam('adv_ts_from', 'DateTime', a);
              const p2 = makeParam('adv_ts_to', 'DateTime', b);
              return `(timestamp BETWEEN ${p1} AND ${p2})`;
            }

            const d = toDate(value);
            if (!d) return null;
            const p = makeParam('adv_ts', 'DateTime', d);

            switch (op) {
              case '=':
              case '==':
                return `timestamp = ${p}`;
              case '!=':
              case '<>':
                return `timestamp != ${p}`;
              case '>':
                return `timestamp > ${p}`;
              case '>=':
                return `timestamp >= ${p}`;
              case '<':
                return `timestamp < ${p}`;
              case '<=':
                return `timestamp <= ${p}`;
              default:
                return null;
            }
          }

          // error_code 字段
          if (field === 'error_code') {
            const p = makeParam('adv_ec', 'String', String(value));
            switch (op) {
              case '=':
                return `error_code = ${p}`;
              case '!=':
              case '<>':
                return `error_code != ${p}`;
              case 'contains':
              case 'like':
                return `positionCaseInsensitive(error_code, ${p}) > 0`;
              case 'regex':
                return `match(error_code, ${p})`;
              case 'startswith':
                return `startsWith(error_code, ${p})`;
              case 'endswith':
                return `endsWith(error_code, ${p})`;
              default:
                return null;
            }
          }

          // 数值参数 param1-4：底层为 String，这里转换为 Float64
          if (field === 'param1' || field === 'param2' || field === 'param3' || field === 'param4') {
            const colExpr = `toFloat64OrNull(${field})`;
            const toNum = (v) => {
              const n = Number(v);
              return Number.isFinite(n) ? n : null;
            };

            if (op === 'between') {
              if (!Array.isArray(value) || value.length !== 2) return null;
              const a = toNum(value[0]);
              const b = toNum(value[1]);
              if (a === null || b === null) return null;
              const p1 = makeParam(`adv_${field}_from`, 'Float64', a);
              const p2 = makeParam(`adv_${field}_to`, 'Float64', b);
              return `(${colExpr} >= ${p1} AND ${colExpr} <= ${p2})`;
            }

            const n = toNum(value);
            if (n === null) return null;
            const p = makeParam(`adv_${field}`, 'Float64', n);

            switch (op) {
              case '=':
                return `${colExpr} = ${p}`;
              case '!=':
              case '<>':
                return `${colExpr} != ${p}`;
              case '>':
                return `${colExpr} > ${p}`;
              case '>=':
                return `${colExpr} >= ${p}`;
              case '<':
                return `${colExpr} < ${p}`;
              case '<=':
                return `${colExpr} <= ${p}`;
              default:
                return null;
            }
          }

          // explanation 字段：只支持 contains / like
          if (field === 'explanation') {
            const p = makeParam('adv_expl', 'String', String(value));
            if (op === 'contains' || op === 'like') {
              return `positionCaseInsensitive(explanation, ${p}) > 0`;
            }
            return null;
          }

          return null;
        }

        // 分组节点
        if (node.conditions && (node.logic === 'AND' || node.logic === 'OR')) {
          const childExprs = node.conditions
            .map(child => buildAdvancedExpr(child))
            .filter(Boolean);
          if (childExprs.length === 0) return null;
          const joiner = node.logic === 'OR' ? ' OR ' : ' AND ';
          return `(${childExprs.join(joiner)})`;
        }

        return null;
      };

      const advancedWhereSql = buildAdvancedExpr(advancedFilters);
      if (advancedWhereSql) {
        conditions.push(advancedWhereSql);
      }
    }

    const whereSql = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    console.log('[可视化查询] 使用 ClickHouse，log_ids:', allowedLogIds.join(','), 'paramIndex:', paramIndex + 1);

    // 先查询时间范围（首次和末次出现时间）
    const rangeQuery = `
        SELECT 
        MIN(timestamp) AS startTime,
        MAX(timestamp) AS endTime
        FROM log_entries
        ${whereSql}
    `;

    const rangeResult = await client.query({
      query: rangeQuery,
      query_params: params,
      format: 'JSONEachRow'
    });
    const rangeRows = await rangeResult.json();
    const timeRangeRow = rangeRows[0] || {};
    
    if (!timeRangeRow.startTime || !timeRangeRow.endTime) {
      return res.status(404).json({ message: req.t('log.visualization.noDataFound') });
    }
    
    // 再查询该故障码的所有数据（在同一条件下）
    const paramCol = `param${paramIndex + 1}`;
    const dataQuery = `
        SELECT 
          timestamp,
        ${paramCol} AS param_value
        FROM log_entries
        ${whereSql}
        ORDER BY timestamp ASC
    `;

    const dataResult = await client.query({
      query: dataQuery,
      query_params: params,
      format: 'JSONEachRow'
    });
    const dataRows = await dataResult.json();
    
    // 处理数据格式
    const chartData = (dataRows || []).map(entry => {
      const ts = entry.timestamp ? new Date(entry.timestamp).getTime() : NaN;
      const timestamp = Number.isNaN(ts) ? null : ts;
      const paramRaw = entry.param_value;
      const paramValue = paramRaw != null && paramRaw !== '' ? parseFloat(paramRaw) : 0;
      return [timestamp, Number.isFinite(paramValue) ? paramValue : 0];
    }).filter(([ts]) => ts !== null);
    
    // 查询故障码参数含义
    let paramName = `参数${paramIndex + 1}`;
    let chartTitle = `参数${paramIndex + 1}`;
    
    if (subsystem) {
      try {
        // 从error_code中提取故障码
        let codeToQuery = error_code;
        if (error_code.length >= 5) {
          codeToQuery = '0X' + error_code.slice(-4);
        }
        
        const ErrorCode = require('../models/error_code');
        const errorCodeRecord = await ErrorCode.findOne({
          where: { 
            code: codeToQuery, 
            subsystem: subsystem 
          }
        });
        
        if (errorCodeRecord) {
          const paramFields = ['param1', 'param2', 'param3', 'param4'];
          const paramField = paramFields[paramIndex];
          const actualParamName = errorCodeRecord[paramField];
          
          if (actualParamName && actualParamName.trim()) {
            paramName = actualParamName.trim();
            chartTitle = actualParamName.trim();
          }
        }
      } catch (error) {
        console.warn('查询故障码参数含义失败:', error.message);
      }
    }
    
    res.json({
      success: true,
      data: {
        chartData,
        timeRange: {
          startTime: timeRangeRow.startTime,
          endTime: timeRangeRow.endTime
        },
        paramName,
        chartTitle,
        errorCode: error_code,
        parameterIndex: parameter_index,
        dataCount: chartData.length
      }
    });
    
  } catch (err) {
    console.error('获取可视化数据失败:', err);
    res.status(500).json({ message: req.t('log.visualization.getDataFailed'), error: err.message });
  }
};

// 清理卡死的日志
const cleanupStuckLogs = async (req, res) => {
  try {
    console.log('🔍 开始清理卡死的日志...');
    
    // 查找卡在解析中状态的日志
    const stuckLogs = await Log.findAll({
      where: {
        status: ['parsing', 'uploading', 'queued', 'decrypting', 'deleting', 'delete_failed']
      },
      order: [['upload_time', 'ASC']]
    });
    
    console.log(`📊 发现 ${stuckLogs.length} 个卡死的日志`);
    
    if (stuckLogs.length === 0) {
      return res.json({ 
        success: true, 
        message: req.t('log.cleanup.noStuckLogs'),
        cleanedCount: 0,
        failedCount: 0
      });
    }
    
    // 清理策略
    const cleanupStrategy = {
      parsing: 'parse_failed',      // 解析中 -> 解析失败
      uploading: 'upload_failed',   // 上传中 -> 上传失败
      queued: 'queue_failed',       // 队列中 -> 队列失败
      decrypting: 'decrypt_failed', // 解密中 -> 解密失败
      deleting: 'delete_failed',    // 删除中 -> 删除失败
      delete_failed: 'failed'       // 删除失败 -> 通用失败（可删除）
    };
    
    let cleanedCount = 0;
    let failedCount = 0;
    const cleanedLogs = [];
    
    for (const log of stuckLogs) {
      try {
        const oldStatus = log.status;
        const newStatus = cleanupStrategy[log.status] || 'failed';
        
        // 更新日志状态
        await log.update({
          status: newStatus,
          parse_time: new Date()
        });
        
        // 如果是解析中的日志，清理相关的日志条目
        if (oldStatus === 'parsing') {
          try {
            await LogEntry.destroy({ where: { log_id: log.id } });
            console.log(`🧹 已清理日志 ${log.id} 的条目数据`);
          } catch (entryError) {
            console.warn(`⚠️ 清理日志 ${log.id} 条目数据失败:`, entryError.message);
          }
        }
        
        cleanedLogs.push({
          id: log.id,
          originalName: log.original_name,
          deviceId: log.device_id,
          oldStatus,
          newStatus
        });
        
        console.log(`✅ 日志 ${log.id} 状态已更新: ${oldStatus} -> ${newStatus}`);
        cleanedCount++;
        
      } catch (error) {
        console.error(`❌ 清理日志 ${log.id} 失败:`, error.message);
        failedCount++;
      }
    }
    
    console.log(`📊 清理完成: 成功 ${cleanedCount} 个, 失败 ${failedCount} 个`);
    
    res.json({
      success: true,
      message: req.t('log.cleanup.cleanupComplete', { cleanedCount, failedCount }),
      cleanedCount,
      failedCount,
      cleanedLogs
    });
    
  } catch (error) {
    console.error('❌ 清理卡死日志失败:', error);
    res.status(500).json({
      success: false,
      message: req.t('log.cleanup.cleanupFailed'),
      error: error.message
    });
  }
};

// 获取卡死日志统计
const getStuckLogsStats = async (req, res) => {
  try {
    // 获取各状态的日志数量
    const stats = await Log.findAll({
      attributes: [
        'status',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    });
    
    // 检查卡死日志
    const stuckLogs = await Log.findAll({
      where: {
        status: ['parsing', 'uploading', 'queued', 'decrypting', 'deleting', 'delete_failed']
      },
      attributes: ['id', 'original_name', 'device_id', 'status', 'upload_time'],
      order: [['upload_time', 'ASC']]
    });
    
    // 计算卡死时长
    const now = Date.now();
    const stuckLogsWithAge = stuckLogs.map(log => {
      const age = log.upload_time ? Math.round((now - new Date(log.upload_time).getTime()) / 1000 / 60) : 0;
      return {
        id: log.id,
        originalName: log.original_name,
        deviceId: log.device_id,
        status: log.status,
        uploadTime: log.upload_time,
        stuckMinutes: age
      };
    });
    
    res.json({
      success: true,
      data: {
        statusStats: stats,
        stuckLogs: stuckLogsWithAge,
        stuckCount: stuckLogs.length
      }
    });
    
  } catch (error) {
    console.error('❌ 获取卡死日志统计失败:', error);
    res.status(500).json({
      success: false,
      message: req.t('log.cleanup.getStatsFailed'),
      error: error.message
    });
  }
};

/**
 * 批量获取日志明细（ClickHouse 版本）
 * 支持：
 *  - 按 log_ids 过滤（必需）
 *  - 时间范围过滤 start_time / end_time
 *  - 关键字搜索 search（故障码或释义）
 *  - 分析分类过滤 analysis_category_ids（独立筛选，在数据库层执行）
 *    通过 code_category_map 或 error_code_analysis_categories 表获取允许的故障码列表
 *    然后在 ClickHouse WHERE 子句中过滤 (subsystem_char, code4) 组合
 *  - 高级搜索表达式 filters（下推到 ClickHouse，在 WHERE 子句中构建表达式，独立于分析等级）
 */
const getBatchLogEntriesClickhouse = async (req, res) => {
  try {
    const {
      log_ids,
      search,
      error_code,
      start_time,
      end_time,
      page = 1,
      limit = 100,
      filters,
      analysis_category_ids
    } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = Math.min(parseInt(limit, 10) || 100, 1000);
    const offset = (pageNum - 1) * limitNum;

    // 若未传时间范围且有日志ID，前端会根据 min/max 自动回填建议范围
    const shouldIncludeTimeSuggestion = !start_time && !end_time;

    // 解析日志 ID
    let requestedLogIds = null;
    if (log_ids) {
      requestedLogIds = String(log_ids)
        .split(',')
        .map(id => parseInt(id.trim(), 10))
        .filter(n => Number.isInteger(n) && n > 0);
      if (requestedLogIds.length === 0) {
        return res.json({
          entries: [],
          total: 0,
          page: pageNum,
          limit: limitNum,
          totalPages: 0,
          minTimestamp: null,
          maxTimestamp: null
        });
      }
    }

    // 权限控制：普通用户只能查看自己的日志
    if (req.user && req.user.role_id === 3) {
      const userLogs = await Log.findAll({
        where: { uploader_id: req.user.id },
        attributes: ['id']
      });
      const userLogIds = userLogs.map(log => log.id);

      if (requestedLogIds) {
        requestedLogIds = requestedLogIds.filter(id => userLogIds.includes(id));
      } else {
        requestedLogIds = userLogIds;
      }

      if (!requestedLogIds || requestedLogIds.length === 0) {
        return res.json({
          entries: [],
          total: 0,
          page: pageNum,
          limit: limitNum,
          totalPages: 0,
          minTimestamp: null,
          maxTimestamp: null
        });
      }
    }

    // 当有日志ID时，只查询每个日志当前版本（最新版本）
    let logVersionPairs = null;
    if (requestedLogIds && requestedLogIds.length > 0) {
      const logs = await Log.findAll({
        where: { id: requestedLogIds },
        attributes: ['id', 'version']
      });

      logVersionPairs = logs.map(l => [
        Number(l.id),
        Number(Number.isInteger(l.version) ? l.version : 1)
      ]);

      // 如果没有找到任何日志记录，则直接返回空结果
      if (!logVersionPairs || logVersionPairs.length === 0) {
        return res.json({
          entries: [],
          total: 0,
          page: pageNum,
          limit: limitNum,
          totalPages: 0,
          minTimestamp: null,
          maxTimestamp: null
        });
      }
    }

    const client = getClickHouseClient();
    const conditions = [];
    const params = {};

    // 按 (log_id, version) 组合过滤：确保只查询最新版本的数据
    // 注意：使用字符串拼接而不是参数化查询，因为 ClickHouse 客户端对 Array(Tuple(...)) 类型的参数解析存在问题
    if (logVersionPairs && logVersionPairs.length > 0) {
      // 构建 (log_id, version) 元组列表的 SQL 字符串
      const tupleList = logVersionPairs.map(([logId, version]) => 
        `(${Number(logId)}, ${Number(version)})`
      ).join(', ');
      conditions.push(`(log_id, version) IN (${tupleList})`);
    }

    if (error_code) {
      conditions.push('error_code LIKE {error_code:String}');
      params.error_code = `%${error_code}%`;
    }

    if (start_time) {
      conditions.push('timestamp >= {start_time:DateTime}');
      // 使用本地时间格式，与存储格式保持一致（YYYY-MM-DD HH:mm:ss，无时区）
      params.start_time = formatTimeForClickHouse(start_time);
    }
    if (end_time) {
      conditions.push('timestamp <= {end_time:DateTime}');
      // 使用本地时间格式，与存储格式保持一致
      params.end_time = formatTimeForClickHouse(end_time);
    }

    // 关键字搜索：十六进制 -> code4，否则 explanation / error_code
    if (search && String(search).trim().length > 0) {
      const raw = String(search).trim();
      const hexMatch = /^[0-9a-fA-F]{4,6}$/.test(raw);
      if (hexMatch) {
        conditions.push('code4 = {search_code4:String}');
        params.search_code4 = '0X' + raw.slice(-4).toUpperCase();
      } else {
        conditions.push(
          '(positionCaseInsensitive(explanation, {search_kw:String}) > 0 OR error_code LIKE {search_like:String})'
        );
        params.search_kw = raw;
        params.search_like = `%${raw}%`;
      }
    }

    // 分析分类过滤（独立于高级搜索，在数据库层执行）
    // 通过 code_category_map 或 error_code_analysis_categories 表获取允许的故障码列表
    // 然后在 ClickHouse WHERE 子句中过滤 (subsystem_char, code4) 组合
    if (analysis_category_ids) {
      const ids = Array.isArray(analysis_category_ids)
        ? analysis_category_ids.map(v => parseInt(String(v), 10)).filter(Number.isInteger)
        : String(analysis_category_ids)
            .split(',')
            .map(s => parseInt(s.trim(), 10))
            .filter(Number.isInteger);

      if (ids.length > 0) {
        const allowList = await getAllowCodesForCategories(ids);
        if (!allowList || allowList.length === 0) {
          return res.json({
            entries: [],
            total: 0,
            page: pageNum,
            limit: limitNum,
            totalPages: 0,
            minTimestamp: null,
            maxTimestamp: null
          });
        }

        const catConds = [];
        let groupIndex = 0;
        for (const grp of allowList) {
          if (!grp || !grp.subsystem_char || !Array.isArray(grp.codes) || grp.codes.length === 0) continue;
          const pName = `cat_codes_${groupIndex}`;
          const sName = `cat_subsystem_${groupIndex}`;
          catConds.push(`(subsystem_char = {${sName}:String} AND code4 IN {${pName}:Array(String)})`);
          params[sName] = grp.subsystem_char;
          params[pName] = grp.codes;
          groupIndex += 1;
        }

        if (catConds.length > 0) {
          conditions.push(`(${catConds.join(' OR ')})`);
        }
      }
    }

    // ---------- 高级搜索表达式 filters：下推到 ClickHouse ----------
    const parseAdvancedFilters = (raw) => {
      if (!raw) return null;
      let parsed = raw;
      if (typeof raw === 'string') {
        try {
          parsed = JSON.parse(raw);
        } catch {
          return null;
        }
      }
      return parsed;
    };

    const advancedFilters = parseAdvancedFilters(filters);

    if (advancedFilters) {
      const allowedFields = new Set([
        'timestamp',
        'error_code',
        'param1',
        'param2',
        'param3',
        'param4',
        'explanation'
      ]);

      let advParamIndex = 0;
      const makeParam = (base, chType, value) => {
        const name = `${base}_${advParamIndex++}`;
        params[name] = value;
        return `{${name}:${chType}}`;
      };

      const buildAdvancedExpr = (node) => {
        if (!node) return null;

        // 数组：默认 AND 连接
        if (Array.isArray(node)) {
          const parts = node.map(child => buildAdvancedExpr(child)).filter(Boolean);
          if (parts.length === 0) return null;
          return `(${parts.join(' AND ')})`;
        }

        // 叶子条件
        if (node.field && node.operator) {
          const field = String(node.field);
          const op = String(node.operator || '').toLowerCase();
          const value = node.value;

          if (!allowedFields.has(field)) return null;
          if (value === undefined || value === null || value === '') return null;

          // timestamp 字段
          if (field === 'timestamp') {
            const toDate = (v) => {
              if (v instanceof Date) return v;
              const d = new Date(v);
              return Number.isNaN(d.getTime()) ? null : d;
            };

            if (op === 'between') {
              if (!Array.isArray(value) || value.length !== 2) return null;
              const a = toDate(value[0]);
              const b = toDate(value[1]);
              if (!a || !b) return null;
              const p1 = makeParam('adv_ts_from', 'DateTime', a);
              const p2 = makeParam('adv_ts_to', 'DateTime', b);
              return `(timestamp BETWEEN ${p1} AND ${p2})`;
            }

            const d = toDate(value);
            if (!d) return null;
            const p = makeParam('adv_ts', 'DateTime', d);

            switch (op) {
              case '=':
              case '==':
                return `timestamp = ${p}`;
              case '!=':
              case '<>':
                return `timestamp != ${p}`;
              case '>':
                return `timestamp > ${p}`;
              case '>=':
                return `timestamp >= ${p}`;
              case '<':
                return `timestamp < ${p}`;
              case '<=':
                return `timestamp <= ${p}`;
              default:
                return null;
            }
          }

          // error_code 字段
          if (field === 'error_code') {
            const p = makeParam('adv_ec', 'String', String(value));
            switch (op) {
              case '=':
                return `error_code = ${p}`;
              case '!=':
              case '<>':
                return `error_code != ${p}`;
              case 'contains':
              case 'like':
                return `positionCaseInsensitive(error_code, ${p}) > 0`;
              case 'regex':
                return `match(error_code, ${p})`;
              case 'startswith':
                return `startsWith(error_code, ${p})`;
              case 'endswith':
                return `endsWith(error_code, ${p})`;
              default:
                return null;
            }
          }

          // 数值参数 param1-4：底层为 String，这里转换为 Float64
          if (field === 'param1' || field === 'param2' || field === 'param3' || field === 'param4') {
            const colExpr = `toFloat64OrNull(${field})`;
            const toNum = (v) => {
              const n = Number(v);
              return Number.isFinite(n) ? n : null;
            };

            if (op === 'between') {
              if (!Array.isArray(value) || value.length !== 2) return null;
              const a = toNum(value[0]);
              const b = toNum(value[1]);
              if (a === null || b === null) return null;
              const p1 = makeParam(`adv_${field}_from`, 'Float64', a);
              const p2 = makeParam(`adv_${field}_to`, 'Float64', b);
              return `(${colExpr} >= ${p1} AND ${colExpr} <= ${p2})`;
            }

            const n = toNum(value);
            if (n === null) return null;
            const p = makeParam(`adv_${field}`, 'Float64', n);

            switch (op) {
              case '=':
                return `${colExpr} = ${p}`;
              case '!=':
              case '<>':
                return `${colExpr} != ${p}`;
              case '>':
                return `${colExpr} > ${p}`;
              case '>=':
                return `${colExpr} >= ${p}`;
              case '<':
                return `${colExpr} < ${p}`;
              case '<=':
                return `${colExpr} <= ${p}`;
              default:
                return null;
            }
          }

          // explanation 字段：只支持 contains / like
          if (field === 'explanation') {
            const p = makeParam('adv_expl', 'String', String(value));
            if (op === 'contains' || op === 'like') {
              return `positionCaseInsensitive(explanation, ${p}) > 0`;
            }
            return null;
          }

          return null;
        }

        // 分组节点
        if (node.conditions && (node.logic === 'AND' || node.logic === 'OR')) {
          const childExprs = node.conditions
            .map(child => buildAdvancedExpr(child))
            .filter(Boolean);
          if (childExprs.length === 0) return null;
          const joiner = node.logic === 'OR' ? ' OR ' : ' AND ';
          return `(${childExprs.join(joiner)})`;
        }

        return null;
      };

      const advancedWhereSql = buildAdvancedExpr(advancedFilters);
      if (advancedWhereSql) {
        conditions.push(advancedWhereSql);
      }
    }

    const whereSqlForCount = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    // ClickHouse 已经执行了高级筛选，直接按页查询
    const queryLimit = limitNum;
    const queryOffset = offset;

    // 先执行 COUNT 和 MIN/MAX 查询（用于计算总页数和时间范围）
    const countQuery = shouldIncludeTimeSuggestion
      ? `
        SELECT 
          count() as total,
          min(timestamp) as min_ts,
          max(timestamp) as max_ts
        FROM log_entries
        ${whereSqlForCount}
      `
      : `
        SELECT count() as total
        FROM log_entries
        ${whereSqlForCount}
      `;

    // 过滤掉分类参数，避免日志过长
    const filteredCountParams = { ...params };
    Object.keys(filteredCountParams).forEach(key => {
      if (key.startsWith('cat_codes_') || key.startsWith('cat_subsystem_')) {
        delete filteredCountParams[key];
      }
    });
    console.log('[ClickHouse] 执行 COUNT 查询 SQL:', countQuery);
    if (Object.keys(filteredCountParams).length > 0) {
      console.log('[ClickHouse] COUNT 查询参数 (已过滤分类参数):', filteredCountParams);
    }

    const countResult = await client.query({
      query: countQuery,
      query_params: params,
      format: 'JSONEachRow'
    });
    const countRows = await countResult.json();
    const total = countRows[0]?.total || 0;
    const minTimestampFromCount = shouldIncludeTimeSuggestion ? (countRows[0]?.min_ts || null) : null;
    const maxTimestampFromCount = shouldIncludeTimeSuggestion ? (countRows[0]?.max_ts || null) : null;

    // 若前端未传 start/end，则用 COUNT 查询得到的 min/max 作为“有效时间范围”下推到数据查询，
    // 便于按分区裁剪（PARTITION BY toYYYYMM(timestamp)），降低扫全分区/冷数据的概率。
    const dataConditions = [...conditions];
    const dataParams = { ...params };
    if (!start_time && !end_time && minTimestampFromCount && maxTimestampFromCount) {
      dataConditions.push('timestamp >= {auto_start_time:DateTime}');
      dataConditions.push('timestamp <= {auto_end_time:DateTime}');
      dataParams.auto_start_time = minTimestampFromCount;
      dataParams.auto_end_time = maxTimestampFromCount;
    }
    const whereSqlForData = dataConditions.length ? 'WHERE ' + dataConditions.join(' AND ') : '';

    // 执行数据查询（分页）
    // 注意：LIMIT 和 OFFSET 直接使用数值，因为 ClickHouse 参数化查询对 LIMIT/OFFSET 支持可能有问题
    const baseQuery = `
      SELECT
        log_id,
        timestamp,
        error_code,
        param1,
        param2,
        param3,
        param4,
        explanation,
        version,
        row_index
      FROM log_entries
      ${whereSqlForData}
      ORDER BY timestamp ASC, log_id ASC, row_index ASC
      LIMIT ${queryLimit} OFFSET ${queryOffset}
    `;

    // 过滤掉分类参数，避免日志过长
    const filteredParams = { ...params };
    Object.keys(filteredParams).forEach(key => {
      if (key.startsWith('cat_codes_') || key.startsWith('cat_subsystem_')) {
        delete filteredParams[key];
      }
    });
    console.log('[ClickHouse] 执行批量查询 SQL:', baseQuery);
    if (Object.keys(filteredParams).length > 0) {
      console.log('[ClickHouse] 查询参数 (已过滤分类参数):', filteredParams);
    }
    console.log('[ClickHouse] 分页参数 - page:', pageNum, 'limit:', limitNum, 'offset:', queryOffset);

    const result = await client.query({
      query: baseQuery,
      query_params: dataParams,
      format: 'JSONEachRow'
    });
    const rows = await result.json();
    
    console.log('[ClickHouse] 查询返回行数:', rows.length, '期望:', limitNum, 'offset:', queryOffset);

    // ClickHouse 已完成所有过滤，直接使用查询结果作为当前页
    const pageEntries = rows;

    const totalPages = total > 0 ? Math.ceil(total / limitNum) : 0;

    // 计算时间范围（用于前端时间选择器建议）
    // 优先使用 COUNT 查询的结果（更准确），否则使用当前页数据的时间范围
    let minTimestamp = minTimestampFromCount;
    let maxTimestamp = maxTimestampFromCount;
    
    if (shouldIncludeTimeSuggestion && !minTimestamp && !maxTimestamp && rows.length > 0) {
      // 如果没有从 COUNT 查询获取到时间范围，使用当前查询结果的时间范围
      const timestamps = rows.map(r => new Date(r.timestamp).getTime()).filter(t => !Number.isNaN(t));
      if (timestamps.length > 0) {
        minTimestamp = new Date(Math.min(...timestamps)).toISOString();
        maxTimestamp = new Date(Math.max(...timestamps)).toISOString();
      }
    }

    return res.json({
      entries: pageEntries,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      minTimestamp: shouldIncludeTimeSuggestion ? minTimestamp : null,
      maxTimestamp: shouldIncludeTimeSuggestion ? maxTimestamp : null
    });
  } catch (err) {
    console.error('批量获取日志明细失败 (ClickHouse):', err);
    res.status(500).json({ message: req.t('log.listFailed'), error: err.message });
  }
};

module.exports = {
  getLogs,
  getLogsByDevice,
  getLogTimeFilters,
  uploadLog,
  parseLog,
  reparseLog,
  batchReparseLogs,
  exportBatchLogEntriesCSV,
  getLogEntries,
  getBatchLogEntries,
  getBatchLogEntriesClickhouse,
  getLogStatistics,
  downloadLog,
  deleteLog,
  autoFillDeviceId,
  autoFillKey,
  batchDeleteLogs,
  batchDownloadLogs,
  analyzeSurgeryData,
  getSearchTemplates,
  importSearchTemplates,
  getQueueStatus,
  executeBatchQuery,
  getVisualizationData,
  cleanupStuckLogs,
  getStuckLogsStats
}; 