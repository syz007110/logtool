const fs = require('fs');
const path = require('path');

const faultCaseStorage = require('../config/faultCaseStorage');
const techSolutionStorage = require('../config/techSolutionStorage');

function parseIntOr(val, fallback) {
  const n = Number.parseInt(String(val ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function boolEnvTrue(name) {
  return String(process.env[name] || '').toLowerCase() === 'true';
}

function nowMs() {
  return Date.now();
}

async function cleanupLocalDir({ label, dirPath, cutoffMs, log }) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    let deleted = 0;
    let skipped = 0;
    for (const ent of entries) {
      if (!ent || !ent.isFile()) {
        skipped += 1;
        continue;
      }
      const fp = path.resolve(dirPath, ent.name);
      try {
        const st = fs.statSync(fp);
        const t = Number(st.mtimeMs || 0);
        if (t && t < cutoffMs) {
          fs.unlinkSync(fp);
          deleted += 1;
        } else {
          skipped += 1;
        }
      } catch (_) {
        skipped += 1;
      }
    }
    if (deleted > 0) log(`[tmp-cleaner] ${label} local: deleted=${deleted}, skipped=${skipped}`);
  } catch (e) {
    log(`[tmp-cleaner] ${label} local cleanup failed: ${e.message || e}`);
  }
}

async function cleanupOssPrefix({ label, getClient, prefix, cutoffMs, log }) {
  let client;
  try {
    client = await getClient();
  } catch (e) {
    log(`[tmp-cleaner] ${label} oss client init failed: ${e.message || e}`);
    return;
  }
  if (!client) return;

  const p = String(prefix || '').replace(/^\//, '');
  if (!p) return;

  let marker = null;
  let totalDeleted = 0;
  let totalScanned = 0;

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const resp = await client.list({ prefix: p, marker, 'max-keys': 1000 });
      const objects = Array.isArray(resp?.objects) ? resp.objects : [];
      totalScanned += objects.length;

      const toDelete = [];
      for (const obj of objects) {
        const key = obj?.name;
        if (!key) continue;
        const lm = obj?.lastModified ? new Date(obj.lastModified).getTime() : 0;
        if (lm && lm < cutoffMs) toDelete.push(key);
      }

      if (toDelete.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        const delResp = await client.deleteMulti(toDelete, { quiet: true });
        const deleted = Array.isArray(delResp?.deleted) ? delResp.deleted.length : toDelete.length;
        totalDeleted += deleted;
      }

      const isTruncated = !!resp?.isTruncated;
      marker = resp?.nextMarker || null;
      if (!isTruncated) break;
    }
  } catch (e) {
    log(`[tmp-cleaner] ${label} oss cleanup failed: ${e.message || e}`);
    return;
  }

  if (totalDeleted > 0) {
    log(`[tmp-cleaner] ${label} oss: deleted=${totalDeleted}, scanned=${totalScanned}`);
  }
}

async function runOnce({ log }) {
  // Global TTL default (hours)
  const defaultTtlHours = parseIntOr(process.env.TMP_CLEANUP_TTL_HOURS, 24);
  const cutoffDefault = nowMs() - Math.max(1, defaultTtlHours) * 60 * 60 * 1000;

  // ---- fault-cases tmp ----
  if (!boolEnvTrue('FAULT_CASE_TMP_CLEANUP_DISABLED')) {
    const ttlHours = parseIntOr(process.env.FAULT_CASE_TMP_TTL_HOURS, defaultTtlHours);
    const cutoffMs = nowMs() - Math.max(1, ttlHours) * 60 * 60 * 1000;
    if (faultCaseStorage.STORAGE === 'oss') {
      await cleanupOssPrefix({
        label: 'fault-cases',
        getClient: faultCaseStorage.getOssClient,
        prefix: faultCaseStorage.TMP_PREFIX,
        cutoffMs,
        log
      });
    } else {
      await cleanupLocalDir({ label: 'fault-cases', dirPath: faultCaseStorage.TMP_DIR, cutoffMs, log });
    }
  }

  // ---- tech-solution tmp ----
  if (!boolEnvTrue('TECH_SOLUTION_TMP_CLEANUP_DISABLED') && !boolEnvTrue('FAULT_CASE_TMP_CLEANUP_DISABLED')) {
    const ttlHours = parseIntOr(process.env.TECH_SOLUTION_TMP_TTL_HOURS, defaultTtlHours);
    const cutoffMs = nowMs() - Math.max(1, ttlHours) * 60 * 60 * 1000;
    if (techSolutionStorage.STORAGE === 'oss') {
      await cleanupOssPrefix({
        label: 'tech-solution',
        getClient: techSolutionStorage.getOssClient,
        prefix: techSolutionStorage.TMP_PREFIX,
        cutoffMs,
        log
      });
    } else {
      await cleanupLocalDir({ label: 'tech-solution', dirPath: techSolutionStorage.TMP_DIR, cutoffMs, log });
    }
  }

  // ---- motion-data upload tmp (local only) ----
  if (!boolEnvTrue('MOTION_DATA_TMP_CLEANUP_DISABLED')) {
    const ttlHours = parseIntOr(process.env.MOTION_DATA_TMP_TTL_HOURS, defaultTtlHours);
    const cutoffMs = nowMs() - Math.max(1, ttlHours) * 60 * 60 * 1000;
    const dirPath = process.env.MOTION_DATA_TMP_DIR
      ? String(process.env.MOTION_DATA_TMP_DIR)
      : path.resolve(__dirname, '../../uploads/temp');
    await cleanupLocalDir({ label: 'motion-data', dirPath, cutoffMs, log });
    
    // 清理 motion-data 结果目录（ZIP文件）
    const resultDirPath = path.resolve(__dirname, '../../uploads/temp/motion-data');
    await cleanupLocalDir({ label: 'motion-data-results', dirPath: resultDirPath, cutoffMs, log });
  }

  // Optional: a super-simple safety sweep for any tmp cleanup when TTL is used elsewhere
  // (kept as a placeholder; currently unused)
  // eslint-disable-next-line no-unused-vars
  const _cutoffDefault = cutoffDefault;
}

function startTempCleanupJob() {
  // One global switch
  const disabled = boolEnvTrue('TMP_CLEANUP_DISABLED');
  if (disabled) return { stop: () => {}, runOnce: () => Promise.resolve() };

  const intervalMin = parseIntOr(process.env.TMP_CLEANUP_INTERVAL_MIN, 30);
  const intervalMs = Math.max(1, intervalMin) * 60 * 1000;

  const log = (msg) => console.log(msg);

  const bootTimer = setTimeout(() => {
    runOnce({ log });
  }, 30 * 1000);

  const timer = setInterval(() => {
    runOnce({ log });
  }, intervalMs);

  timer.unref?.();

  log(`[tmp-cleaner] started: intervalMin=${intervalMin}`);

  return {
    stop: () => {
      clearTimeout(bootTimer);
      clearInterval(timer);
    },
    runOnce: () => runOnce({ log })
  };
}

module.exports = {
  startTempCleanupJob
};

