const SurgeryAnalyzer = require('../services/surgeryAnalyzer');

// 批量日志查看页面引入“时区转换”后，手术统计/导出也需要对 PostgreSQL 入库内容做同样的时间偏移。
// 约定：日志时间字符串（无时区后缀）按“存储时区”保存，默认 UTC+8（480 分钟）。
// 转换方式：先将 storage 时间解析到 UTC，再按目标 offset 输出为同样的无时区字符串。
const STORAGE_OFFSET_MINUTES = Number.isFinite(Number(process.env.LOG_STORAGE_OFFSET_MINUTES))
  ? Number(process.env.LOG_STORAGE_OFFSET_MINUTES)
  : 480;

function clampOffsetMinutes(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  // 合理范围：-14:00 ~ +14:00
  return Math.min(Math.max(Math.trunc(n), -14 * 60), 14 * 60);
}

function parseStorageTimeToUtcMs(storageStr) {
  const s = String(storageStr || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?/);
  if (!m) return NaN;
  const utcMs = Date.UTC(
    parseInt(m[1], 10),
    parseInt(m[2], 10) - 1,
    parseInt(m[3], 10),
    parseInt(m[4], 10),
    parseInt(m[5], 10),
    parseInt(m[6], 10) || 0,
    parseInt((m[7] || '0').padEnd(3, '0'), 10) || 0
  ) - (STORAGE_OFFSET_MINUTES * 60 * 1000);
  return utcMs;
}

function formatUtcMsToOffsetTime(utcMs, offsetMinutes) {
  if (utcMs == null || Number.isNaN(utcMs)) return null;
  const off = clampOffsetMinutes(offsetMinutes);
  if (off == null) return null;
  const ms = utcMs + off * 60 * 1000;
  const d = new Date(ms);
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${yy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function convertStorageToOffsetTimeString(storageStr, targetOffsetMinutes) {
  if (!storageStr) return storageStr;
  const off = clampOffsetMinutes(targetOffsetMinutes);
  if (off == null || off === STORAGE_OFFSET_MINUTES) return String(storageStr);
  const utcMs = parseStorageTimeToUtcMs(storageStr);
  if (!Number.isFinite(utcMs)) return String(storageStr);
  return formatUtcMsToOffsetTime(utcMs, off) || String(storageStr);
}

// 格式化为本地原始时间字符串（YYYY-MM-DD HH:mm:ss），用于顶层 start_time/end_time 预览
function formatUtcDateTime(dateLike) {
  return formatLocalTimeString(dateLike);
}

// 将时间值规范为本地时间字符串 YYYY-MM-DD HH:mm:ss（用于 structured_data 内部）
function formatLocalTimeString(dateLike) {
  if (!dateLike) return null;

  let d;
  if (dateLike instanceof Date) {
    d = dateLike;
  } else if (typeof dateLike === 'string') {
    const s = dateLike.trim();
    // 已经是期望格式，直接返回
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(s)) {
      return s;
    }
    d = new Date(s);
  } else {
    d = new Date(dateLike);
  }

  if (Number.isNaN(d.getTime())) return null;

  const pad = (n) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hour = pad(d.getHours());
  const minute = pad(d.getMinutes());
  const second = pad(d.getSeconds());
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

// 递归规范化 structured_data 内所有时间戳为本地时间字符串 YYYY-MM-DD HH:mm:ss
function normalizeStructuredDataTimestamps(node) {
  if (node == null) return node;
  if (Array.isArray(node)) {
    return node.map((item) => normalizeStructuredDataTimestamps(item));
  }
  if (typeof node === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (value == null) { out[key] = value; continue; }
      const lowerKey = String(key).toLowerCase();
      const isTimeKey = lowerKey.endsWith('time') || lowerKey.endsWith('timestamp') ||
        lowerKey === 'start_time' || lowerKey === 'end_time' || lowerKey === 'on_time' || lowerKey === 'off_time';
      if (isTimeKey && (typeof value === 'string' || typeof value === 'number' || value instanceof Date)) {
        const formatted = formatLocalTimeString(value);
        out[key] = formatted !== null ? formatted : value;
      } else {
        out[key] = normalizeStructuredDataTimestamps(value);
      }
    }
    return out;
  }
  return node;
}

// 递归对 structured_data 内时间字段做 “存储时区 -> 目标 offset” 转换
function convertStructuredDataTimeFields(node, targetOffsetMinutes) {
  const off = clampOffsetMinutes(targetOffsetMinutes);
  if (off == null || off === STORAGE_OFFSET_MINUTES) return node;
  if (node == null) return node;
  if (Array.isArray(node)) return node.map((x) => convertStructuredDataTimeFields(x, off));
  if (typeof node === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (value == null) { out[key] = value; continue; }
      const lowerKey = String(key).toLowerCase();
      const isTimeKey = lowerKey.endsWith('time') || lowerKey.endsWith('timestamp') ||
        lowerKey === 'start_time' || lowerKey === 'end_time' || lowerKey === 'on_time' || lowerKey === 'off_time';
      if (isTimeKey && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(value.trim())) {
        out[key] = convertStorageToOffsetTimeString(value, off);
      } else {
        out[key] = convertStructuredDataTimeFields(value, off);
      }
    }
    return out;
  }
  return node;
}

// 辅助：格式化时间为YYYYMMDDHHMM
function formatTimeForId(dateStr) {
  if (!dateStr) return '000000000000';
  const d = new Date(dateStr);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes())
  );
}

// 辅助：从 surgery_id 提取设备编号前缀（device_id 字符串）
function extractDeviceIdFromSurgeryId(surgeryId) {
  if (!surgeryId || typeof surgeryId !== 'string') return 'UNKNOWN';
  const parts = surgeryId.split('-');
  if (parts.length <= 1) return surgeryId;
  return parts.slice(0, parts.length - 1).join('-');
}

// 构建surgeries表行预览（去除重复字段）
function buildPostgresRowPreview(surgery, deviceId, timezoneOffsetMinutes = null) {
  let structured = surgery.postgresql_structure || null;
  if (!structured) {
    try {
      const analyzer = new SurgeryAnalyzer();
      structured = analyzer.toPostgreSQLStructure(surgery);
    } catch (_) { }
  }
  structured = normalizeStructuredDataTimestamps(structured);
  structured = convertStructuredDataTimeFields(structured, timezoneOffsetMinutes);

  const tzOff = clampOffsetMinutes(timezoneOffsetMinutes ?? surgery.timezone_offset_minutes);
  const startRaw = formatUtcDateTime(surgery.surgery_start_time);
  const endRaw = formatUtcDateTime(surgery.surgery_end_time);
  const startTime = tzOff == null ? startRaw : convertStorageToOffsetTimeString(startRaw, tzOff);
  const endTime = tzOff == null ? endRaw : convertStorageToOffsetTimeString(endRaw, tzOff);

  const postgresqlData = {
    surgery_id: surgery.surgery_id || `${deviceId || 'UNKNOWN'}-${formatTimeForId(surgery.surgery_start_time)}`,
    source_log_ids: Array.isArray(surgery.source_log_ids)
      ? surgery.source_log_ids
      : (surgery.log_id ? [surgery.log_id] : []),
    device_id: deviceId ? String(deviceId) : null,
    log_entry_start_id: surgery.log_entry_start_id || null,
    log_entry_end_id: surgery.log_entry_end_id || null,
    log_entry_start_log_id: surgery.log_entry_start_log_id || null,
    log_entry_end_log_id: surgery.log_entry_end_log_id || null,
    log_entry_ranges_by_log_id: surgery.log_entry_ranges_by_log_id || null,
    start_time: startTime,
    end_time: endTime,
    has_fault: (structured?.surgery_stats?.has_fault) ?? (surgery.has_error || false),
    is_remote: surgery.is_remote_surgery || false,
    success: (structured?.surgery_stats?.success) ?? !(surgery.has_error || false)
  };

  if (structured) {
    const cleanStructuredData = { ...structured };
    // 记录本次入库结构的时区信息（写入 JSONB，不影响 surgeries 表字段）
    cleanStructuredData.meta = {
      ...(cleanStructuredData.meta || {}),
      timezone_offset_minutes: tzOff == null ? STORAGE_OFFSET_MINUTES : tzOff,
      storage_offset_minutes: STORAGE_OFFSET_MINUTES
    };
    delete cleanStructuredData.surgery_id;
    delete cleanStructuredData.start_time;
    delete cleanStructuredData.end_time;
    delete cleanStructuredData.device_id;
    delete cleanStructuredData.device_ids;
    delete cleanStructuredData.source_log_ids;
    delete cleanStructuredData.log_entry_ranges_by_log_id;
    postgresqlData.structured_data = cleanStructuredData;
  } else {
    postgresqlData.structured_data = null;
  }

  return postgresqlData;
}

// 构建将要写入surgeries表的标准行（去除重复字段）
function buildDbRowFromSurgery(surgery, timezoneOffsetMinutes = null) {
  const devicePrefix = extractDeviceIdFromSurgeryId(surgery.surgery_id);
  let structured = surgery.postgresql_structure || null;
  if (!structured) {
    try {
      const analyzer = new SurgeryAnalyzer();
      structured = analyzer.toPostgreSQLStructure(surgery);
    } catch (_) { }
  }
  structured = normalizeStructuredDataTimestamps(structured);
  structured = convertStructuredDataTimeFields(structured, timezoneOffsetMinutes);
  const hasFault = (structured?.surgery_stats?.has_fault) ?? (surgery.has_error || false);

  const tzOff = clampOffsetMinutes(timezoneOffsetMinutes ?? surgery.timezone_offset_minutes);
  const startRaw = formatUtcDateTime(surgery.surgery_start_time);
  const endRaw = formatUtcDateTime(surgery.surgery_end_time);
  const startTime = tzOff == null ? startRaw : convertStorageToOffsetTimeString(startRaw, tzOff);
  const endTime = tzOff == null ? endRaw : convertStorageToOffsetTimeString(endRaw, tzOff);

  const postgresqlData = {
    surgery_id: surgery.surgery_id,
    source_log_ids: Array.isArray(surgery.source_log_ids)
      ? surgery.source_log_ids
      : (surgery.log_id ? [surgery.log_id] : []),
    device_id: devicePrefix ? String(devicePrefix) : null,
    log_entry_start_id: surgery.log_entry_start_id || null,
    log_entry_end_id: surgery.log_entry_end_id || null,
    log_entry_start_log_id: surgery.log_entry_start_log_id || null,
    log_entry_end_log_id: surgery.log_entry_end_log_id || null,
    log_entry_ranges_by_log_id: surgery.log_entry_ranges_by_log_id || null,
    start_time: startTime,
    end_time: endTime,
    has_fault: hasFault,
    is_remote: surgery.is_remote_surgery || false,
    success: (structured?.surgery_stats?.success) ?? !hasFault
  };

  if (structured) {
    const cleanStructuredData = { ...structured };
    cleanStructuredData.meta = {
      ...(cleanStructuredData.meta || {}),
      timezone_offset_minutes: tzOff == null ? STORAGE_OFFSET_MINUTES : tzOff,
      storage_offset_minutes: STORAGE_OFFSET_MINUTES
    };
    delete cleanStructuredData.surgery_id;
    delete cleanStructuredData.start_time;
    delete cleanStructuredData.end_time;
    delete cleanStructuredData.device_id;
    delete cleanStructuredData.device_ids;
    delete cleanStructuredData.source_log_ids;
    delete cleanStructuredData.log_entry_ranges_by_log_id;
    postgresqlData.structured_data = cleanStructuredData;
  } else {
    postgresqlData.structured_data = null;
  }

  return postgresqlData;
}

module.exports = {
  formatUtcDateTime,
  normalizeStructuredDataTimestamps,
  formatTimeForId,
  extractDeviceIdFromSurgeryId,
  buildPostgresRowPreview,
  buildDbRowFromSurgery
};


