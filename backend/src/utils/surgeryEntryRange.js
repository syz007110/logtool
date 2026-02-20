function toMs(value) {
  if (value === null || value === undefined || value === '') return NaN;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function lowerBound(arr, target) {
  let left = 0;
  let right = arr.length;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (arr[mid] < target) left = mid + 1;
    else right = mid;
  }
  return left;
}

function upperBound(arr, target) {
  let left = 0;
  let right = arr.length;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (arr[mid] <= target) left = mid + 1;
    else right = mid;
  }
  return left;
}

function getSurgeryWindowMs(surgery) {
  const surgeryStart = toMs(surgery?.surgery_start_time);
  const surgeryEnd = toMs(surgery?.surgery_end_time);
  if (!Number.isFinite(surgeryStart) || !Number.isFinite(surgeryEnd)) {
    return null;
  }

  const powerOnTimes = Array.isArray(surgery?.power_on_times) ? surgery.power_on_times : [];
  const shutdownTimes = Array.isArray(surgery?.shutdown_times) ? surgery.shutdown_times : [];

  let windowStart = surgeryStart;
  let windowEnd = surgeryEnd;

  const validPowerOnTimes = powerOnTimes
    .map((time) => toMs(time))
    .filter((time) => Number.isFinite(time) && time <= surgeryStart)
    .sort((a, b) => b - a);
  if (validPowerOnTimes.length > 0) {
    windowStart = validPowerOnTimes[0];
  }

  const validShutdownTimes = shutdownTimes
    .map((time) => toMs(time))
    .filter((time) => Number.isFinite(time) && time >= surgeryEnd)
    .sort((a, b) => a - b);
  if (validShutdownTimes.length > 0) {
    windowEnd = validShutdownTimes[0];
  }

  return { windowStart, windowEnd };
}

function buildSurgeryEntryRangeResolver(entries) {
  const normalizedEntries = (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const timestampMs = toMs(entry?.timestamp);
      const logId = toFiniteNumber(entry?.log_id);
      const entryId = toFiniteNumber(
        entry && entry.id !== undefined && entry.id !== null ? entry.id : entry?.row_index
      );
      return {
        timestampMs,
        logId,
        entryId
      };
    })
    .filter((entry) => Number.isFinite(entry.timestampMs))
    .sort((a, b) => a.timestampMs - b.timestampMs);

  return {
    normalizedEntries,
    timestamps: normalizedEntries.map((entry) => entry.timestampMs)
  };
}

function computeSourceAndEntryRangeByWindow(surgery, resolver) {
  try {
    const window = getSurgeryWindowMs(surgery);
    if (!window) {
      return {
        sourceLogIds: [],
        startEntryId: null,
        endEntryId: null,
        startLogId: null,
        endLogId: null,
        entryRangesByLogId: null
      };
    }

    const timestamps = resolver?.timestamps || [];
    const normalizedEntries = resolver?.normalizedEntries || [];
    if (timestamps.length === 0 || normalizedEntries.length === 0) {
      return {
        sourceLogIds: [],
        startEntryId: null,
        endEntryId: null,
        startLogId: null,
        endLogId: null,
        entryRangesByLogId: null
      };
    }

    const left = lowerBound(timestamps, window.windowStart);
    const rightExclusive = upperBound(timestamps, window.windowEnd);
    if (left >= rightExclusive) {
      return {
        sourceLogIds: [],
        startEntryId: null,
        endEntryId: null,
        startLogId: null,
        endLogId: null,
        entryRangesByLogId: null
      };
    }

    const sourceLogIdSet = new Set();
    let startEntryId = null;
    let endEntryId = null;
    let startLogId = null;
    let endLogId = null;
    const perLogRanges = new Map();

    for (let i = left; i < rightExclusive; i++) {
      const item = normalizedEntries[i];
      if (item.logId !== null) {
        sourceLogIdSet.add(item.logId);
      }
      if (item.entryId === null) continue;

      if (startEntryId === null) {
        startEntryId = item.entryId;
        startLogId = item.logId;
      }
      endEntryId = item.entryId;
      endLogId = item.logId;

      if (item.logId !== null) {
        const current = perLogRanges.get(item.logId) || {
          log_entry_start_id: item.entryId,
          log_entry_end_id: item.entryId
        };
        if (item.entryId < current.log_entry_start_id) current.log_entry_start_id = item.entryId;
        if (item.entryId > current.log_entry_end_id) current.log_entry_end_id = item.entryId;
        perLogRanges.set(item.logId, current);
      }
    }

    const sourceLogIds = Array.from(sourceLogIdSet).sort((a, b) => a - b);
    const entryRangesByLogId = {};
    for (const [logId, range] of perLogRanges.entries()) {
      entryRangesByLogId[String(logId)] = range;
    }

    return {
      sourceLogIds,
      startEntryId,
      endEntryId,
      startLogId,
      endLogId,
      entryRangesByLogId: Object.keys(entryRangesByLogId).length > 0 ? entryRangesByLogId : null
    };
  } catch (_) {
    return {
      sourceLogIds: [],
      startEntryId: null,
      endEntryId: null,
      startLogId: null,
      endLogId: null,
      entryRangesByLogId: null
    };
  }
}

function applyEntryRangeToSurgery(surgery, range, options = {}) {
  const fallbackLogId = toFiniteNumber(options.fallbackLogId);
  const sourceLogIds = Array.isArray(range?.sourceLogIds) ? range.sourceLogIds : [];
  surgery.source_log_ids = sourceLogIds.length > 0
    ? sourceLogIds
    : (fallbackLogId !== null ? [fallbackLogId] : []);
  surgery.log_entry_start_id = range?.startEntryId ?? null;
  surgery.log_entry_end_id = range?.endEntryId ?? null;
  surgery.log_entry_start_log_id = range?.startLogId ?? null;
  surgery.log_entry_end_log_id = range?.endLogId ?? null;
  surgery.log_entry_ranges_by_log_id = range?.entryRangesByLogId || null;
}

module.exports = {
  buildSurgeryEntryRangeResolver,
  computeSourceAndEntryRangeByWindow,
  applyEntryRangeToSurgery
};
