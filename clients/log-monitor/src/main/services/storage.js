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

module.exports = { loadTasks, saveTasks, computeFileHash, hasSuccessByHash };


