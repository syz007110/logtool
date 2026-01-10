const { Op, Sequelize } = require('sequelize');
const Surgery = require('../models/surgery');
const { normalizePagination, MAX_PAGE_SIZE } = require('../constants/pagination');
// const LogEntry = require('../models/log_entry');
// [MIGRATION] LogEntry migrated to ClickHouse. Mocking Sequelize model to prevent crash.
const LogEntry = {
  findAll: async () => { console.warn('[MIGRATION] LogEntry.findAll called but table migrated to ClickHouse'); return []; },
  findOne: async () => { console.warn('[MIGRATION] LogEntry.findOne called but table migrated to ClickHouse'); return null; },
  findAndCountAll: async () => { console.warn('[MIGRATION] LogEntry.findAndCountAll called'); return { count: 0, rows: [] }; },
  count: async () => { return 0; },
  destroy: async () => { return 0; },
  bulkCreate: async () => { return []; }
};
const Log = require('../models/log');
const Device = require('../models/device');

// 将Date对象转换为原始时间字符串（不进行时区转换）
function formatRawDateTime(dateLike) {
  if (!dateLike) return null;
  try {
    // 如果已经是字符串格式，直接返回
    if (typeof dateLike === 'string') {
      // 如果是ISO格式（带Z），去掉Z并按原始时间解析
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dateLike)) {
        const withoutZ = dateLike.replace('Z', '').replace('T', ' ');
        const [datePart, timePart] = withoutZ.split(' ');
        if (datePart && timePart) {
          const [year, month, day] = datePart.split('-').map(Number);
          const [hour, minute, second] = timePart.split(':').map(Number);
          const d = new Date(year, month - 1, day, hour, minute, second || 0);
          const pad = (n) => String(n).padStart(2, '0');
          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        }
      }
      // 如果已经是原始时间格式，直接返回
      if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(dateLike)) {
        return dateLike;
      }
    }
    
    // 如果是Date对象，提取原始时间
    const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
    if (isNaN(date.getTime())) return null;
    
    // 使用本地时间方法（不是UTC），按原始时间提取
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  } catch (_) {
    return null;
  }
}

// 转换Sequelize模型实例为纯对象，并将时间字段转换为原始时间字符串
function convertSurgeryToPlain(surgery) {
  if (!surgery) return null;
  
  // 使用 get({ plain: true }) 获取纯对象
  const plain = surgery.get ? surgery.get({ plain: true }) : surgery;
  
  // 转换时间字段
  const converted = { ...plain };
  if (converted.start_time) {
    converted.start_time = formatRawDateTime(converted.start_time);
  }
  if (converted.end_time) {
    converted.end_time = formatRawDateTime(converted.end_time);
  }
  
  // 递归转换structured_data中的时间字段
  if (converted.structured_data && typeof converted.structured_data === 'object') {
    converted.structured_data = convertStructuredDataTimes(converted.structured_data);
  }
  
  return converted;
}

// 递归转换structured_data中的所有时间字段
function convertStructuredDataTimes(data) {
  if (!data || typeof data !== 'object') return data;
  
  if (Array.isArray(data)) {
    return data.map(item => convertStructuredDataTimes(item));
  }
  
  const converted = { ...data };
  
  for (const [key, value] of Object.entries(converted)) {
    const lowerKey = String(key).toLowerCase();
    // 检查是否是时间字段
    if (lowerKey.includes('time') || lowerKey.includes('timestamp')) {
      if (value) {
        converted[key] = formatRawDateTime(value);
      }
    } else if (value && typeof value === 'object') {
      // 递归处理嵌套对象
      converted[key] = convertStructuredDataTimes(value);
    }
  }
  
  return converted;
}

// 列表：支持 device_id 模糊筛选与分页
exports.listSurgeries = async (req, res) => {
  try {
    const { device_id, page = 1, limit = 20, type, time_range_start, time_range_end } = req.query;
    const where = {};
    if (device_id) {
      // 精确匹配包含该设备编号的手术（PostgreSQL ARRAY contains）
      where.device_ids = { [Op.contains]: [String(device_id)] };
    }

    if (type === 'fault') {
      where.has_fault = { [Op.is]: true };
    } else if (type === 'remote') {
      where.is_remote = true;
    }

    const parseTimePrefixToDate = (value, isEnd = false) => {
      if (!value || typeof value !== 'string') return null;
      const normalized = value.trim();
      const match = normalized.match(/^(\d{4})(\d{2})(\d{2})(\d{2})?$/);
      if (!match) return null;
      const [, yearStr, monthStr, dayStr, hourStr] = match;
      const year = Number(yearStr);
      const month = Number(monthStr);
      const day = Number(dayStr);
      if ([year, month, day].some(num => Number.isNaN(num))) return null;
      let hour = 0;
      let minute = 0;
      let second = 0;
      let millisecond = 0;
      if (hourStr != null) {
        hour = Number(hourStr);
        if (Number.isNaN(hour)) hour = 0;
      }
      if (isEnd) {
        if (hourStr == null) {
          hour = 23;
        }
        minute = 59;
        second = 59;
        millisecond = 999;
      }
      const iso = `${yearStr}-${monthStr}-${dayStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}Z`;
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return null;
      if (millisecond && minute === 59 && second === 59) {
        date.setUTCMilliseconds(millisecond);
      }
      return date;
    };

    const startDate = parseTimePrefixToDate(time_range_start, false);
    const endDate = parseTimePrefixToDate(time_range_end, true);
    if (startDate && endDate) {
      where.start_time = { [Op.between]: [startDate, endDate] };
    } else if (startDate) {
      where.start_time = { [Op.gte]: startDate };
    } else if (endDate) {
      where.start_time = { [Op.lte]: endDate };
    }

    const { page: pageNum, limit: limitNum } = normalizePagination(page, limit, MAX_PAGE_SIZE.STANDARD);
    const offset = (pageNum - 1) * limitNum;

    const { rows, count } = await Surgery.findAndCountAll({
      where,
      order: [['start_time', 'DESC']],
      limit: limitNum,
      offset
    });

    // 附带医院名称（仅基于 surgery.device_ids 与设备表关联，不额外要求设备权限）
    try {
      // 收集所有出现的设备编号
      const allDeviceIds = Array.from(new Set((rows || []).flatMap(r => Array.isArray(r.device_ids) ? r.device_ids : []).filter(Boolean)));
      let deviceIdToHospital = new Map();
      if (allDeviceIds.length > 0) {
        const devices = await Device.findAll({ where: { device_id: { [Op.in]: allDeviceIds } }, attributes: ['device_id', 'hospital'] });
        deviceIdToHospital = new Map(devices.map(d => [d.device_id, d.hospital || null]));
      }

      // 为每条手术记录附加 hospital_names（数组）与 hospital_name（首个非空）
      rows.forEach(r => {
        const ids = Array.isArray(r.device_ids) ? r.device_ids : [];
        const hospitals = ids.map(id => deviceIdToHospital.get(id) || null).filter(h => h);
        // 注意：直接修改实例不会丢失字段；返回时序列化为JSON
        r.setDataValue('hospital_names', hospitals);
        r.setDataValue('hospital_name', hospitals.length > 0 ? hospitals[0] : null);
      });
    } catch (e) {
      // 附加失败不影响主体数据
    }

    // 转换时间字段为原始时间字符串，避免JSON序列化时的UTC转换
    const convertedRows = rows.map(row => convertSurgeryToPlain(row));
    
    res.json({ success: true, data: convertedRows, total: count, page: pageNum, limit: limitNum });
  } catch (error) {
    console.error('listSurgeries error:', error);
    res.status(500).json({ success: false, message: '获取手术数据失败', error: error.message });
  }
};

// 获取单条
exports.getSurgeryById = async (req, res) => {
  try {
    const { id: rawId } = req.params;
    let item = null;

    // 先尝试按主键（数值型）查找
    if (rawId && /^\d+$/.test(rawId)) {
      item = await Surgery.findByPk(Number(rawId));
    }

    // 如果主键未找到，再按 surgery_id（字符型）查找
    if (!item && rawId) {
      item = await Surgery.findOne({ where: { surgery_id: rawId } });
    }

    if (!item) {
      return res.status(404).json({ success: false, message: '未找到手术数据' });
    }

    // 转换时间字段为原始时间字符串，避免JSON序列化时的UTC转换
    const convertedItem = convertSurgeryToPlain(item);
    
    res.json({ success: true, data: convertedItem });
  } catch (error) {
    console.error('getSurgeryById error:', error);
    res.status(500).json({ success: false, message: '获取手术数据失败', error: error.message });
  }
};

// 删除
exports.deleteSurgery = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const item = await Surgery.findByPk(id);
    if (!item) return res.status(404).json({ success: false, message: '未找到手术数据' });
    await item.destroy();
    // 操作日志
    try {
      const { logOperation } = require('../utils/operationLogger');
      await logOperation({
        operation: '删除手术数据',
        description: `删除手术: ${item.surgery_id || id}`,
        user_id: req.user?.id,
        username: req.user?.username,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        details: { id, surgery_id: item.surgery_id || null }
      });
    } catch (_) {}

    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('deleteSurgery error:', error);
    res.status(500).json({ success: false, message: '删除手术数据失败', error: error.message });
  }
};

// 通过手术记录上的日志条目ID范围提取日志条目
exports.getLogEntriesByRange = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const item = await Surgery.findByPk(id);
    if (!item) return res.status(404).json({ success: false, message: '未找到手术数据' });

    const startId = item.log_entry_start_id;
    const endId = item.log_entry_end_id;
    if (!startId || !endId) {
      return res.status(400).json({ success: false, message: '该手术缺少日志条目范围' });
    }

    const entries = await LogEntry.findAll({
      where: { id: { [Op.between]: [startId, endId] } },
      order: [['timestamp', 'ASC']],
      include: [{ model: Log, as: 'Log', attributes: ['original_name', 'device_id'] }]
    });
    res.json({ success: true, entries });
  } catch (error) {
    console.error('getLogEntriesByRange error:', error);
    res.status(500).json({ success: false, message: '获取日志条目失败', error: error.message });
  }
};

// 获取按设备分组的手术数据列表（用于设备列表页）
// ⚠️ 性能优化：之前前端会循环请求所有手术数据后在内存中分组，数据量大时非常慢
// 这里改为数据库层按 device_id 分组 + 分页，只返回当前页设备汇总信息
exports.listSurgeriesByDevice = async (req, res) => {
  try {
    const { keyword } = req.query;
    const { page, limit } = normalizePagination(req.query.page, req.query.limit, MAX_PAGE_SIZE.DEVICE_GROUP);
    
    const { postgresqlSequelize } = require('../config/postgresql');
    const offset = (page - 1) * limit;

    // 关键点：surgeries 在 PostgreSQL，但 devices 在 MySQL（默认 sequelize）。
    // 所以这里不能在 PostgreSQL SQL 里直接 JOIN devices；改为：
    // 1) PostgreSQL：unnest(device_ids) 后按 device_id 分组 + 分页
    // 2) MySQL：仅查询当前页 device_id 的设备信息（hospital/device_model）并合并

    const keywordStr = (keyword || '').toString().trim();
    const keywordLower = keywordStr.toLowerCase();

    // 先在 MySQL devices 表里找出“医院/设备号匹配 keyword”的 device_id（用于补充医院筛选）
    // 说明：仅用于过滤/补齐当前页设备信息，不在 PostgreSQL 内 JOIN devices
    let deviceIdsMatchedByMysql = [];
    if (keywordLower) {
      try {
        const like = `%${keywordLower}%`;
        const matched = await Device.findAll({
          where: {
            [Op.or]: [
              { device_id: { [Op.like]: like } },
              { hospital: { [Op.like]: like } }
            ]
          },
          attributes: ['device_id'],
          limit: 5000 // 安全上限：避免 keyword 过宽导致返回过多设备
        });
        deviceIdsMatchedByMysql = matched.map(d => d.device_id).filter(Boolean);
      } catch (e) {
        // 设备库查询失败不应影响主流程：退化为仅按 device_id 模糊匹配
        deviceIdsMatchedByMysql = [];
      }
    }

    // PostgreSQL where（针对展开后的 device_id）
    // - keyword：device_id 模糊匹配（覆盖“设备不在 MySQL 表”的情况）
    // - keyword：如果 MySQL 匹配到了医院/设备号，再把这些 device_id 也 OR 进来
    let pgParamIndex = 1;
    const pgWhereParts = [];
    const pgBinds = [];

    if (keywordLower) {
      const like = `%${keywordLower}%`;
      if (deviceIdsMatchedByMysql.length > 0) {
        pgWhereParts.push(`(LOWER(device_id) LIKE $${pgParamIndex} OR device_id = ANY($${pgParamIndex + 1}::text[]))`);
        pgBinds.push(like);
        pgBinds.push(deviceIdsMatchedByMysql);
        pgParamIndex += 2;
      } else {
        pgWhereParts.push(`LOWER(device_id) LIKE $${pgParamIndex}`);
        pgBinds.push(like);
        pgParamIndex += 1;
      }
    }

    const pgWhereSql = pgWhereParts.length ? ('WHERE ' + pgWhereParts.join(' AND ')) : '';

    // 1) 总数：设备分组后的数量（用于分页）
    const countSql = `
      WITH expanded AS (
        SELECT unnest(device_ids) AS device_id, start_time
        FROM surgeries
        WHERE device_ids IS NOT NULL AND array_length(device_ids, 1) > 0
      )
      SELECT COUNT(DISTINCT device_id) AS total
      FROM expanded
      ${pgWhereSql}
    `;
    const countRows = await postgresqlSequelize.query(countSql, {
      bind: pgBinds,
      type: Sequelize.QueryTypes.SELECT
    });
    const total = Number(countRows?.[0]?.total || 0);
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    // 2) 当前页：按 device_id 分组统计
    const dataSql = `
      WITH expanded AS (
        SELECT unnest(device_ids) AS device_id, start_time
        FROM surgeries
        WHERE device_ids IS NOT NULL AND array_length(device_ids, 1) > 0
      )
      SELECT
        device_id,
        COUNT(*) AS surgery_count,
        MAX(start_time) AS latest_surgery_time
      FROM expanded
      ${pgWhereSql}
      GROUP BY device_id
      ORDER BY latest_surgery_time DESC NULLS LAST
      LIMIT $${pgParamIndex} OFFSET $${pgParamIndex + 1}
    `;

    const dataRows = await postgresqlSequelize.query(dataSql, {
      bind: [...pgBinds, limit, offset],
      type: Sequelize.QueryTypes.SELECT
    });

    const pageDeviceIds = (dataRows || []).map(r => r.device_id).filter(Boolean);

    // MySQL：补齐当前页设备信息
    const deviceIdToInfo = new Map();
    if (pageDeviceIds.length > 0) {
      try {
        const devices = await Device.findAll({
          where: { device_id: { [Op.in]: pageDeviceIds } },
          attributes: ['device_id', 'hospital', 'device_model']
        });
        devices.forEach(d => {
          deviceIdToInfo.set(d.device_id, {
            hospital_name: d.hospital || null,
            device_model: d.device_model || null
          });
        });
      } catch (_) {
        // ignore
      }
    }

    const device_groups = (dataRows || []).map(r => {
      const info = deviceIdToInfo.get(r.device_id) || {};
      return {
        device_id: r.device_id || '未知设备',
        hospital_name: info.hospital_name || null,
        device_name: info.device_model || null,
        surgery_count: Number(r.surgery_count || 0),
        latest_surgery_time: r.latest_surgery_time || null
      };
    });

    res.json({
      success: true,
      device_groups,
      pagination: {
        current_page: page,
        page_size: limit,
        total: total,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1
      }
    });
  } catch (error) {
    console.error('listSurgeriesByDevice error:', error);
    res.status(500).json({ success: false, message: '获取设备分组手术数据失败', error: error.message });
  }
};

// 获取手术数据的时间筛选选项（年、月、日）
exports.getSurgeryTimeFilters = async (req, res) => {
  try {
    const { device_id } = req.query;
    if (!device_id) {
      return res.status(400).json({ success: false, message: 'device_id is required' });
    }

    const { postgresqlSequelize } = require('../config/postgresql');
    
    // 使用PostgreSQL的生成列 start_year, start_month, start_day
    // 注意：PostgreSQL中使用 $1, $2 等位置参数
    const query = `
      SELECT DISTINCT
        start_year AS year,
        start_month AS month,
        start_day AS day
      FROM surgeries
      WHERE $1 = ANY(device_ids)
        AND start_time IS NOT NULL
        AND start_year IS NOT NULL
      ORDER BY year DESC, month DESC, day DESC
    `;

    // PostgreSQL Sequelize的query方法
    // 注意：PostgreSQL Sequelize的query方法总是返回 [results, metadata] 格式
    const result = await postgresqlSequelize.query(query, {
      bind: [device_id]
    });

    // 处理返回值：PostgreSQL Sequelize返回 [rows, metadata]
    let rows = null;
    if (Array.isArray(result)) {
      if (result.length === 2) {
        // 标准格式：[rows, metadata]
        rows = result[0];
      } else if (result.length > 0) {
        // 可能是直接返回的数组
        rows = result;
      }
    }

    // 确保rows是数组
    if (!Array.isArray(rows)) {
      console.error('getSurgeryTimeFilters: unexpected result format', {
        resultType: typeof result,
        isArray: Array.isArray(result),
        resultLength: Array.isArray(result) ? result.length : 'N/A',
        result: result
      });
      return res.json({
        success: true,
        data: {
          years: [],
          monthsByYear: {},
          daysByYearMonth: {}
        }
      });
    }

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
    console.error('getSurgeryTimeFilters error:', error);
    return res.status(500).json({ success: false, message: '获取手术时间筛选项失败', error: error.message });
  }
};


