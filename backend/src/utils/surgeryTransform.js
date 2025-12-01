const SurgeryAnalyzer = require('../services/surgeryAnalyzer');

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
function buildPostgresRowPreview(surgery, deviceId) {
  let structured = surgery.postgresql_structure || null;
  if (!structured) {
    try {
      const analyzer = new SurgeryAnalyzer();
      structured = analyzer.toPostgreSQLStructure(surgery);
    } catch (_) {}
  }
  structured = normalizeStructuredDataTimestamps(structured);

  const postgresqlData = {
    surgery_id: surgery.surgery_id || `${deviceId || 'UNKNOWN'}-${formatTimeForId(surgery.surgery_start_time)}`,
    source_log_ids: Array.isArray(surgery.source_log_ids)
      ? surgery.source_log_ids
      : (surgery.log_id ? [surgery.log_id] : []),
    device_ids: deviceId ? [String(deviceId)] : [],
    log_entry_start_id: surgery.log_entry_start_id || null,
    log_entry_end_id: surgery.log_entry_end_id || null,
    start_time: formatUtcDateTime(surgery.surgery_start_time),
    end_time: formatUtcDateTime(surgery.surgery_end_time),
    has_fault: (structured?.surgery_stats?.has_fault) ?? (surgery.has_error || false),
    is_remote: surgery.is_remote_surgery || false,
    success: (structured?.surgery_stats?.success) ?? !(surgery.has_error || false)
  };

  if (structured) {
    const cleanStructuredData = { ...structured };
    delete cleanStructuredData.surgery_id;
    delete cleanStructuredData.start_time;
    delete cleanStructuredData.end_time;
    delete cleanStructuredData.device_id;
    delete cleanStructuredData.device_ids;
    delete cleanStructuredData.source_log_ids;
    postgresqlData.structured_data = cleanStructuredData;
  } else {
    postgresqlData.structured_data = null;
  }

  return postgresqlData;
}

// 构建将要写入surgeries表的标准行（去除重复字段）
function buildDbRowFromSurgery(surgery) {
  const devicePrefix = extractDeviceIdFromSurgeryId(surgery.surgery_id);
  let structured = surgery.postgresql_structure || null;
  if (!structured) {
    try {
      const analyzer = new SurgeryAnalyzer();
      structured = analyzer.toPostgreSQLStructure(surgery);
    } catch (_) {}
  }
  structured = normalizeStructuredDataTimestamps(structured);
  const hasFault = (structured?.surgery_stats?.has_fault) ?? (surgery.has_error || false);

  const postgresqlData = {
    surgery_id: surgery.surgery_id,
    source_log_ids: Array.isArray(surgery.source_log_ids)
      ? surgery.source_log_ids
      : (surgery.log_id ? [surgery.log_id] : []),
    device_ids: devicePrefix ? [devicePrefix] : [],
    log_entry_start_id: surgery.log_entry_start_id || null,
    log_entry_end_id: surgery.log_entry_end_id || null,
    start_time: formatUtcDateTime(surgery.surgery_start_time),
    end_time: formatUtcDateTime(surgery.surgery_end_time),
    has_fault: hasFault,
    is_remote: surgery.is_remote_surgery || false,
    success: (structured?.surgery_stats?.success) ?? !hasFault
  };

  if (structured) {
    const cleanStructuredData = { ...structured };
    delete cleanStructuredData.surgery_id;
    delete cleanStructuredData.start_time;
    delete cleanStructuredData.end_time;
    delete cleanStructuredData.device_id;
    delete cleanStructuredData.device_ids;
    delete cleanStructuredData.source_log_ids;
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


