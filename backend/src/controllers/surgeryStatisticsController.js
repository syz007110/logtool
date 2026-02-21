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
const Surgery = require('../models/surgery');
const SurgeryExportPending = require('../models/surgeryExportPending');
const SurgeryAnalysisTaskMeta = require('../models/surgeryAnalysisTaskMeta');
const SurgeryAnalyzer = require('../services/surgeryAnalyzer');
const { Op, Sequelize } = require('sequelize');
const { userHasDbPermission } = require('../middlewares/permission');

// Normalize various inputs to raw local time string (YYYY-MM-DD HH:mm:ss).
function formatRawDateTime(dateLike) {
  if (!dateLike) return null;
  try {
    let timeString = null;

    // If already in raw format, return it directly.
    if (typeof dateLike === 'string') {
      const s = dateLike.trim();
      // Raw format: YYYY-MM-DD HH:mm:ss (no timezone suffix).
      if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(s)) {
        timeString = s;
      }
      // If ISO format, strip timezone marker and keep local-looking fields.
      else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s)) {
        const withoutZ = s.replace('Z', '').replace('T', ' ');
        // Parse date/time fields and rebuild as local raw format.
        const [datePart, timePart] = withoutZ.split(' ');
        const [year, month, day] = datePart.split('-').map(Number);
        const [hour, minute, second] = timePart.split(':').map(Number);
        const d = new Date(year, month - 1, day, hour, minute, second || 0);
        const pad = (n) => String(n).padStart(2, '0');
        timeString = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      }
      // Fallback: parse via Date.
      else {
        const d = new Date(dateLike);
        if (!Number.isNaN(d.getTime())) {
          const pad = (n) => String(n).padStart(2, '0');
          timeString = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        }
      }
    }
    // If Date instance, format with local getters.
    else if (dateLike instanceof Date) {
      const pad = (n) => String(n).padStart(2, '0');
      timeString = `${dateLike.getFullYear()}-${pad(dateLike.getMonth() + 1)}-${pad(dateLike.getDate())} ${pad(dateLike.getHours())}:${pad(dateLike.getMinutes())}:${pad(dateLike.getSeconds())}`;
    }
    // Other types: attempt Date conversion.
    else {
      const d = new Date(dateLike);
      if (!Number.isNaN(d.getTime())) {
        const pad = (n) => String(n).padStart(2, '0');
        timeString = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      }
    }

    return timeString || null;
  } catch (_) {
    return null;
  }
}

// Convert to Sequelize.literal timestamp for DB writes.
function formatRawDateTimeForDb(dateLike) {
  const timeString = formatRawDateTime(dateLike);
  if (!timeString) return null;
  // Use literal to avoid implicit timezone conversion.
  return Sequelize.literal(`'${timeString}'::timestamp`);
}

// Format values for API response as raw local time string.
function formatTimeForDisplay(dateLike) {
  if (!dateLike) return null;

  let d;
  if (dateLike instanceof Date) {
    d = dateLike;
  } else if (typeof dateLike === 'string') {
    // Already in raw format.
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(dateLike)) {
      return dateLike;
    }
    // ISO format: parse then reformat.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dateLike)) {
      d = new Date(dateLike);
    } else {
      d = new Date(dateLike);
    }
  } else {
    d = new Date(dateLike);
  }

  if (Number.isNaN(d.getTime())) return null;

  // Return raw format: YYYY-MM-DD HH:mm:ss.
  const pad = (n) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Recursively normalize structured_data time fields to 'YYYY-MM-DD HH:mm:ss'.
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
        // Normalize time-like fields to avoid mixed UTC/ISO formats.
        const formatted = formatTimeForDisplay(value);
        out[key] = formatted !== null ? formatted : value;
      } else {
        out[key] = normalizeStructuredDataTimestamps(value);
      }
    }
    return out;
  }
  // Primitive values are returned as-is.
  return node;
}

// ===== Timezone conversion for PostgreSQL payloads =====
// Convention: analysis outputs store naive timestamp strings in a storage timezone (default UTC+8).
// Before output/export, convert by target offset to keep cross-page display consistent.
const STORAGE_OFFSET_MINUTES = Number.isFinite(Number(process.env.LOG_STORAGE_OFFSET_MINUTES))
  ? Number(process.env.LOG_STORAGE_OFFSET_MINUTES)
  : 480;

function clampOffsetMinutes(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
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

function toNullableInt(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const normalized = Math.trunc(n);
  return normalized > 0 ? normalized : null;
}

// Helper: generate YYYYMMDDHHMM for stable ID composition.
function formatTimeForId(dateStr) {
  if (!dateStr) return '000000000000';
  // Use raw time format to keep IDs deterministic.
  let d;
  if (typeof dateStr === 'string') {
    // If raw format string, extract directly.
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(dateStr)) {
      const [datePart, timePart] = dateStr.split(' ');
      const [year, month, day] = datePart.split('-');
      const [hour, minute] = timePart.split(':');
      return `${year}${month}${day}${hour}${minute}`;
    }
    // If ISO string, strip Z and parse as raw local fields.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dateStr)) {
      const isoWithoutZ = dateStr.replace('Z', '').replace('T', ' ');
      return formatTimeForId(isoWithoutZ);
    }
    d = new Date(dateStr);
  } else {
    d = new Date(dateStr);
  }
  if (Number.isNaN(d.getTime())) return '000000000000';
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes())
  );
}

// Helper: extract device-id prefix from surgery_id.
function extractDeviceIdFromSurgeryId(surgeryId) {
  if (!surgeryId || typeof surgeryId !== 'string') return 'UNKNOWN';
  const parts = surgeryId.split('-');
  if (parts.length <= 1) return surgeryId;
  return parts.slice(0, parts.length - 1).join('-');
}

// Helper: build surgeries-row preview (deduplicated fields).
function buildPostgresRowPreview(surgery, deviceId, timezoneOffsetMinutes = null) {
  // Ensure structured_data exists.
  let structured = surgery.postgresql_structure || null;
  if (!structured) {
    try {
      const analyzer = new SurgeryAnalyzer();
      structured = analyzer.toPostgreSQLStructure(surgery);
    } catch (_) { }
  }
  structured = normalizeStructuredDataTimestamps(structured);
  const tzOff = clampOffsetMinutes(timezoneOffsetMinutes ?? surgery.timezone_offset_minutes);
  structured = convertStructuredDataTimeFields(structured, tzOff);

  // Build clean PostgreSQL payload without repeated fields.
  const startRaw = formatRawDateTime(surgery.surgery_start_time);
  const endRaw = formatRawDateTime(surgery.surgery_end_time);
  const startTime = tzOff == null ? startRaw : convertStorageToOffsetTimeString(startRaw, tzOff);
  const endTime = tzOff == null ? endRaw : convertStorageToOffsetTimeString(endRaw, tzOff);
  const sourceLogIds = Array.isArray(surgery.source_log_ids)
    ? surgery.source_log_ids.map((id) => toNullableInt(id)).filter((id) => id !== null)
    : (toNullableInt(surgery.log_id) !== null ? [toNullableInt(surgery.log_id)] : []);
  const normalizedDeviceId = String(surgery?.device_id || deviceId || '').trim() || null;
  const startLogId = toNullableInt(surgery.log_entry_start_log_id) ?? (sourceLogIds.length ? sourceLogIds[0] : null);
  const endLogId = toNullableInt(surgery.log_entry_end_log_id) ?? (sourceLogIds.length ? sourceLogIds[sourceLogIds.length - 1] : null);
  const postgresqlData = {
    surgery_id: surgery.surgery_id || `${deviceId || 'UNKNOWN'}-${formatTimeForId(surgery.surgery_start_time)}`,
    source_log_ids: sourceLogIds,
    device_id: normalizedDeviceId,
    log_entry_start_id: toNullableInt(surgery.log_entry_start_id),
    log_entry_end_id: toNullableInt(surgery.log_entry_end_id),
    log_entry_start_log_id: startLogId,
    log_entry_end_log_id: endLogId,
    start_time: startTime,
    end_time: endTime,
    has_fault: (structured?.surgery_stats?.has_fault) ?? (surgery.has_error || false),
    is_remote: surgery.is_remote_surgery || false,
    success: (structured?.surgery_stats?.success) ?? !(surgery.has_error || false)
  };

  // Remove duplicated keys in structured_data, keep core analysis fields.
  if (structured) {
    const cleanStructuredData = { ...structured };
    // Record timezone metadata in JSONB; no schema change needed.
    cleanStructuredData.meta = {
      ...(cleanStructuredData.meta || {}),
      timezone_offset_minutes: tzOff == null ? STORAGE_OFFSET_MINUTES : tzOff,
      storage_offset_minutes: STORAGE_OFFSET_MINUTES
    };

    // Remove keys that duplicate top-level columns.
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

// Helper: build normalized DB row for surgeries table.
function buildDbRowFromSurgery(surgery, timezoneOffsetMinutes = null) {
  const devicePrefix = extractDeviceIdFromSurgeryId(surgery.surgery_id);
  // Ensure structured_data exists.
  let structured = surgery.postgresql_structure || null;
  if (!structured) {
    try {
      const analyzer = new SurgeryAnalyzer();
      structured = analyzer.toPostgreSQLStructure(surgery);
    } catch (_) { }
  }
  structured = normalizeStructuredDataTimestamps(structured);
  const tzOff = clampOffsetMinutes(timezoneOffsetMinutes ?? surgery.timezone_offset_minutes);
  structured = convertStructuredDataTimeFields(structured, tzOff);
  const hasFault = (structured?.surgery_stats?.has_fault) ?? (surgery.has_error || false);

  // Build clean PostgreSQL payload with deduplicated fields.
  const startRaw = formatRawDateTime(surgery.surgery_start_time);
  const endRaw = formatRawDateTime(surgery.surgery_end_time);
  const startTime = tzOff == null ? startRaw : convertStorageToOffsetTimeString(startRaw, tzOff);
  const endTime = tzOff == null ? endRaw : convertStorageToOffsetTimeString(endRaw, tzOff);
  const sourceLogIds = Array.isArray(surgery.source_log_ids)
    ? surgery.source_log_ids.map((id) => toNullableInt(id)).filter((id) => id !== null)
    : (toNullableInt(surgery.log_id) !== null ? [toNullableInt(surgery.log_id)] : []);
  const normalizedDeviceId = String(surgery?.device_id || devicePrefix || '').trim() || null;
  const startLogId = toNullableInt(surgery.log_entry_start_log_id) ?? (sourceLogIds.length ? sourceLogIds[0] : null);
  const endLogId = toNullableInt(surgery.log_entry_end_log_id) ?? (sourceLogIds.length ? sourceLogIds[sourceLogIds.length - 1] : null);
  const postgresqlData = {
    surgery_id: surgery.surgery_id,
    source_log_ids: sourceLogIds,
    device_id: normalizedDeviceId,
    log_entry_start_id: toNullableInt(surgery.log_entry_start_id),
    log_entry_end_id: toNullableInt(surgery.log_entry_end_id),
    log_entry_start_log_id: startLogId,
    log_entry_end_log_id: endLogId,
    start_time: startTime,
    end_time: endTime,
    has_fault: hasFault,
    is_remote: surgery.is_remote_surgery || false,
    success: (structured?.surgery_stats?.success) ?? !hasFault
  };

  // Keep core analysis fields and remove repeated keys.
  if (structured) {
    const cleanStructuredData = { ...structured };
    cleanStructuredData.meta = {
      ...(cleanStructuredData.meta || {}),
      timezone_offset_minutes: tzOff == null ? STORAGE_OFFSET_MINUTES : tzOff,
      storage_offset_minutes: STORAGE_OFFSET_MINUTES
    };

    // Remove keys that duplicate top-level columns.
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

// Task queue state
const analysisTasks = new Map();
let taskCounter = 0;

// Get current active analysis task count.
const getActiveAnalysisCount = async () => {
  let activeCount = 0;
  for (const [taskId, task] of analysisTasks) {
    if (task.status === 'processing') {
      activeCount++;
    }
  }
  return activeCount;
};

// Create analysis task.
const createAnalysisTask = (logIds, userId) => {
  const taskId = ++taskCounter;
  const task = {
    id: taskId,
    logIds: logIds,
    userId: userId,
    status: 'pending',
    progress: 0,
    result: null,
    error: null,
    createdAt: new Date(),
    startedAt: null,
    completedAt: null
  };

  analysisTasks.set(taskId, task);
  return taskId;
};

// Update task status.
const updateTaskStatus = (taskId, status, progress = null, result = null, error = null) => {
  const task = analysisTasks.get(taskId);
  if (task) {
    task.status = status;
    if (progress !== null) task.progress = progress;
    if (result !== null) task.result = result;
    if (error !== null) task.error = error;

    if (status === 'processing' && !task.startedAt) {
      task.startedAt = new Date();
    } else if (status === 'completed' || status === 'failed') {
      task.completedAt = new Date();
    }
  }
};

// Cleanup completed tasks, keep latest 100.
const cleanupCompletedTasks = () => {
  const completedTasks = Array.from(analysisTasks.entries())
    .filter(([id, task]) => task.status === 'completed' || task.status === 'failed')
    .sort((a, b) => b[1].completedAt - a[1].completedAt);

  // Keep at most 100 completed tasks.
  if (completedTasks.length > 100) {
    const toDelete = completedTasks.slice(100);
    toDelete.forEach(([taskId]) => {
      analysisTasks.delete(taskId);
    });
  }
};

function parseLogTimeToken(token) {
  const raw = String(token || '').trim();
  if (!/^\d{10,12}$/.test(raw)) return NaN;
  const normalized = raw.length === 10 ? `${raw}00` : raw;
  const candidates = [normalized];
  // MySQL generated column currently LPADs 10-digit token to 12 digits.
  // e.g. 2025020311 -> 002025020311. Recover by taking the last 10 digits.
  if (normalized.length === 12 && normalized.startsWith('00')) {
    candidates.push(`${normalized.slice(2)}00`);
  }
  for (const c of candidates) {
    const y = Number(c.slice(0, 4));
    const m = Number(c.slice(4, 6)) - 1;
    const d = Number(c.slice(6, 8));
    const hh = Number(c.slice(8, 10));
    const mm = Number(c.slice(10, 12));
    if (!Number.isFinite(y) || y < 2000 || y > 2100) continue;
    const ms = new Date(y, m, d, hh, mm, 0).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  return NaN;
}

function resolveLogTimeMs(log) {
  const fromToken = parseLogTimeToken(log?.file_time_token);
  if (Number.isFinite(fromToken)) return fromToken;
  const y = Number(log?.file_year);
  const mo = Number(log?.file_month);
  const d = Number(log?.file_day);
  const h = Number(log?.file_hour);
  if ([y, mo, d, h].every((v) => Number.isFinite(v))) {
    const fromYmdh = new Date(y, mo - 1, d, h, 0, 0).getTime();
    if (Number.isFinite(fromYmdh)) return fromYmdh;
  }
  const fromUpload = new Date(log?.upload_time || '').getTime();
  if (Number.isFinite(fromUpload)) return fromUpload;
  return Number(log?.id) || 0;
}

function resolveLogHourSlot(log) {
  const y = Number(log?.file_year);
  const mo = Number(log?.file_month);
  const d = Number(log?.file_day);
  const h = Number(log?.file_hour);
  if ([y, mo, d, h].every((v) => Number.isFinite(v))) {
    return Date.UTC(y, mo - 1, d, h, 0, 0, 0) / (60 * 60 * 1000);
  }
  const fromToken = parseLogTimeToken(log?.file_time_token);
  if (Number.isFinite(fromToken)) return Math.floor(fromToken / (60 * 60 * 1000));
  return NaN;
}

function groupLogsByDeviceContinuity(logs) {
  const sorted = [...(logs || [])].sort((a, b) => {
    const at = resolveLogHourSlot(a);
    const bt = resolveLogHourSlot(b);
    if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt;
    const atMs = resolveLogTimeMs(a);
    const btMs = resolveLogTimeMs(b);
    if (atMs !== btMs) return atMs - btMs;
    return Number(a.id) - Number(b.id);
  });
  const groups = [];
  let current = [];
  for (const log of sorted) {
    if (current.length === 0) {
      current.push(log);
      continue;
    }
    const prev = current[current.length - 1];
    const sameDevice = String(prev.device_id || '') === String(log.device_id || '');
    const prevHour = resolveLogHourSlot(prev);
    const currentHour = resolveLogHourSlot(log);
    const hasHourSlots = Number.isFinite(prevHour) && Number.isFinite(currentHour);
    // 仅使用日志文件时间（file_year/month/day/hour）判定连续性：
    // 同小时或相邻小时视为同一连续分组；否则拆分为新分组。
    const isContinuousByHour = hasHourSlots && (currentHour === prevHour || currentHour === prevHour + 1);
    const isContinuous = isContinuousByHour;
    if (!sameDevice || !isContinuous) {
      groups.push(current);
      current = [log];
    } else {
      current.push(log);
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function applyDbTimeLiterals(row) {
  const out = { ...row };
  if (out.start_time) out.start_time = formatRawDateTimeForDb(out.start_time);
  if (out.end_time) out.end_time = formatRawDateTimeForDb(out.end_time);
  return out;
}

function buildDiffFlags(differences) {
  const flags = {};
  for (const d of (differences || [])) {
    if (d?.field) flags[d.field] = true;
  }
  return flags;
}

function buildTextDiffFromDifferences(differences) {
  if (!Array.isArray(differences) || differences.length === 0) return '';
  return differences.map((d) => {
    const field = d.fieldName || d.field || 'unknown';
    const oldValue = typeof d.oldValue === 'string' ? d.oldValue : JSON.stringify(d.oldValue, null, 2);
    const newValue = typeof d.newValue === 'string' ? d.newValue : JSON.stringify(d.newValue, null, 2);
    return `- ${field}: ${oldValue || ''}\n+ ${field}: ${newValue || ''}`;
  }).join('\n\n');
}

function buildPendingPayload(postgresqlData, differences) {
  return {
    postgresqlData,
    diff_flags: buildDiffFlags(differences),
    version: 1
  };
}

function mergeImportSummary(base, delta) {
  const left = base || { total: 0, imported: 0, pending: 0, failed: 0 };
  const right = delta || { total: 0, imported: 0, pending: 0, failed: 0 };
  return {
    total: Number(left.total || 0) + Number(right.total || 0),
    imported: Number(left.imported || 0) + Number(right.imported || 0),
    pending: Number(left.pending || 0) + Number(right.pending || 0),
    failed: Number(left.failed || 0) + Number(right.failed || 0)
  };
}

function normalizeLogIdList(logIds) {
  return Array.from(new Set(
    (Array.isArray(logIds) ? logIds : [])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id))
  ));
}

function mapQueueStateToTaskStatus(state) {
  if (state === 'completed') return 'completed';
  if (state === 'failed') return 'failed';
  if (state === 'active') return 'processing';
  if (state === 'waiting' || state === 'delayed') return 'queued';
  return 'queued';
}

function deriveYyyyhhmmFromFirstLog(log) {
  if (!log) return null;
  const token = String(log.file_time_token || '').trim();
  if (/^\d{12}$/.test(token)) {
    return `${token.slice(0, 4)}${token.slice(8, 10)}${token.slice(10, 12)}`;
  }
  if (/^\d{10}$/.test(token)) {
    return `${token.slice(0, 4)}${token.slice(8, 10)}00`;
  }
  const uploadTime = log.upload_time ? new Date(log.upload_time) : null;
  if (uploadTime && !Number.isNaN(uploadTime.getTime())) {
    const yyyy = String(uploadTime.getFullYear());
    const hh = String(uploadTime.getHours()).padStart(2, '0');
    const mm = String(uploadTime.getMinutes()).padStart(2, '0');
    return `${yyyy}${hh}${mm}`;
  }
  return null;
}

function buildFailedDisplaySurgeryId(deviceId, firstLog) {
  const d = String(deviceId || '').trim() || 'unknown';
  const yyyyhhmm = deriveYyyyhhmmFromFirstLog(firstLog) || '00000000';
  return `${d}-${yyyyhhmm}00`;
}

async function upsertPendingExportRecord({ surgeryId, existingPostgresqlId, newData, userId }) {
  const pending = await SurgeryExportPending.findOne({ where: { surgery_id: surgeryId } });
  if (pending) {
    await pending.update({
      existing_postgresql_id: existingPostgresqlId,
      new_data: newData,
      created_by: userId || pending.created_by
    });
    return pending.id;
  }
  const created = await SurgeryExportPending.create({
    surgery_id: surgeryId,
    existing_postgresql_id: existingPostgresqlId,
    new_data: newData,
    created_by: userId || null
  });
  return created.id;
}

async function clearPendingExportRecordBySurgeryId(surgeryId) {
  if (!surgeryId) return;
  await SurgeryExportPending.destroy({ where: { surgery_id: surgeryId } });
}

function sanitizePendingComparisonData(value, parentKey = '') {
  if (value == null) return value;

  if (value instanceof Date) {
    return formatTimeForDisplay(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizePendingComparisonData(item, parentKey));
  }

  if (typeof value === 'object') {
    const out = {};
    const excludedDbFields = new Set(['id', 'created_at', 'updated_at', 'createdAt', 'updatedAt', 'last_analyzed_at', 'device_ids']);
    for (const [key, v] of Object.entries(value)) {
      if (excludedDbFields.has(key)) continue;
      out[key] = sanitizePendingComparisonData(v, key);
    }
    return out;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const lowerParentKey = String(parentKey || '').toLowerCase();
    const keyLooksLikeTime = lowerParentKey.endsWith('time') ||
      lowerParentKey.endsWith('timestamp') ||
      lowerParentKey === 'start_time' ||
      lowerParentKey === 'end_time' ||
      lowerParentKey === 'on_time' ||
      lowerParentKey === 'off_time' ||
      lowerParentKey === 'recoverytime';

    if (keyLooksLikeTime && (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(trimmed) || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(trimmed))) {
      return formatTimeForDisplay(trimmed) || trimmed;
    }

    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(trimmed)) {
      return formatTimeForDisplay(trimmed) || trimmed;
    }
  }

  return value;
}

function sanitizeDifferencesForDisplay(differences) {
  if (!Array.isArray(differences)) return [];
  return differences
    .filter((diff) => String(diff?.field || '') !== 'device_ids')
    .map((diff) => ({
    ...diff,
    oldValue: sanitizePendingComparisonData(diff?.oldValue, diff?.field || ''),
    newValue: sanitizePendingComparisonData(diff?.newValue, diff?.field || '')
    }));
}

async function autoImportSurgeries(surgeries, userId) {
  const summary = { total: 0, imported: 0, pending: 0, failed: 0 };
  if (!Array.isArray(surgeries)) return summary;
  summary.total = surgeries.length;

  for (const surgery of surgeries) {
    try {
      const postgresqlData = buildDbRowFromSurgery(surgery);
      const existing = await Surgery.findOne({ where: { surgery_id: postgresqlData.surgery_id } });
      if (!existing) {
        await Surgery.create(applyDbTimeLiterals(postgresqlData));
        summary.imported += 1;
        continue;
      }
      const existingPlain = existing.get ? existing.get({ plain: true }) : existing;
      const differences = compareSurgeryData(postgresqlData, existingPlain);
      if (differences.length === 0) {
        await clearPendingExportRecordBySurgeryId(postgresqlData.surgery_id);
        continue;
      }
      await upsertPendingExportRecord({
        surgeryId: postgresqlData.surgery_id,
        existingPostgresqlId: existing.id,
        newData: buildPendingPayload(postgresqlData, differences),
        userId
      });
      summary.pending += 1;
    } catch (_) {
      summary.failed += 1;
    }
  }
  return summary;
}

/**
 * Main surgery analysis function.
 * @param {Array} logEntries - log entry array
 * @param {Object} options - analysis options
 * @returns {Array} analyzed surgeries
 */
function analyzeSurgeries(logEntries, options = {}) {
  const analyzer = new SurgeryAnalyzer();
  const surgeries = analyzer.analyze(logEntries);

  // Generate PostgreSQL structure when needed.
  if (options.includePostgreSQLStructure) {
    surgeries.forEach(surgery => {
      surgery.postgresql_structure = analyzer.toPostgreSQLStructure(surgery);
    });
  }

  // Cache for export helpers.
  global.currentSurgeries = surgeries;

  return surgeries;
}

// Analyze surgeries from selected/all logs (real-time).
const getAllSurgeryStatistics = async (req, res) => {
  try {
    const { logIds, includePostgreSQLStructure } = req.query;

    let logs;
    if (logIds) {
      // If logIds provided, analyze only selected logs.
      const logIdArray = logIds.split(',').map(id => parseInt(id.trim()));
      logs = await Log.findAll({
        where: { id: { [Op.in]: logIdArray } },
        order: [['original_name', 'DESC']]
      });
      console.log(`Analyzing ${logs.length} selected log files`);
    } else {
      // Otherwise analyze all logs.
      logs = await Log.findAll({
        order: [['original_name', 'DESC']]
      });
      console.log(`Analyzing all ${logs.length} log files`);
    }

    const allSurgeries = [];
    let surgeryIdCounter = 1;

    // Compute source logs and entry-id range by surgery time window.
    // Preferred window: nearest power-on before start to nearest shutdown after end.
    // Fallback window: surgery_start_time to surgery_end_time.
    const computeSourceAndEntryRange = (surgery, entries) => {
      try {
        // Parse surgery start/end timestamps.
        const surgeryStart = new Date(surgery.surgery_start_time).getTime();
        const surgeryEnd = new Date(surgery.surgery_end_time).getTime();

        if (!Number.isFinite(surgeryStart) || !Number.isFinite(surgeryEnd)) {
          return { sourceLogIds: [], minEntryId: null, maxEntryId: null, startLogId: null, endLogId: null };
        }

        // Read power-on/shutdown timestamps.
        const powerOnTimes = surgery.power_on_times || [];
        const shutdownTimes = surgery.shutdown_times || [];

        // Initialize window bounds.
        let windowStart = surgeryStart;
        let windowEnd = surgeryEnd;

        // Find nearest power-on time before surgery start.
        const validPowerOnTimes = powerOnTimes
          .map(time => new Date(time).getTime())
          .filter(time => Number.isFinite(time) && time <= surgeryStart)
          .sort((a, b) => b - a); // Descending, nearest first.

        if (validPowerOnTimes.length > 0) {
          windowStart = validPowerOnTimes[0]; // Nearest (largest) power-on time.
        }

        // Find nearest shutdown time after surgery end.
        const validShutdownTimes = shutdownTimes
          .map(time => new Date(time).getTime())
          .filter(time => Number.isFinite(time) && time >= surgeryEnd)
          .sort((a, b) => a - b); // Ascending, nearest first.

        if (validShutdownTimes.length > 0) {
          windowEnd = validShutdownTimes[0]; // Nearest (smallest) shutdown time.
        }

        // Keep entries inside selected time window.
        const involved = entries.filter(e => {
          const t = new Date(e.timestamp).getTime();
          return Number.isFinite(t) && t >= windowStart && t <= windowEnd;
        });

        // Collect involved source log IDs.
        const sourceLogIds = Array.from(new Set(involved.map(e => e.log_id).filter(Boolean)));

        // Compute entry ID range.
        const ids = involved.map(e => e.id).filter(id =>
          typeof id === 'number' || (typeof id === 'string' && id.trim() !== '')
        );
        const minEntryId = ids.length ? Math.min(...ids.map(n => Number(n))) : null;
        const maxEntryId = ids.length ? Math.max(...ids.map(n => Number(n))) : null;

        const orderedByEntryId = involved
          .map((e) => ({ entryId: Number(e.id), logId: toNullableInt(e.log_id) }))
          .filter((x) => Number.isFinite(x.entryId) && x.logId !== null)
          .sort((a, b) => a.entryId - b.entryId);
        const startLogId = orderedByEntryId.length ? orderedByEntryId[0].logId : (sourceLogIds[0] || null);
        const endLogId = orderedByEntryId.length ? orderedByEntryId[orderedByEntryId.length - 1].logId : (sourceLogIds[sourceLogIds.length - 1] || null);

        return { sourceLogIds, minEntryId, maxEntryId, startLogId, endLogId };
      } catch (_) {
        return { sourceLogIds: [], minEntryId: null, maxEntryId: null, startLogId: null, endLogId: null };
      }
    };

    // Analyze each log.
    for (const log of logs) {
      console.log(`Start analyzing log ${log.filename} (ID: ${log.id})`)
      const logEntries = await LogEntry.findAll({
        where: { log_id: log.id },
        order: [['timestamp', 'ASC']]
      });

      console.log(`Log ${log.filename} has ${logEntries.length} entries`);

      if (logEntries.length > 0) {
        const surgeries = analyzeSurgeries(logEntries, {
          includePostgreSQLStructure: true
        });
        console.log(`Analyzed ${surgeries.length} surgeries from log ${log.filename}`);

        // Assign stable IDs and build surgery preview rows.
        surgeries.forEach(surgery => {
          surgery.id = surgeryIdCounter++;
          surgery.log_filename = log.filename;
          const deviceDisplayId = (log && log.device_id !== undefined && log.device_id !== null) ? String(log.device_id) : 'UNKNOWN';
          surgery.device_id = deviceDisplayId;
          surgery.surgery_id = `${deviceDisplayId}-${formatTimeForId(surgery.surgery_start_time)}`;
          // Compute source logs and entry range using extended time window.
          const { sourceLogIds, minEntryId, maxEntryId, startLogId, endLogId } = computeSourceAndEntryRange(surgery, logEntries);
          // Use computed window result as source_log_ids.
          surgery.source_log_ids = sourceLogIds.length ? sourceLogIds : [log.id];
          surgery.log_entry_start_id = minEntryId;
          surgery.log_entry_end_id = maxEntryId;
          surgery.log_entry_start_log_id = startLogId;
          surgery.log_entry_end_log_id = endLogId;
          if (includePostgreSQLStructure === 'true') {
            surgery.postgresql_row_preview = buildPostgresRowPreview(surgery, deviceDisplayId);
          }
        });

        allSurgeries.push(...surgeries);
      }
    }

    console.log(`Analysis completed, found ${allSurgeries.length} surgeries`);
    const dbRows = allSurgeries.map(s => buildDbRowFromSurgery(s));
    res.json({
      success: true,
      data: dbRows,
      message: `Successfully analyzed ${dbRows.length} surgery rows`
    });

  } catch (error) {
    console.error('Failed to get surgery statistics:', error);
    res.status(500).json({ message: 'Failed to get surgery statistics', error: error.message });
  }
};

// Analyze already-sorted log entries from frontend.
const analyzeSortedLogEntries = async (req, res) => {
  try {
    const { logEntries } = req.body;

    if (!logEntries || !Array.isArray(logEntries) || logEntries.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide valid log entry data'
      });
    }

    console.log(`Start analyzing ${logEntries.length} sorted log entries from frontend`);

    // Validate the incoming log-entry payload structure.
    const requiredFields = ['timestamp', 'error_code', 'param1', 'param2', 'param3', 'param4'];
    const isValidEntry = logEntries.every(entry =>
      requiredFields.every(field => entry.hasOwnProperty(field))
    );

    if (!isValidEntry) {
      return res.status(400).json({
        success: false,
        message: 'Invalid log entry payload, required fields are missing'
      });
    }

    // Run analysis using the unified analyzer.
    const surgeries = analyzeSurgeries(logEntries, {
      includePostgreSQLStructure: true
    });
    console.log(`Analyzed ${surgeries.length} surgeries from sorted log entries`);

    // Resolve device id by log_id (if present), then generate surgery_id and preview row.
    const uniqueLogIds = Array.from(new Set((logEntries || []).map(e => e.log_id).filter(Boolean)));
    const logMap = new Map();
    if (uniqueLogIds.length > 0) {
      const logs = await Log.findAll({ where: { id: { [Op.in]: uniqueLogIds } } });
      logs.forEach(l => logMap.set(l.id, l));
    }

    surgeries.forEach((surgery, index) => {
      surgery.id = index + 1;
      surgery.log_filename = 'sorted-log-entries';
      const deviceDisplayId = surgery.log_id && logMap.get(surgery.log_id) && logMap.get(surgery.log_id).device_id !== undefined && logMap.get(surgery.log_id).device_id !== null
        ? String(logMap.get(surgery.log_id).device_id)
        : 'UNKNOWN';
      surgery.device_id = deviceDisplayId;
      surgery.surgery_id = `${deviceDisplayId}-${formatTimeForId(surgery.surgery_start_time)}`;
      // Compute source logs and entry-id range by expanded surgery time window.
      try {
        // Parse surgery start/end time.
        const surgeryStart = new Date(surgery.surgery_start_time).getTime();
        const surgeryEnd = new Date(surgery.surgery_end_time).getTime();

        if (Number.isFinite(surgeryStart) && Number.isFinite(surgeryEnd)) {
          // Read power-on and shutdown times.
          const powerOnTimes = surgery.power_on_times || [];
          const shutdownTimes = surgery.shutdown_times || [];

          // Initialize time-window bounds.
          let windowStart = surgeryStart;
          let windowEnd = surgeryEnd;

          // Find nearest power-on time before surgery start.
          const validPowerOnTimes = powerOnTimes
            .map(time => new Date(time).getTime())
            .filter(time => Number.isFinite(time) && time <= surgeryStart)
            .sort((a, b) => b - a); // Descending: nearest first.

          if (validPowerOnTimes.length > 0) {
            windowStart = validPowerOnTimes[0]; // Nearest power-on.
          }

          // Find nearest shutdown time after surgery end.
          const validShutdownTimes = shutdownTimes
            .map(time => new Date(time).getTime())
            .filter(time => Number.isFinite(time) && time >= surgeryEnd)
            .sort((a, b) => a - b); // Ascending: nearest first.

          if (validShutdownTimes.length > 0) {
            windowEnd = validShutdownTimes[0]; // Nearest shutdown.
          }

          // Keep entries inside computed time window.
          const involved = (logEntries || []).filter(e => {
            const t = new Date(e.timestamp).getTime();
            return Number.isFinite(t) && t >= windowStart && t <= windowEnd;
          });

          // Extract involved source log IDs.
          const sourceLogIds = Array.from(new Set(involved.map(e => e.log_id).filter(Boolean)));
          surgery.source_log_ids = sourceLogIds.length ? sourceLogIds : [];

          // Extract log-entry id range.
          const ids = involved.map(e => e.id).filter(id => typeof id !== 'undefined');
          if (ids.length) {
            const numeric = ids.map(n => Number(n)).filter(v => Number.isFinite(v));
            surgery.log_entry_start_id = numeric.length ? Math.min(...numeric) : null;
            surgery.log_entry_end_id = numeric.length ? Math.max(...numeric) : null;
          } else {
            surgery.log_entry_start_id = null;
            surgery.log_entry_end_id = null;
          }
          const orderedByEntryId = involved
            .map((e) => ({ entryId: Number(e.id), logId: toNullableInt(e.log_id) }))
            .filter((x) => Number.isFinite(x.entryId) && x.logId !== null)
            .sort((a, b) => a.entryId - b.entryId);
          surgery.log_entry_start_log_id = orderedByEntryId.length ? orderedByEntryId[0].logId : (surgery.source_log_ids[0] || null);
          surgery.log_entry_end_log_id = orderedByEntryId.length
            ? orderedByEntryId[orderedByEntryId.length - 1].logId
            : (surgery.source_log_ids[surgery.source_log_ids.length - 1] || null);
        } else {
          surgery.source_log_ids = [];
          surgery.log_entry_start_id = null;
          surgery.log_entry_end_id = null;
          surgery.log_entry_start_log_id = null;
          surgery.log_entry_end_log_id = null;
        }
      } catch (_) {
        surgery.source_log_ids = [];
        surgery.log_entry_start_id = null;
        surgery.log_entry_end_id = null;
        surgery.log_entry_start_log_id = null;
        surgery.log_entry_end_log_id = null;
      }
      if (includePostgreSQLStructure === true) {
        surgery.postgresql_row_preview = buildPostgresRowPreview(surgery, deviceDisplayId);
      }
    });

    console.log(`Analysis completed, found ${surgeries.length} surgeries`);
    const dbRows = surgeries.map(s => buildDbRowFromSurgery(s));
    res.json({
      success: true,
      data: dbRows,
      message: `Successfully analyzed ${dbRows.length} surgery rows (sorted entries mode)`
    });

  } catch (error) {
    console.error('Failed to analyze sorted log entries:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to analyze sorted log entries',
      error: error.message
    });
  }
};

// Export surgery report PDF (placeholder endpoint).
const exportSurgeryReport = async (req, res) => {
  try {
    const { id } = req.params;

    res.json({
      success: true,
      message: 'Surgery report export is under development',
      data: {
        surgery_id: `Surgery-${id}`,
        download_url: `/api/surgery-statistics/${id}/report.pdf`
      }
    });

  } catch (error) {
    console.error('Failed to export surgery report:', error);
    res.status(500).json({ message: 'Failed to export surgery report', error: error.message });
  }
};

// Analyze surgery data by log IDs (queued, keeps analysis behavior unchanged).
const { surgeryAnalysisQueue } = require('../config/queue');
const analyzeByLogIds = async (req, res) => {
  try {
    const { logIds, includePostgreSQLStructure, timezoneOffsetMinutes, autoImport, retryFailedGroupId } = req.body || {};

    if (!logIds || !Array.isArray(logIds) || logIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid log ID list'
      });
    }

    const numericLogIds = Array.from(new Set(logIds.map((id) => Number(id)).filter((n) => Number.isFinite(n))));
    const selectedLogs = await Log.findAll({
      where: { id: { [Op.in]: numericLogIds } },
      attributes: ['id', 'device_id', 'file_time_token', 'file_year', 'file_month', 'file_day', 'file_hour', 'upload_time']
    });
    if (selectedLogs.length === 0) {
      return res.status(404).json({ success: false, message: 'No logs found' });
    }

    const groups = groupLogsByDeviceContinuity(selectedLogs);
    const jobs = [];
    const requestId = `surgery-req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const requestLogIdsSorted = [...numericLogIds].sort((a, b) => a - b);
    for (const group of groups) {
      const groupDeviceId = String(group?.[0]?.device_id || '').trim() || null;
      const groupLogIds = group.map((item) => item.id);
      const groupLogIdsSorted = [...groupLogIds].sort((a, b) => a - b);
      const isExactRetryGroup = Number.isFinite(Number(retryFailedGroupId))
        && requestLogIdsSorted.length === groupLogIdsSorted.length
        && requestLogIdsSorted.every((id, idx) => id === groupLogIdsSorted[idx]);
      const job = await surgeryAnalysisQueue.add('analyze-surgeries', {
        logIds: groupLogIds,
        deviceId: groupDeviceId,
        retryFailedGroupId: isExactRetryGroup ? Number(retryFailedGroupId) : null,
        requestId,
        autoImport: autoImport === true,
        userId: req.user.id,
        includePostgreSQLStructure: includePostgreSQLStructure === true,
        timezoneOffsetMinutes: timezoneOffsetMinutes ?? null
      }, {
        priority: 1,
        attempts: 2,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: 100,
        removeOnFail: 50
      });
      jobs.push({
        job,
        groupDeviceId,
        groupLogIds
      });
    }

    if (typeof SurgeryAnalysisTaskMeta.ensureTable === 'function') {
      await SurgeryAnalysisTaskMeta.ensureTable();
    }
    for (const item of jobs) {
      await SurgeryAnalysisTaskMeta.upsert({
        queue_job_id: String(item.job.id),
        request_id: requestId,
        device_id: item.groupDeviceId || 'unknown',
        source_log_ids: normalizeLogIdList(item.groupLogIds),
        status: 'queued',
        created_by: req.user.id
      });
    }

    let removedRetryTaskMetaId = null;
    const retryMetaIdNum = Number(retryFailedGroupId);
    if (Number.isFinite(retryMetaIdNum) && retryMetaIdNum > 0) {
      try {
        const oldMeta = await SurgeryAnalysisTaskMeta.findByPk(retryMetaIdNum);
        if (oldMeta) {
          const oldSourceLogIdsSorted = normalizeLogIdList(oldMeta.source_log_ids).sort((a, b) => a - b);
          const canRemoveOldMeta = oldSourceLogIdsSorted.length === requestLogIdsSorted.length
            && oldSourceLogIdsSorted.every((id, idx) => id === requestLogIdsSorted[idx]);
          if (canRemoveOldMeta) {
            await oldMeta.destroy();
            removedRetryTaskMetaId = retryMetaIdNum;
          }
        }
      } catch (cleanupError) {
        console.warn('Failed to cleanup old retry task meta:', cleanupError?.message || cleanupError);
      }
    }

    return res.json({
      success: true,
      requestId,
      taskIds: jobs.map((item) => String(item.job.id)),
      taskId: jobs.length > 0 ? String(jobs[0].job.id) : null,
      subTaskCount: jobs.length,
      removedRetryTaskMetaId,
      message: 'Analysis task queued'
    });

  } catch (error) {
    console.error('Failed to create surgery analysis queue task:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create surgery analysis task',
      error: error.message
    });
  }
};

const analyzeByDeviceRange = async (req, res) => {
  try {
    const {
      deviceId,
      startTime,
      endTime,
      includePostgreSQLStructure,
      timezoneOffsetMinutes,
      autoImport,
      retryFailedGroupId
    } = req.body || {};
    if (!deviceId || !startTime || !endTime) {
      return res.status(400).json({ success: false, message: 'deviceId/startTime/endTime required' });
    }
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid time range' });
    }
    if (start.getTime() > end.getTime()) {
      return res.status(400).json({ success: false, message: 'Invalid time range' });
    }

    const logs = await Log.findAll({
      where: {
        device_id: String(deviceId),
        status: 'parsed',
        upload_time: { [Op.between]: [start, end] }
      },
      attributes: ['id'],
      order: [['upload_time', 'ASC']]
    });
    const logIds = logs.map((item) => item.id);
    if (logIds.length === 0) {
      return res.status(404).json({ success: false, message: 'No logs in selected range' });
    }

    req.body = {
      ...req.body,
      logIds,
      autoImport: autoImport === true,
      retryFailedGroupId: Number.isFinite(Number(retryFailedGroupId)) ? Number(retryFailedGroupId) : null,
      includePostgreSQLStructure: includePostgreSQLStructure === true,
      timezoneOffsetMinutes: timezoneOffsetMinutes ?? null
    };
    return analyzeByLogIds(req, res);
  } catch (error) {
    console.error('Failed to enqueue surgery analysis task by device range:', error);
    return res.status(500).json({ success: false, message: 'Failed to enqueue surgery analysis task by device range', error: error.message });
  }
};

// Process analysis task asynchronously.
const processAnalysisTask = async (taskId, logIds, includePostgreSQLStructure = false) => {

  try {
    // Mark task as processing.
    updateTaskStatus(taskId, 'processing', 0);

    // Load all log entries for selected logs.
    const allLogEntries = [];
    let processedLogs = 0;
    const logIdToDeviceId = new Map();

    for (const logId of logIds) {
      try {
        // Update progress.
        const progress = Math.round((processedLogs / logIds.length) * 80); // First 80% is data loading.
        updateTaskStatus(taskId, 'processing', progress);

        // Load entries for one log.
        const logEntries = await LogEntry.findAll({
          where: { log_id: logId },
          order: [['timestamp', 'ASC']],
          raw: true
        });

        // Append source log name for each entry.
        const logInfo = await Log.findByPk(logId);
        const logName = logInfo ? logInfo.original_name : `log-${logId}`;
        if (logInfo && logInfo.device_id) {
          logIdToDeviceId.set(logId, logInfo.device_id);
        }

        const entriesWithLogName = logEntries.map(entry => ({
          ...entry,
          log_name: logName
        }));

        allLogEntries.push(...entriesWithLogName);
        processedLogs++;

        console.log(`Log ${logName} (ID: ${logId}) has ${logEntries.length} entries`);

      } catch (error) {
        console.error(`Failed to load entries for log ID ${logId}`, error);
        processedLogs++;
        // Continue with other logs instead of aborting whole task.
      }
    }

    if (allLogEntries.length === 0) {
      updateTaskStatus(taskId, 'failed', 100, null, 'No log entries found');
      return;
    }

    console.log(`Fetched ${allLogEntries.length} log entries in total`);

    // Move progress to 90% before final analysis.
    updateTaskStatus(taskId, 'processing', 90);

    // Run analysis with unified analyzer.
    const surgeries = analyzeSurgeries(allLogEntries, {
      includePostgreSQLStructure: includePostgreSQLStructure === true
    });
    console.log(`Analyzed ${surgeries.length} surgeries from selected logs`);

    // Assign stable ids and surgery_id for each analyzed surgery.
    surgeries.forEach((surgery, index) => {
      surgery.id = index + 1;
      surgery.log_filename = `batch-analysis (${logIds.length} logs)`;
      const deviceDisplayId = surgery.log_id && logIdToDeviceId.get(surgery.log_id) !== undefined && logIdToDeviceId.get(surgery.log_id) !== null
        ? String(logIdToDeviceId.get(surgery.log_id))
        : 'UNKNOWN';
      surgery.device_id = deviceDisplayId;
      surgery.surgery_id = `${deviceDisplayId}-${formatTimeForId(surgery.surgery_start_time)}`;
      // Compute source logs and entry-id range by expanded time window.
      try {
        // Parse surgery start/end time.
        const surgeryStart = new Date(surgery.surgery_start_time).getTime();
        const surgeryEnd = new Date(surgery.surgery_end_time).getTime();

        if (Number.isFinite(surgeryStart) && Number.isFinite(surgeryEnd)) {
          // Read power-on and shutdown times.
          const powerOnTimes = surgery.power_on_times || [];
          const shutdownTimes = surgery.shutdown_times || [];

          // Initialize time-window bounds.
          let windowStart = surgeryStart;
          let windowEnd = surgeryEnd;

          // Find nearest power-on time before surgery start.
          const validPowerOnTimes = powerOnTimes
            .map(time => new Date(time).getTime())
            .filter(time => Number.isFinite(time) && time <= surgeryStart)
            .sort((a, b) => b - a); // Descending: nearest first.

          if (validPowerOnTimes.length > 0) {
            windowStart = validPowerOnTimes[0]; // Nearest power-on.
          }

          // Find nearest shutdown time after surgery end.
          const validShutdownTimes = shutdownTimes
            .map(time => new Date(time).getTime())
            .filter(time => Number.isFinite(time) && time >= surgeryEnd)
            .sort((a, b) => a - b); // Ascending: nearest first.

          if (validShutdownTimes.length > 0) {
            windowEnd = validShutdownTimes[0]; // Nearest shutdown.
          }

          // Keep entries inside computed time window.
          const involved = allLogEntries.filter(e => {
            const t = new Date(e.timestamp).getTime();
            return Number.isFinite(t) && t >= windowStart && t <= windowEnd;
          });

          // Extract involved source log IDs.
          const sourceLogIds = Array.from(new Set(involved.map(e => e.log_id).filter(Boolean)));
          surgery.source_log_ids = sourceLogIds.length ? sourceLogIds : [];

          // Extract log-entry id range.
          const ids = involved.map(e => e.id).filter(id => typeof id !== 'undefined');
          if (ids.length) {
            const numeric = ids.map(n => Number(n)).filter(v => Number.isFinite(v));
            surgery.log_entry_start_id = numeric.length ? Math.min(...numeric) : null;
            surgery.log_entry_end_id = numeric.length ? Math.max(...numeric) : null;
          } else {
            surgery.log_entry_start_id = null;
            surgery.log_entry_end_id = null;
          }
          const orderedByEntryId = involved
            .map((e) => ({ entryId: Number(e.id), logId: toNullableInt(e.log_id) }))
            .filter((x) => Number.isFinite(x.entryId) && x.logId !== null)
            .sort((a, b) => a.entryId - b.entryId);
          surgery.log_entry_start_log_id = orderedByEntryId.length ? orderedByEntryId[0].logId : (surgery.source_log_ids[0] || null);
          surgery.log_entry_end_log_id = orderedByEntryId.length
            ? orderedByEntryId[orderedByEntryId.length - 1].logId
            : (surgery.source_log_ids[surgery.source_log_ids.length - 1] || null);
        } else {
          surgery.source_log_ids = [];
          surgery.log_entry_start_id = null;
          surgery.log_entry_end_id = null;
          surgery.log_entry_start_log_id = null;
          surgery.log_entry_end_log_id = null;
        }
      } catch (_) {
        surgery.source_log_ids = [];
        surgery.log_entry_start_id = null;
        surgery.log_entry_end_id = null;
        surgery.log_entry_start_log_id = null;
        surgery.log_entry_end_log_id = null;
      }

      // Build PostgreSQL preview row when requested.
      if (includePostgreSQLStructure === true) {
        surgery.postgresql_row_preview = buildPostgresRowPreview(surgery, deviceDisplayId);
      }
    });

    // Mark task completed.
    updateTaskStatus(taskId, 'completed', 100, surgeries);

    // Cleanup completed tasks cache.
    cleanupCompletedTasks();

    console.log(`Analysis completed for task ${taskId}, generated ${surgeries.length} rows`);

  } catch (error) {
    console.error('Failed to process analysis task:', error);
    updateTaskStatus(taskId, 'failed', 100, null, error.message);
  }
};

// Query analysis task status (single queue job).
const getAnalysisTaskStatus = async (req, res) => {
  try {
    const { taskId } = req.params;
    const queueJobId = String(taskId);
    const job = await surgeryAnalysisQueue.getJob(queueJobId);
    if (!job) return res.status(404).json({ success: false, message: 'Task not found or expired' });

    const state = await job.getState();
    const progress = Number(await job.progress()) || 0;
    const mappedStatus = mapQueueStateToTaskStatus(state);
    if (typeof SurgeryAnalysisTaskMeta.ensureTable === 'function') {
      await SurgeryAnalysisTaskMeta.ensureTable();
    }
    let meta = await SurgeryAnalysisTaskMeta.findOne({ where: { queue_job_id: queueJobId } });
    if (!meta && state !== 'completed') {
      await SurgeryAnalysisTaskMeta.create({
        queue_job_id: queueJobId,
        request_id: String(job.data?.requestId || ''),
        device_id: String(job.data?.deviceId || '').trim() || 'unknown',
        source_log_ids: normalizeLogIdList(job.data?.logIds),
        status: state === 'failed' ? 'failed' : 'queued',
        created_by: Number.isFinite(Number(job.data?.userId)) ? Number(job.data?.userId) : null,
        error_message: state === 'failed' ? (job.failedReason || 'Task failed') : null,
        started_at: state === 'active' ? new Date() : null,
        completed_at: state === 'failed' ? new Date() : null
      });
      meta = await SurgeryAnalysisTaskMeta.findOne({ where: { queue_job_id: queueJobId } });
    }

    const payload = {
      id: job.id,
      status: mappedStatus,
      progress,
      createdAt: job.timestamp,
      data: job.data
    };

    const sourceLogIds = normalizeLogIdList(job.data?.logIds);
    const firstLogId = sourceLogIds.length > 0 ? sourceLogIds[0] : null;
    const firstLog = firstLogId ? await Log.findByPk(firstLogId, {
      attributes: ['id', 'file_time_token', 'upload_time']
    }) : null;
    const displaySurgeryId = buildFailedDisplaySurgeryId(job.data?.deviceId, firstLog);
    const metaStatus = String(meta?.status || '');

    if (state === 'completed') {
      const surgeries = Array.isArray(job.returnvalue?.surgeries)
        ? job.returnvalue.surgeries
        : (Array.isArray(job.returnvalue) ? job.returnvalue : []);
      const failedLogDetails = Array.isArray(job.returnvalue?.failedLogs) ? job.returnvalue.failedLogs : [];
      const failedLogIds = Array.isArray(job.returnvalue?.failedLogIds)
        ? normalizeLogIdList(job.returnvalue.failedLogIds)
        : normalizeLogIdList(failedLogDetails.map((x) => x?.logId));

      let exportSummary = {
        total: 0,
        imported: 0,
        pending: 0,
        failed: 0
      };

      const hasFailures = failedLogIds.length > 0 || Number(exportSummary.failed || 0) > 0;
      payload.status = hasFailures ? 'failed' : 'completed';

      payload.result = surgeries;
      payload.failedLogIds = failedLogIds;
      payload.failedLogDetails = failedLogDetails;
      payload.exportSummary = exportSummary;

      if (meta) {
        if (!hasFailures) {
          await meta.destroy();
        } else {
          await meta.update({
            status: 'failed',
            error_message: `${failedLogIds.length} log(s) failed`,
            display_surgery_id: displaySurgeryId,
            completed_at: new Date(),
            started_at: meta.started_at || new Date()
          });
        }
      }
    } else if (state === 'failed') {
      const failedLogIds = sourceLogIds;
      const failedLogDetails = failedLogIds.map((logId) => ({
        logId: Number(logId),
        reason: job.failedReason || 'Task failed'
      }));
      payload.error = job.failedReason || 'Task failed';
      payload.failedLogIds = failedLogIds;
      payload.failedLogDetails = failedLogDetails;
      payload.exportSummary = { total: 0, imported: 0, pending: 0, failed: 0 };

      if (meta) {
        await meta.update({
          status: 'failed',
          error_message: payload.error,
          display_surgery_id: displaySurgeryId,
          completed_at: new Date(),
          started_at: meta.started_at || new Date()
        });
      }
    } else {
      if (meta) {
        await meta.update({
          status: mappedStatus,
          started_at: mappedStatus === 'processing' ? (meta.started_at || new Date()) : meta.started_at
        });
      }
    }

    return res.json({ success: true, data: payload });
  } catch (error) {
    console.error('Failed to query queue task status:', error);
    res.status(500).json({ success: false, message: 'Failed to query task status', error: error.message });
  }
};

// Get current user's analysis task list.
const getUserAnalysisTasks = async (req, res) => {
  try {
    const userId = req.user.id;
    const hasSurgeryReadPermission = await userHasDbPermission(userId, 'surgery:read');
    if (typeof SurgeryAnalysisTaskMeta.ensureTable === 'function') {
      await SurgeryAnalysisTaskMeta.ensureTable();
    }
    const where = hasSurgeryReadPermission ? {} : { created_by: userId };
    const rows = await SurgeryAnalysisTaskMeta.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: 200
    });
    const userTasks = rows.map((task) => ({
      id: String(task.queue_job_id),
      status: String(task.status || 'queued'),
      progress: null,
      createdAt: task.created_at,
      startedAt: task.started_at,
      completedAt: task.completed_at,
      logIds: normalizeLogIdList(task.source_log_ids)
    }));

    res.json({
      success: true,
      data: userTasks
    });

  } catch (error) {
    console.error('Failed to get task list:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get task list',
      error: error.message
    });
  }
};

const getGlobalActiveAnalysisTasks = async (req, res) => {
  try {
    const queueJobs = await surgeryAnalysisQueue.getJobs(['active', 'waiting', 'delayed']);
    const withStatus = await Promise.all(queueJobs.map(async (job) => {
      const state = await job.getState().catch(() => 'unknown');
      const status = state === 'active' ? 'processing' : (state === 'waiting' || state === 'delayed' ? 'waiting' : 'waiting');
      return { id: job.id, name: job.name, data: job.data, createdAt: job.timestamp, status };
    }));
    return res.json({
      success: true,
      data: {
        queue: withStatus,
        grouped: withStatus
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to get active tasks', error: error.message });
  }
};

const getPendingExports = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const where = {};
    if (req.query.surgery_id) where.surgery_id = String(req.query.surgery_id);
    const { count, rows } = await SurgeryExportPending.findAndCountAll({
      where,
      limit,
      offset,
      order: [['updated_at', 'DESC']]
    });
    return res.json({ success: true, data: rows, total: count, page, limit });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to get pending exports', error: error.message });
  }
};

const getPendingExportDetail = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const full = ['1', 'true', 'yes'].includes(String(req.query.full || '').toLowerCase());
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'Invalid id' });
    const pending = await SurgeryExportPending.findByPk(id);
    if (!pending) return res.status(404).json({ success: false, message: 'Pending export not found' });
    const plain = pending.get ? pending.get({ plain: true }) : pending;
    const payload = plain.new_data || {};
    const existing = await Surgery.findByPk(plain.existing_postgresql_id);
    const existingPlain = existing?.get ? existing.get({ plain: true }) : (existing || {});
    const newDataFull = payload.postgresqlData || payload.newData || {};
    const rawDifferences = Array.isArray(payload.differences) ? payload.differences : compareSurgeryData(newDataFull, existingPlain);
    const differences = sanitizeDifferencesForDisplay(rawDifferences);
    const existingComparableFull = sanitizePendingComparisonData(existingPlain);
    const newComparableFull = sanitizePendingComparisonData(newDataFull);

    let existingData = existingComparableFull;
    let newData = newComparableFull;
    if (!full) {
      existingData = {};
      newData = {};
      for (const diff of differences) {
        if (!diff?.field) continue;
        existingData[diff.field] = diff.oldValue;
        newData[diff.field] = diff.newValue;
      }
    }

    return res.json({
      success: true,
      data: {
        id: plain.id,
        surgery_id: plain.surgery_id,
        existingData,
        newData,
        differences,
        textDiff: buildTextDiffFromDifferences(differences),
        surgeryData: {},
        fullDataIncluded: full
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to get pending export detail', error: error.message });
  }
};

const resolvePendingExport = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const action = String(req.body?.action || '');
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'Invalid id' });
    if (!['override', 'keep_existing'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    const pending = await SurgeryExportPending.findByPk(id);
    if (!pending) return res.status(404).json({ success: false, message: 'Pending export not found' });
    const plain = pending.get ? pending.get({ plain: true }) : pending;

    if (action === 'override') {
      const payload = plain.new_data || {};
      let postgresqlData = payload.postgresqlData || payload.newData || null;
      if (!postgresqlData && payload.surgeryData) {
        postgresqlData = buildDbRowFromSurgery(payload.surgeryData);
      }
      if (!postgresqlData) return res.status(400).json({ success: false, message: 'Pending data invalid' });
      const existing = await Surgery.findOne({ where: { surgery_id: plain.surgery_id } });
      if (existing) await existing.update(applyDbTimeLiterals(postgresqlData));
      else await Surgery.create(applyDbTimeLiterals(postgresqlData));
    }

    await pending.destroy();
    return res.json({ success: true, message: action === 'override' ? 'Override completed' : 'Pending discarded' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to resolve pending export', error: error.message });
  }
};

// Export PostgreSQL structured surgery data.
const exportPostgreSQLData = async (req, res) => {
  try {
    const { logIds } = req.query;

    let logs;
    if (logIds) {
      const logIdArray = logIds.split(',').map(id => parseInt(id.trim()));
      logs = await Log.findAll({
        where: { id: { [Op.in]: logIdArray } },
        order: [['original_name', 'DESC']]
      });
    } else {
      logs = await Log.findAll({
        order: [['original_name', 'DESC']]
      });
    }

    const allSurgeries = [];
    let surgeryIdCounter = 1;

    for (const log of logs) {
      const logEntries = await LogEntry.findAll({
        where: { log_id: log.id },
        order: [['timestamp', 'ASC']]
      });

      if (logEntries.length > 0) {
        const surgeries = analyzeSurgeries(logEntries, { includePostgreSQLStructure: true });

        surgeries.forEach(surgery => {
          surgery.id = surgeryIdCounter++;
          surgery.log_filename = log.filename;
          const deviceId = log.device_id;
          surgery.device_id = deviceId;
          surgery.surgery_id = `${deviceId || 'UNKNOWN'}-${formatTimeForId(surgery.surgery_start_time)}`;
        });

        allSurgeries.push(...surgeries);
      }
    }

    // Convert to PostgreSQL row payloads.
    const postgresqlData = allSurgeries.map(s => buildDbRowFromSurgery(s));

    // Operation log.
    try {
      const { logOperation } = require('../utils/operationLogger');
      await logOperation({
        operation: 'surgery_data_export',
        description: `Exported ${postgresqlData.length} structured surgery rows`,
        user_id: req.user?.id,
        username: req.user?.username,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        details: { count: postgresqlData.length, logIds: (logs || []).map(l => l.id) }
      });
    } catch (_) { }

    res.json({
      success: true,
      data: postgresqlData,
      message: `Generated ${postgresqlData.length} PostgreSQL rows successfully`
    });

  } catch (error) {
    console.error('Failed to export PostgreSQL data:', error);
    res.status(500).json({ message: 'Failed to export PostgreSQL data', error: error.message });
  }
};

// Query surgeries from PostgreSQL.
const getPostgreSQLSurgeries = async (req, res) => {
  try {
    const Surgery = require('../models/surgery');
    const { limit = 100, offset = 0 } = req.query;

    const surgeries = await Surgery.findAll({
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']]
    });

    const total = await Surgery.count();

    res.json({
      success: true,
      data: surgeries,
      total,
      message: `Loaded ${surgeries.length} surgeries`
    });

  } catch (error) {
    console.error('Failed to query PostgreSQL surgeries:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to query PostgreSQL surgeries',
      error: error.message
    });
  }
};

// JSON stringify with sorted object keys (order-independent comparison).
function jsonStringifySorted(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((v) => jsonStringifySorted(v)).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  const pairs = keys.map((k) => JSON.stringify(k) + ':' + jsonStringifySorted(value[k]));
  return '{' + pairs.join(',') + '}';
}

// Normalize time values for comparison (ignore timezone-format differences).
function normalizeTimeForComparison(timeValue) {
  if (!timeValue) return null;

  try {
    // Handle Sequelize.literal value from formatRawDateTimeForDb.
    if (timeValue && typeof timeValue === 'object' && timeValue.val) {
      // Extract timestamp string, e.g. "'2025-11-27 09:09:13'::timestamp".
      const literalStr = String(timeValue.val);
      const match = literalStr.match(/'([^']+)'/);
      if (match && match[1]) {
        return match[1];
      }
    }

    // If already raw format string, return directly.
    if (typeof timeValue === 'string') {
      if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(timeValue)) {
        return timeValue;
      }
      // If ISO format, strip Z and parse as raw local fields.
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(timeValue)) {
        const withoutZ = timeValue.replace('Z', '').replace('T', ' ');
        const [datePart, timePart] = withoutZ.split(' ');
        const [year, month, day] = datePart.split('-').map(Number);
        const [hour, minute, second] = timePart.split(':').map(Number);
        const d = new Date(year, month - 1, day, hour, minute, second || 0);
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      }
    }

    // Handle Date/object values.
    const date = timeValue instanceof Date ? timeValue : new Date(timeValue);
    if (isNaN(date.getTime())) return timeValue;

    // Use local getters (not UTC getters) to keep raw-time semantics.
    const pad = (n) => String(n).padStart(2, '0');
    return (
      date.getFullYear() + '-' +
      pad(date.getMonth() + 1) + '-' +
      pad(date.getDate()) + ' ' +
      pad(date.getHours()) + ':' +
      pad(date.getMinutes()) + ':' +
      pad(date.getSeconds())
    );
  } catch (error) {
    console.warn('Failed to normalize time for comparison:', timeValue, error);
    return timeValue;
  }
}

// Compare two time values after normalization.
function compareTimeValues(time1, time2) {
  if (!time1 && !time2) return true;
  if (!time1 || !time2) return false;

  const normalized1 = normalizeTimeForComparison(time1);
  const normalized2 = normalizeTimeForComparison(time2);

  return normalized1 === normalized2;
}

// Deep compare objects with special handling for time fields.
function deepCompareWithTimeNormalization(obj1, obj2, path = '') {
  if (obj1 === obj2) return true;
  if (obj1 == null || obj2 == null) return false;
  if (typeof obj1 !== typeof obj2) return false;

  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    if (obj1.length !== obj2.length) return false;
    for (let i = 0; i < obj1.length; i++) {
      if (!deepCompareWithTimeNormalization(obj1[i], obj2[i], `${path}[${i}]`)) {
        return false;
      }
    }
    return true;
  }

  if (typeof obj1 === 'object') {
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) return false;

    for (const key of keys1) {
      if (!keys2.includes(key)) return false;

      const currentPath = path ? `${path}.${key}` : key;
      const val1 = obj1[key];
      const val2 = obj2[key];

      // Check if this is a time-like field.
      if (key.toLowerCase().includes('time') || key.toLowerCase().includes('timestamp')) {
        if (!compareTimeValues(val1, val2)) {
          return false;
        }
      } else {
        if (!deepCompareWithTimeNormalization(val1, val2, currentPath)) {
          return false;
        }
      }
    }
    return true;
  }

  // Primitive types: direct comparison.
  return obj1 === obj2;
}

// Compare two surgery payloads and return differences.
function compareSurgeryData(newData, existingData) {
  const differences = [];

  // Compare basic fields.
  const basicFields = [
    'start_time', 'end_time', 'has_fault', 'is_remote', 'success',
    'source_log_ids', 'device_id',
    'log_entry_start_id', 'log_entry_end_id', 'log_entry_start_log_id', 'log_entry_end_log_id'
  ];

  basicFields.forEach(field => {
    const newValue = newData[field];
    const existingValue = existingData[field];

    let isDifferent = false;

    // Time fields are compared using normalized format.
    if (field === 'start_time' || field === 'end_time') {
      const normalizedNew = normalizeTimeForComparison(newValue);
      const normalizedExisting = normalizeTimeForComparison(existingValue);

      // Debug logs for time-field comparison.
      if (field === 'start_time') {
        console.log(`[TIME COMPARE] ${field}:`);
        console.log(`  new raw: ${newValue}`);
        console.log(`  new normalized: ${normalizedNew}`);
        console.log(`  existing raw: ${existingValue}`);
        console.log(`  existing normalized: ${normalizedExisting}`);
        console.log(`  is different: ${normalizedNew !== normalizedExisting}`);
      }

      isDifferent = normalizedNew !== normalizedExisting;
    } else {
      // Other fields: compare with sorted keys to ignore key order.
      isDifferent = jsonStringifySorted(newValue) !== jsonStringifySorted(existingValue);
    }

    if (isDifferent) {
      // For time fields, make sure display values are plain strings.
      let displayNewValue = newValue;
      let displayOldValue = existingValue;

      if (field === 'start_time' || field === 'end_time') {
        // If Sequelize.literal, extract timestamp string.
        if (newValue && typeof newValue === 'object' && newValue.val) {
          const literalStr = String(newValue.val);
          const match = literalStr.match(/'([^']+)'/);
          if (match && match[1]) {
            displayNewValue = match[1];
          }
        }
        // Ensure existing value is also rendered as plain time string.
        if (existingValue) {
          displayOldValue = formatTimeForDisplay(existingValue);
        }
      }

      differences.push({
        field: field,
        fieldName: getFieldDisplayName(field),
        oldValue: displayOldValue,
        newValue: displayNewValue,
        type: 'basic'
      });
    }
  });

  // Compare structured_data.
  if (newData.structured_data || existingData.structured_data) {
    const structuredDiff = compareStructuredData(
      newData.structured_data,
      existingData.structured_data
    );
    differences.push(...structuredDiff);
  }

  return differences;
}

// Compare structured_data differences.
function compareStructuredData(newStructured, existingStructured) {
  const differences = [];

  if (!newStructured && !existingStructured) return differences;
  if (!newStructured || !existingStructured) {
    differences.push({
      field: 'structured_data',
      fieldName: 'structured_data',
      oldValue: existingStructured,
      newValue: newStructured,
      type: 'structured'
    });
    return differences;
  }

  // Compare via deep compare with time normalization.
  if (!deepCompareWithTimeNormalization(newStructured, existingStructured)) {
    differences.push({
      field: 'structured_data',
      fieldName: 'structured_data',
      oldValue: existingStructured,
      newValue: newStructured,
      type: 'structured'
    });
  }

  return differences;
}

// Compare arms/instrument usage data.
function compareArmsData(newArms, existingArms) {
  const differences = [];

  if (!newArms && !existingArms) return differences;
  if (!newArms || !existingArms) {
    differences.push({
      field: 'arms',
      fieldName: 'arms_data',
      oldValue: existingArms,
      newValue: newArms,
      type: 'arms'
    });
    return differences;
  }

  // Compare each arm.
  for (let i = 0; i < Math.max(newArms.length, existingArms.length); i++) {
    const newArm = newArms[i];
    const existingArm = existingArms[i];
    const armId = i + 1;

    if (!newArm || !existingArm) {
      differences.push({
        field: `arm${armId}`,
        fieldName: `arm-${armId}`,
        oldValue: existingArm,
        newValue: newArm,
        type: 'arm'
      });
      continue;
    }

    // Compare instrument usage record count.
    const newUsageCount = newArm.instrument_usage?.length || 0;
    const existingUsageCount = existingArm.instrument_usage?.length || 0;

    if (newUsageCount !== existingUsageCount) {
      differences.push({
        field: `arm${armId}_usage_count`,
        fieldName: `arm-${armId}-usage-count`,
        oldValue: existingUsageCount,
        newValue: newUsageCount,
        type: 'usage_count'
      });
    }
  }

  return differences;
}

// Compare surgery statistics data.
function compareSurgeryStats(newStats, existingStats) {
  const differences = [];

  if (!newStats && !existingStats) return differences;
  if (!newStats || !existingStats) {
    differences.push({
      field: 'surgery_stats',
      fieldName: 'surgery_stats',
      oldValue: existingStats,
      newValue: newStats,
      type: 'stats'
    });
    return differences;
  }

  // Compare stats fields.
  const statsFields = ['success', 'left_hand_clutch', 'right_hand_clutch', 'foot_clutch', 'endoscope_pedal'];
  statsFields.forEach(field => {
    const newValue = newStats[field];
    const existingValue = existingStats[field];

    if (newValue !== existingValue) {
      differences.push({
        field: `stats_${field}`,
        fieldName: getStatsFieldDisplayName(field),
        oldValue: existingValue,
        newValue: newValue,
        type: 'stats_field'
      });
    }
  });

  // Compare fault list count.
  const newFaultCount = newStats.faults?.length || 0;
  const existingFaultCount = existingStats.faults?.length || 0;

  if (newFaultCount !== existingFaultCount) {
    differences.push({
      field: 'fault_count',
      fieldName: 'fault_count',
      oldValue: existingFaultCount,
      newValue: newFaultCount,
      type: 'fault_count'
    });
  }

  return differences;
}

// Get display name for base fields.
function getFieldDisplayName(field) {
  const fieldNames = {
    start_time: 'start_time',
    end_time: 'end_time',
    has_fault: 'has_fault',
    is_remote: 'is_remote',
    success: 'success',
    source_log_ids: 'source_log_ids',
    log_entry_start_id: 'log_entry_start_id',
    log_entry_end_id: 'log_entry_end_id'
  };
  return fieldNames[field] || field;
}

// Get display name for stats fields.
function getStatsFieldDisplayName(field) {
  const fieldNames = {
    success: 'success',
    left_hand_clutch: 'left_hand_clutch',
    right_hand_clutch: 'right_hand_clutch',
    foot_clutch: 'foot_clutch',
    endoscope_pedal: 'endoscope_pedal'
  };
  return fieldNames[field] || field;
}

// Export a single surgery structured payload.
const exportSingleSurgeryData = async (req, res) => {
  try {
    console.log(`[EXPORT] Received single surgery export request: ${req.body?.surgery_id || 'unknown'}`);

    // Use full surgery payload from frontend directly.
    const surgeryData = req.body;

    if (!surgeryData) {
      return res.status(400).json({
        success: false,
        message: 'Missing surgery data'
      });
    }

    // Convert to PostgreSQL row shape.
    const Surgery = require('../models/surgery');
    const postgresqlData = buildDbRowFromSurgery(surgeryData);

    // Check whether surgery_id already exists.
    const existingSurgery = await Surgery.findOne({
      where: { surgery_id: postgresqlData.surgery_id }
    });

    if (existingSurgery) {
      // Existing surgery found: return diff for user confirmation.
      console.log(`[EXPORT] Existing surgery found: ${postgresqlData.surgery_id}`);
      console.log(`[EXPORT] Existing start_time: ${existingSurgery.start_time} (type: ${typeof existingSurgery.start_time})`);

      // Compare using plain object to avoid ORM wrapper side effects.
      const existingPlain = existingSurgery.get ? existingSurgery.get({ plain: true }) : existingSurgery;
      console.log(`[EXPORT] Plain start_time: ${existingPlain.start_time} (type: ${typeof existingPlain.start_time})`);

      const differences = compareSurgeryData(postgresqlData, existingPlain);
      if (differences.length === 0) {
        await clearPendingExportRecordBySurgeryId(postgresqlData.surgery_id);
        return res.json({
          success: true,
          surgery_id: postgresqlData.surgery_id,
          message: `Existing surgery ${postgresqlData.surgery_id} is identical, skipped pending confirmation`
        });
      }
      const pendingExportId = await upsertPendingExportRecord({
        surgeryId: postgresqlData.surgery_id,
        existingPostgresqlId: existingSurgery.id,
        newData: buildPendingPayload(postgresqlData, differences),
        userId: req.user?.id
      });

      // Convert time fields to display-safe plain strings.
      const convertTimeFields = (data) => {
        if (!data) return data;
        const converted = { ...data };
        if (converted.start_time) {
          // If Sequelize.literal, extract timestamp string.
          if (converted.start_time && typeof converted.start_time === 'object' && converted.start_time.val) {
            const literalStr = String(converted.start_time.val);
            const match = literalStr.match(/'([^']+)'/);
            if (match && match[1]) {
              converted.start_time = match[1];
            }
          } else {
            converted.start_time = formatTimeForDisplay(converted.start_time);
          }
        }
        if (converted.end_time) {
          // If Sequelize.literal, extract timestamp string.
          if (converted.end_time && typeof converted.end_time === 'object' && converted.end_time.val) {
            const literalStr = String(converted.end_time.val);
            const match = literalStr.match(/'([^']+)'/);
            if (match && match[1]) {
              converted.end_time = match[1];
            }
          } else {
            converted.end_time = formatTimeForDisplay(converted.end_time);
          }
        }
        return converted;
      };

      res.json({
        success: false,
        needsConfirmation: true,
        surgery_id: postgresqlData.surgery_id,
        pending_export_id: pendingExportId,
        existingData: convertTimeFields(existingPlain),
        newData: convertTimeFields(postgresqlData),
        differences: differences,
        textDiff: buildTextDiffFromDifferences(differences),
        message: `Existing surgery ${postgresqlData.surgery_id} found with ${differences.length} differences`
      });
    } else {
      // No existing surgery with same id: create new row.
      try {
        // Convert time fields to Sequelize.literal before DB write.
        const dbData = { ...postgresqlData };
        if (dbData.start_time) {
          dbData.start_time = formatRawDateTimeForDb(dbData.start_time);
        }
        if (dbData.end_time) {
          dbData.end_time = formatRawDateTimeForDb(dbData.end_time);
        }
        const savedSurgery = await Surgery.create(dbData);
        console.log('Surgery data saved to PostgreSQL:', savedSurgery.surgery_id);

        // Normalize time fields for response display.
        const convertTimeFields = (data) => {
          if (!data) return data;
          const converted = { ...data };
          if (converted.start_time) {
            converted.start_time = formatTimeForDisplay(converted.start_time);
          }
          if (converted.end_time) {
            converted.end_time = formatTimeForDisplay(converted.end_time);
          }
          return converted;
        };

        // Operation log.
        try {
          const { logOperation } = require('../utils/operationLogger');
          await logOperation({
            operation: 'surgery_data_export',
            description: `Export single surgery data: ${savedSurgery.surgery_id}`,
            user_id: req.user?.id,
            username: req.user?.username,
            ip: req.ip,
            user_agent: req.headers['user-agent'],
            details: { surgery_id: savedSurgery.surgery_id, postgresql_id: savedSurgery.id }
          });
        } catch (_) { }

        res.json({
          success: true,
          data: {
            ...convertTimeFields(postgresqlData),
            postgresql_id: savedSurgery.id
          },
          message: 'Surgery data exported and saved to PostgreSQL'
        });
      } catch (dbError) {
        console.warn('PostgreSQL save failed, returning data only:', dbError.message);

        // Normalize time fields for response display.
        const convertTimeFields = (data) => {
          if (!data) return data;
          const converted = { ...data };
          if (converted.start_time) {
            converted.start_time = formatTimeForDisplay(converted.start_time);
          }
          if (converted.end_time) {
            converted.end_time = formatTimeForDisplay(converted.end_time);
          }
          return converted;
        };

        res.json({
          success: true,
          data: convertTimeFields(postgresqlData),
          message: 'Surgery data exported (PostgreSQL save failed)'
        });
      }
    }

  } catch (error) {
    console.error('Failed to export single surgery data:', error);
    res.status(500).json({ message: 'Failed to export single surgery data', error: error.message });
  }
};

// Confirm override for existing surgery data.
const confirmOverrideSurgeryData = async (req, res) => {
  try {
    const { surgeryData, confirmOverride } = req.body;

    if (!surgeryData) {
      return res.status(400).json({
        success: false,
        message: 'Missing surgery data'
      });
    }

    if (!confirmOverride) {
      return res.status(400).json({
        success: false,
        message: 'confirmOverride is required'
      });
    }

    // Convert to PostgreSQL row shape.
    const Surgery = require('../models/surgery');
    const postgresqlData = buildDbRowFromSurgery(surgeryData);

    // Load existing row to update.
    const existingSurgery = await Surgery.findOne({
      where: { surgery_id: postgresqlData.surgery_id }
    });

    if (!existingSurgery) {
      return res.status(404).json({
        success: false,
        message: 'Surgery to override not found'
      });
    }

    // Convert time fields to Sequelize.literal before update.
    const dbData = { ...postgresqlData };
    if (dbData.start_time) {
      dbData.start_time = formatRawDateTimeForDb(dbData.start_time);
    }
    if (dbData.end_time) {
      dbData.end_time = formatRawDateTimeForDb(dbData.end_time);
    }

    // Execute override update.
    const updatedSurgery = await existingSurgery.update(dbData);
    console.log('Surgery data overridden:', updatedSurgery.surgery_id);

    // Normalize time fields for response display.
    const convertTimeFields = (data) => {
      if (!data) return data;
      const converted = { ...data };
      if (converted.start_time) {
        converted.start_time = formatTimeForDisplay(converted.start_time);
      }
      if (converted.end_time) {
        converted.end_time = formatTimeForDisplay(converted.end_time);
      }
      return converted;
    };

    res.json({
      success: true,
      data: {
        ...convertTimeFields(postgresqlData),
        postgresql_id: updatedSurgery.id
      },
      message: 'Surgery data overridden in PostgreSQL successfully'
    });

  } catch (error) {
    console.error('Failed to override surgery data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to override surgery data',
      error: error.message
    });
  }
};

module.exports = {
  getAllSurgeryStatistics,
  analyzeSortedLogEntries,
  analyzeByLogIds,
  analyzeByDeviceRange,
  exportSurgeryReport,
  analyzeSurgeries,
  getAnalysisTaskStatus,
  getUserAnalysisTasks,
  getGlobalActiveAnalysisTasks,
  getPendingExports,
  getPendingExportDetail,
  resolvePendingExport,
  exportPostgreSQLData,
  exportSingleSurgeryData,
  confirmOverrideSurgeryData,
  getPostgreSQLSurgeries,
  autoImportSurgeries
};
