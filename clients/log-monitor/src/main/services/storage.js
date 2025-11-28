const fs = require('fs');
const path = require('path');
let Database = null;
try { Database = require('better-sqlite3'); } catch {}

const TASKS_FILE = 'tasks.json';

function getDataDir(getAppDataDir) {
  const dir = getAppDataDir();
  const tasksDir = path.join(dir, 'data');
  if (!fs.existsSync(tasksDir)) fs.mkdirSync(tasksDir, { recursive: true });
  return tasksDir;
}

function getDbPath(getAppDataDir) {
  return path.join(getDataDir(getAppDataDir), 'upload_tasks.db');
}

function getTasksPath(getAppDataDir) {
  return path.join(getDataDir(getAppDataDir), TASKS_FILE);
}

function getStatsPath(getAppDataDir) {
  return path.join(getDataDir(getAppDataDir), 'task_stats.json');
}

function openDb(getAppDataDir) {
  if (!Database) return null;
  try {
    const dbPath = getDbPath(getAppDataDir);
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec(`CREATE TABLE IF NOT EXISTS upload_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      file_path TEXT NOT NULL UNIQUE,
      file_hash TEXT,
      status TEXT CHECK( status IN ('pending','uploading','success','failed') ) DEFAULT 'pending',
      retry_count INTEGER DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`);
    return db;
  } catch (e) {
    try { console.warn('better-sqlite3 unavailable, fallback to JSON:', e && e.message ? e.message : String(e)); } catch {}
    return null;
  }
}

function computeFileHash(filePath) {
  try {
    const crypto = require('crypto');
    const fd = fs.openSync(filePath, 'r');
    const hash = crypto.createHash('md5');
    const buf = Buffer.allocUnsafe(1024 * 1024);
    let bytes = 0;
    do {
      bytes = fs.readSync(fd, buf, 0, buf.length, null);
      if (bytes > 0) hash.update(buf.subarray(0, bytes));
    } while (bytes > 0);
    fs.closeSync(fd);
    return hash.digest('hex');
  } catch { return null; }
}

function hasSuccessByHash(getAppDataDir, fileHash) {
  if (!fileHash) return false;
  const db = openDb(getAppDataDir);
  if (db) {
    try {
      const row = db.prepare('SELECT 1 FROM upload_tasks WHERE file_hash=? AND status=\'success\' LIMIT 1').get(fileHash);
      return !!row;
    } catch { return false; }
    finally { try { db.close(); } catch {} }
  }
  // JSON 回退
  try {
    const tasks = loadTasks(getAppDataDir) || [];
    return tasks.some(t => t && t.status === 'success' && t.file_hash === fileHash);
  } catch { return false; }
}

function loadTasks(getAppDataDir) {
  const db = openDb(getAppDataDir);
  if (db) {
    try {
      // 启动时将可能遗留的 uploading 置回 pending
      db.prepare(`UPDATE upload_tasks SET status='pending' WHERE status='uploading'`).run();
      const rows = db.prepare('SELECT device_id, file_path, file_hash, status, retry_count, last_error, created_at, updated_at FROM upload_tasks').all();
      return rows.map(r => ({ device_id: r.device_id, file_path: r.file_path, decrypt_key: null, status: r.status, retry_count: r.retry_count, last_error: r.last_error, file_hash: r.file_hash, created_at: r.created_at, updated_at: r.updated_at }));
    } catch { return []; }
    finally { try { db.close(); } catch {} }
  }
  // 退化到 JSON 文件
  const p = getTasksPath(getAppDataDir);
  if (!fs.existsSync(p)) return [];
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    return JSON.parse(raw) || [];
  } catch (e) {
    return [];
  }
}

function saveTasks(getAppDataDir, tasks) {
  const db = openDb(getAppDataDir);
  if (db) {
    try {
      const insert = db.prepare(`INSERT INTO upload_tasks (device_id, file_path, file_hash, status, retry_count, last_error, created_at, updated_at)
        VALUES (@device_id, @file_path, @file_hash, @status, @retry_count, @last_error, COALESCE(@created_at, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
        ON CONFLICT(file_path) DO UPDATE SET status=excluded.status, retry_count=excluded.retry_count, last_error=excluded.last_error, updated_at=CURRENT_TIMESTAMP`);
      const updateUploadingToPending = db.prepare(`UPDATE upload_tasks SET status='pending' WHERE status='uploading'`);
      updateUploadingToPending.run();
      const unique = new Map();
      for (const t of tasks || []) {
        if (!t || !t.file_path) continue;
        if (!t.file_hash) t.file_hash = computeFileHash(t.file_path) || null;
        unique.set(t.file_path.toLowerCase(), {
          device_id: t.device_id || '',
          file_path: t.file_path,
          file_hash: t.file_hash || null,
          status: t.status || 'pending',
          retry_count: t.retry_count || 0,
          last_error: t.last_error || null,
          created_at: t.created_at || null
        });
      }
      const tx = db.transaction((rows) => {
        for (const row of rows.values()) insert.run(row);
      });
      tx(unique);
      
      // 清理成功记录：超过保留天数删除
      try {
        const cfg = require('./config');
      } catch {}
      return;
    } catch {}
    finally { try { db.close(); } catch {} }
  }
  // 退化到 JSON 文件
  const p = getTasksPath(getAppDataDir);
  fs.writeFileSync(p, JSON.stringify(tasks, null, 2), 'utf-8');
}

// 获取任务统计（持久化）
function getTaskStats(getAppDataDir) {
  const p = getStatsPath(getAppDataDir);
  if (!fs.existsSync(p)) {
    return { total: 0, success: 0, failed: 0 };
  }
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    const stats = JSON.parse(raw) || {};
    return {
      total: stats.total || 0,
      success: stats.success || 0,
      failed: stats.failed || 0
    };
  } catch (e) {
    return { total: 0, success: 0, failed: 0 };
  }
}

// 清空任务统计（持久化）
function clearTaskStats(getAppDataDir) {
  const p = getStatsPath(getAppDataDir);
  try {
    const stats = { total: 0, success: 0, failed: 0 };
    fs.writeFileSync(p, JSON.stringify(stats, null, 2), 'utf-8');
    return stats;
  } catch (e) {
    console.warn('Failed to clear task stats:', e.message);
    return { total: 0, success: 0, failed: 0 };
  }
}

// 更新任务统计（持久化）
// stats 可以是增量 { total: +1, success: +1, failed: +1 } 或绝对值
function updateTaskStats(getAppDataDir, stats, isIncrement = false) {
  const p = getStatsPath(getAppDataDir);
  try {
    const current = getTaskStats(getAppDataDir);
    let updated;
    if (isIncrement) {
      // 增量更新（只增不减）
      updated = {
        total: current.total + (stats.total || 0),
        success: current.success + (stats.success || 0),
        failed: current.failed + (stats.failed || 0)
      };
    } else {
      // 绝对值更新（使用 Math.max 确保只增不减，即使内存队列被清理）
      updated = {
        total: Math.max(current.total, stats.total || current.total),
        success: Math.max(current.success, stats.success || current.success),
        failed: Math.max(current.failed, stats.failed || current.failed)
      };
    }
    fs.writeFileSync(p, JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  } catch (e) {
    console.warn('Failed to update task stats:', e.message);
    return getTaskStats(getAppDataDir);
  }
}

// 从数据库计算实际统计（用于初始化或修复）
function computeTaskStatsFromDb(getAppDataDir) {
  const db = openDb(getAppDataDir);
  if (db) {
    try {
      const total = db.prepare('SELECT COUNT(*) as count FROM upload_tasks').get().count || 0;
      const success = db.prepare('SELECT COUNT(*) as count FROM upload_tasks WHERE status=\'success\'').get().count || 0;
      const failed = db.prepare('SELECT COUNT(*) as count FROM upload_tasks WHERE status=\'failed\'').get().count || 0;
      return { total, success, failed };
    } catch { return { total: 0, success: 0, failed: 0 }; }
    finally { try { db.close(); } catch {} }
  }
  // JSON 回退
  try {
    const tasks = loadTasks(getAppDataDir) || [];
    return {
      total: tasks.length,
      success: tasks.filter(t => t.status === 'success').length,
      failed: tasks.filter(t => t.status === 'failed').length
    };
  } catch { return { total: 0, success: 0, failed: 0 }; }
}

module.exports = { loadTasks, saveTasks, computeFileHash, hasSuccessByHash, getTaskStats, updateTaskStats, clearTaskStats, computeTaskStatsFromDb };

// 根据文件路径集合执行状态迁移，并返回应增量到 stats 的 { totalDelta, successDelta, failedDelta }
function applyStatusTransitionsAndGetDeltas(getAppDataDir, items, newStatus) {
  const keyItems = (Array.isArray(items) ? items : []).map(it => ({
    file_path: it && it.file_path ? String(it.file_path) : null,
    file_hash: it && it.file_hash ? String(it.file_hash) : null
  })).filter(it => it.file_path);
  if (keyItems.length === 0) return { totalDelta: 0, successDelta: 0, failedDelta: 0 };
  const db = openDb(getAppDataDir);
  let totalDelta = 0;
  let successDelta = 0;
  let failedDelta = 0;
  if (db) {
    try {
      const select = db.prepare('SELECT status FROM upload_tasks WHERE file_path=?');
      const upsert = db.prepare(`INSERT INTO upload_tasks (device_id, file_path, file_hash, status, retry_count, last_error, created_at, updated_at)
        VALUES ('', ?, ?, ?, 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(file_path) DO UPDATE SET status=excluded.status, updated_at=CURRENT_TIMESTAMP`);
      const updateOnly = db.prepare(`UPDATE upload_tasks SET status=?, updated_at=CURRENT_TIMESTAMP WHERE file_path=?`);
      const tx = db.transaction((rows) => {
        for (const it of rows) {
          const row = select.get(it.file_path);
          const prev = row ? row.status : null;
          if (!prev) {
            // first time we see this file in DB
            upsert.run(it.file_path, it.file_hash || null, newStatus);
            totalDelta += 1; // 新任务，total 增加
            if (newStatus === 'success') successDelta += 1;
            else if (newStatus === 'failed') failedDelta += 1;
          } else if (prev === newStatus) {
            // no-op
          } else if (prev === 'failed' && newStatus === 'success') {
            // succeed after failed -> move 1 from failed to success
            updateOnly.run('success', it.file_path);
            failedDelta -= 1;
            successDelta += 1;
          } else if ((prev === 'pending' || prev === 'uploading') && (newStatus === 'success' || newStatus === 'failed')) {
            updateOnly.run(newStatus, it.file_path);
            if (newStatus === 'success') successDelta += 1;
            else if (newStatus === 'failed') failedDelta += 1;
          } else {
            // prev success then failed (unlikely) -> ignore to keep monotonicity
          }
        }
      });
      tx(keyItems);
    } catch (_) {
      // fall back to JSON if DB ops failed
    } finally {
      try { db.close(); } catch {}
    }
  }
  if (successDelta === 0 && failedDelta === 0) {
    // JSON fallback path
    try {
      const p = getTasksPath(getAppDataDir);
      const tasks = loadTasks(getAppDataDir) || [];
      const byPath = new Map((tasks || []).map(t => [String(t.file_path), t]));
      for (const it of keyItems) {
        const t = byPath.get(it.file_path);
        const prev = t ? t.status : null;
        if (!t) {
          tasks.push({ device_id: '', file_path: it.file_path, file_hash: it.file_hash || null, status: newStatus, retry_count: 0, last_error: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
          totalDelta += 1; // 新任务，total 增加
          if (newStatus === 'success') successDelta += 1;
          else if (newStatus === 'failed') failedDelta += 1;
        } else if (prev === newStatus) {
          // no-op
        } else if (prev === 'failed' && newStatus === 'success') {
          t.status = 'success';
          t.updated_at = new Date().toISOString();
          failedDelta -= 1;
          successDelta += 1;
        } else if ((prev === 'pending' || prev === 'uploading') && (newStatus === 'success' || newStatus === 'failed')) {
          t.status = newStatus;
          t.updated_at = new Date().toISOString();
          if (newStatus === 'success') successDelta += 1;
          else if (newStatus === 'failed') failedDelta += 1;
        }
      }
      fs.writeFileSync(p, JSON.stringify(tasks, null, 2), 'utf-8');
    } catch (_) {}
  }
  return { totalDelta, successDelta, failedDelta };
}

module.exports.applyStatusTransitionsAndGetDeltas = applyStatusTransitionsAndGetDeltas;
