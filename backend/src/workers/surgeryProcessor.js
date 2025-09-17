const LogEntry = require('../models/log_entry');
const Log = require('../models/log');
const { Op } = require('sequelize');
const SurgeryAnalyzer = require('../services/surgeryAnalyzer');
const { buildPostgresRowPreview } = require('../utils/surgeryTransform');

// 与控制器保持一致：格式化时间为YYYYMMDDHHMM
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

// 与控制器保持一致：计算来源日志与条目范围（基于开机/关机时间的扩展时间窗口）
function computeSourceAndEntryRange(surgery, entries) {
  try {
    const surgeryStart = new Date(surgery.surgery_start_time).getTime();
    const surgeryEnd = new Date(surgery.surgery_end_time).getTime();
    if (!Number.isFinite(surgeryStart) || !Number.isFinite(surgeryEnd)) {
      return { sourceLogIds: [], minEntryId: null, maxEntryId: null };
    }

    const powerOnTimes = surgery.power_on_times || [];
    const shutdownTimes = surgery.shutdown_times || [];

    let windowStart = surgeryStart;
    let windowEnd = surgeryEnd;

    const validPowerOnTimes = powerOnTimes
      .map(time => new Date(time).getTime())
      .filter(time => Number.isFinite(time) && time <= surgeryStart)
      .sort((a, b) => b - a);
    if (validPowerOnTimes.length > 0) {
      windowStart = validPowerOnTimes[0];
    }

    const validShutdownTimes = shutdownTimes
      .map(time => new Date(time).getTime())
      .filter(time => Number.isFinite(time) && time >= surgeryEnd)
      .sort((a, b) => a - b);
    if (validShutdownTimes.length > 0) {
      windowEnd = validShutdownTimes[0];
    }

    const involved = entries.filter(e => {
      const t = new Date(e.timestamp).getTime();
      return Number.isFinite(t) && t >= windowStart && t <= windowEnd;
    });

    const sourceLogIds = Array.from(new Set(involved.map(e => e.log_id).filter(Boolean)));
    const ids = involved.map(e => e.id).filter(id => typeof id !== 'undefined');
    if (ids.length) {
      const numeric = ids.map(n => Number(n)).filter(v => Number.isFinite(v));
      return {
        sourceLogIds,
        minEntryId: numeric.length ? Math.min(...numeric) : null,
        maxEntryId: numeric.length ? Math.max(...numeric) : null
      };
    }
    return { sourceLogIds, minEntryId: null, maxEntryId: null };
  } catch (_) {
    return { sourceLogIds: [], minEntryId: null, maxEntryId: null };
  }
}

// 共享分析逻辑：尽量复用控制器中的实现，不改变核心分析逻辑
async function processSurgeryAnalysisJob(job) {
  const { logIds, includePostgreSQLStructure = false } = job.data || {};

  if (!Array.isArray(logIds) || logIds.length === 0) {
    throw new Error('logIds不能为空');
  }

  // 获取所有日志条目（与控制器逻辑一致）
  const allLogEntries = [];
  let processedLogs = 0;
  const logIdToDeviceId = new Map();

  for (const logId of logIds) {
    try {
      const progress = Math.round((processedLogs / logIds.length) * 80);
      await job.progress(progress);

      const logEntries = await LogEntry.findAll({
        where: { log_id: logId },
        order: [['timestamp', 'ASC']],
        raw: true
      });

      const logInfo = await Log.findByPk(logId);
      const logName = logInfo ? logInfo.original_name : `日志${logId}`;
      if (logInfo && logInfo.device_id) {
        logIdToDeviceId.set(logId, logInfo.device_id);
      }

      const entriesWithLogName = logEntries.map(entry => ({
        ...entry,
        log_name: logName
      }));

      allLogEntries.push(...entriesWithLogName);
      processedLogs++;
    } catch (e) {
      processedLogs++;
    }
  }

  if (allLogEntries.length === 0) {
    throw new Error('未找到任何日志条目数据');
  }

  // 分析（与控制器使用的分析器一致）
  const analyzer = new SurgeryAnalyzer();
  const surgeries = analyzer.analyze(allLogEntries);

  if (includePostgreSQLStructure === true) {
    surgeries.forEach((surgery) => {
      try {
        surgery.postgresql_structure = analyzer.toPostgreSQLStructure(surgery);
      } catch (_) {}
    });
  }

  // 附加元数据（严格对齐控制器processAnalysisTask中的逻辑）
  surgeries.forEach((surgery, index) => {
    surgery.id = index + 1;
    const deviceDisplayId = surgery.log_id && logIdToDeviceId.get(surgery.log_id) !== undefined && logIdToDeviceId.get(surgery.log_id) !== null
      ? String(logIdToDeviceId.get(surgery.log_id))
      : 'UNKNOWN';
    surgery.device_id = deviceDisplayId;
    surgery.device_ids = deviceDisplayId ? [deviceDisplayId] : [];
    // 生成与原逻辑一致的surgery_id
    surgery.surgery_id = `${deviceDisplayId}-${formatTimeForId(surgery.surgery_start_time)}`;
    // 计算来源日志与条目范围
    const { sourceLogIds, minEntryId, maxEntryId } = computeSourceAndEntryRange(surgery, allLogEntries);
    surgery.source_log_ids = sourceLogIds.length ? sourceLogIds : [];
    surgery.log_entry_start_id = minEntryId;
    surgery.log_entry_end_id = maxEntryId;
    // 需要PostgreSQL预览时，生成与控制器一致的preview结构
    if (includePostgreSQLStructure === true) {
      surgery.postgresql_row_preview = buildPostgresRowPreview(surgery, deviceDisplayId);
    }
  });

  await job.progress(100);
  return { surgeries };
}

module.exports = {
  processSurgeryAnalysisJob
};


