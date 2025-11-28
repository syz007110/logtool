const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { updateTaskStats, applyStatusTransitionsAndGetDeltas } = require('./storage');

class UploaderService {
  constructor(opts) {
    this.opts = opts; // { getConfig, log?, ensureAuth? }
    this.concurrency = 3;
    this.queue = [];
    this.active = 0;
    this.listeners = { status: null };
  }

  onStatus(listener) { this.listeners.status = listener; }

  setConcurrency(n) { this.concurrency = Math.max(0, n | 0); }

  enqueue(task) { // { device_id, file_path, decrypt_key, file_hash?, upload_path?, created_at?, updated_at? }
    // 内容级去重（优先按文件hash，防止同一内容在不同路径/压缩包重复上传）
    try {
      if (task.file_hash) {
        const existsInQueue = this.queue.find(t => t && t.file_hash === task.file_hash && (t.status === 'pending' || t.status === 'uploading' || t.status === 'success'));
        if (existsInQueue) return;
        try {
          const { loadTasks } = require('./storage');
          const persisted = loadTasks(this.opts.appDataDir || (()=>'')) || [];
          const existsPersisted = persisted.find(t => t && t.file_hash === task.file_hash && (t.status === 'pending' || t.status === 'uploading' || t.status === 'success'));
          if (existsPersisted) return;
        } catch {}
      }
    } catch {}

    // 路径级去重（按文件绝对路径 + mtime）
    const stat = fs.existsSync(task.file_path) ? fs.statSync(task.file_path) : null;
    const signature = stat ? `${task.file_path}|${stat.mtimeMs}` : task.file_path;
    if (this.queue.find(t => t.signature === signature)) return;
    // 可选：避免重复上传已成功文件（读取持久化状态）
    try {
      const { loadTasks, hasSuccessByHash } = require('./storage');
      const tasks = loadTasks(this.opts.appDataDir || (()=>''));
      if (Array.isArray(tasks)) {
        const successPath = tasks.find(t => t && t.file_path === task.file_path && t.status === 'success');
        if (successPath) return;
      }
      if (task.file_hash && hasSuccessByHash(this.opts.appDataDir || (()=>''), task.file_hash)) return;
    } catch {}
    this.queue.push({ 
      ...task, 
      signature, 
      status: 'pending', 
      retry_count: 0, 
      last_error: null, 
      created_at: task.created_at || new Date().toISOString(), 
      updated_at: task.updated_at || new Date().toISOString() 
    });
    
    // 更新持久化统计（新任务）
    try {
      const currentStats = this._getCurrentStats();
      updateTaskStats(this.opts.appDataDir || (()=>''), {
        total: currentStats.total,
        success: currentStats.success,
        failed: currentStats.failed
      });
    } catch {}
    
    this._pump();
  }

  restore(tasks) {
    for (const t of tasks) {
      if (t && t.file_path) {
        this.enqueue({ device_id: t.device_id || '', file_path: t.file_path, decrypt_key: t.decrypt_key, file_hash: t.file_hash, created_at: t.created_at, updated_at: t.updated_at });
      }
    }
  }

  async _pump() {
    while (this.active < this.concurrency) {
      // 批量获取任务：最多20个，必须具有相同的 device_id 和 decrypt_key
      const batch = this._getBatch(20);
      if (!batch || batch.length === 0) return;
      this._startBatch(batch);
    }
  }

  _getBatch(maxSize) {
    const pendingTasks = this.queue.filter(t => t.status === 'pending' || t.status === 'failed');
    if (pendingTasks.length === 0) return null;

    // 按 (device_id, decrypt_key) 分组，优先处理第一组
    const firstTask = pendingTasks[0];
    const deviceId = firstTask.device_id || '';
    const decryptKey = firstTask.decrypt_key || '';

    // 找出具有相同 device_id 和 decrypt_key 的任务
    const batch = pendingTasks.filter(t => 
      (t.device_id || '') === deviceId && (t.decrypt_key || '') === decryptKey
    ).slice(0, maxSize);

    return batch.length > 0 ? batch : null;
  }

  async _startBatch(tasks) {
    if (!tasks || tasks.length === 0) return;
    
    this.active++;
    // 将所有任务标记为上传中
    const now = new Date().toISOString();
    tasks.forEach(task => {
      task.status = 'uploading';
      task.updated_at = now;
    });
    this._notify();

    try {
      const cfg = await this.opts.getConfig();
      // 确保 token 可用（自动刷新）
      if (typeof this.opts.ensureAuth === 'function') {
        await this.opts.ensureAuth(false);
      }
      const fresh = await this.opts.getConfig();
      const base = (cfg.apiBaseUrl || '').replace(/\/$/, '');
      const url = `${base}/logs/upload`;

      const form = new FormData();
      
      // 添加多个文件到 FormData（最多20个）
      for (const task of tasks) {
        const realPath = task.upload_path || task.file_path;
        if (fs.existsSync(realPath)) {
          form.append('file', fs.createReadStream(realPath));
        } else {
          // 如果文件不存在，记录警告但仍继续处理其他文件
          this._log(`warning: file not found ${realPath}, skipping`);
        }
      }

      // 使用第一个任务的设备ID和密钥（同一批任务应该相同）
      const firstTask = tasks[0];
      const headers = {
        ...form.getHeaders(),
        'Authorization': fresh.token ? `Bearer ${fresh.token}` : undefined,
        'X-Upload-Source': 'auto-upload',
        'X-Client-Id': cfg.clientId || '',
        'X-Device-Id': firstTask.device_id || '',
        'X-Decrypt-Key': firstTask.decrypt_key || undefined
      };

      const t0 = Date.now();
      let resp;
      try {
        resp = await axios.post(url, form, { headers, maxBodyLength: Infinity, maxContentLength: Infinity });
      } catch (e) {
        // 401/403 尝试强制刷新并重试一次
        const status = e?.response?.status;
        if ((status === 401 || status === 403) && typeof this.opts.ensureAuth === 'function') {
          await this.opts.ensureAuth(true);
          const again = await this.opts.getConfig();
          const headers2 = { ...headers, Authorization: again.token ? `Bearer ${again.token}` : undefined };
          resp = await axios.post(url, form, { headers: headers2, maxBodyLength: Infinity, maxContentLength: Infinity });
        } else {
          throw e;
        }
      }
      const dt = Date.now() - t0;
      
      // 批量上传成功，更新所有任务状态
      const successCount = tasks.length;
      const fileNames = tasks.map(t => path.basename(t.file_path)).join(', ');
      this._log(`uploaded ${successCount} files (${fileNames}) in ${dt}ms`);
      
      tasks.forEach(task => {
        task.status = 'success';
        task.updated_at = new Date().toISOString();
      });

      // 增量统计：仅首次成功计数；如之前失败过则做一次失败->成功的迁移
      try {
        const items = tasks.map(t => ({ file_path: t.file_path || t.upload_path, file_hash: t.file_hash || null }));
        const { totalDelta, successDelta, failedDelta } = applyStatusTransitionsAndGetDeltas(this.opts.appDataDir || (()=>''), items, 'success');
        if (totalDelta || successDelta || failedDelta) {
          updateTaskStats(this.opts.appDataDir || (()=>''), { total: totalDelta, success: successDelta, failed: failedDelta }, true);
        }
      } catch {}

      // 桌面通知（成功）
      try {
        const { Notification } = require('electron');
        if (Notification && Notification.isSupported()) {
          new Notification({ 
            title: '上传成功', 
            body: `成功上传 ${successCount} 个文件` 
          }).show();
        }
      } catch {}
    } catch (e) {
      // 批量上传失败，所有任务都标记为失败
      const errorMsg = e?.response?.data?.message || e.message || String(e);
      this._log(`batch upload failed (${tasks.length} files): ${errorMsg}`);
      
      tasks.forEach(task => {
        task.status = 'failed';
        task.retry_count = (task.retry_count || 0) + 1;
        task.last_error = errorMsg;
        task.updated_at = new Date().toISOString();
        
        this._log(`failed ${task.file_path}: ${errorMsg}`);
      });

      // 增量统计：仅首次失败计数（重试不重复计数）
      try {
        const items = tasks.map(t => ({ file_path: t.file_path || t.upload_path, file_hash: t.file_hash || null }));
        const { totalDelta, successDelta, failedDelta } = applyStatusTransitionsAndGetDeltas(this.opts.appDataDir || (()=>''), items, 'failed');
        if (totalDelta || successDelta || failedDelta) {
          updateTaskStats(this.opts.appDataDir || (()=>''), { total: totalDelta, success: successDelta, failed: failedDelta }, true);
        }
      } catch {}

      // 桌面通知（失败）
      try {
        const { Notification } = require('electron');
        if (Notification && Notification.isSupported()) {
          new Notification({ 
            title: '上传失败', 
            body: `${tasks.length} 个文件上传失败: ${errorMsg}` 
          }).show();
        }
      } catch {}

      // 指数退避：1m -> 5m -> 30m
      // 使用第一个任务的重试次数来计算延迟
      const firstTask = tasks[0];
      const delayMap = [60_000, 5 * 60_000, 30 * 60_000];
      const idx = Math.min((firstTask.retry_count || 1) - 1, delayMap.length - 1);
      setTimeout(() => { 
        tasks.forEach(task => { task.status = 'pending'; }); 
        this._pump(); 
      }, delayMap[idx]);
    } finally {
      this.active--;
      this._notify();
      this._pump();
    }
  }

  // 清理内存中的成功任务，避免内存占用过多
  // 保留策略：保留最近500条成功任务，以及所有待处理的任务
  _cleanupSuccessTasks() {
    const MAX_SUCCESS_TASKS = 500; // 最多保留500条成功任务
    const successTasks = this.queue.filter(t => t.status === 'success');
    
    if (successTasks.length > MAX_SUCCESS_TASKS) {
      // 按更新时间排序，保留最新的
      successTasks.sort((a, b) => {
        const timeA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const timeB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return timeB - timeA; // 降序，最新的在前
      });
      
      // 需要删除的旧任务
      const toRemove = successTasks.slice(MAX_SUCCESS_TASKS);
      const toRemovePaths = new Set(toRemove.map(t => t.signature || t.file_path));
      
      // 从队列中移除旧的成功任务
      this.queue = this.queue.filter(t => {
        if (t.status === 'success' && toRemovePaths.has(t.signature || t.file_path)) {
          return false; // 移除
        }
        return true; // 保留
      });
      
      const removedCount = toRemove.length;
      if (removedCount > 0) {
        this._log(`cleaned up ${removedCount} old success tasks from memory (kept ${MAX_SUCCESS_TASKS} recent)`);
      }
    }
  }

  _notify() {
    // 定期清理成功任务（每50次通知清理一次，避免频繁清理影响性能）
    if (!this._cleanupCounter) this._cleanupCounter = 0;
    this._cleanupCounter++;
    if (this._cleanupCounter >= 50) {
      this._cleanupSuccessTasks();
      this._cleanupCounter = 0;
    }

    if (typeof this.listeners.status === 'function') {
      const snapshot = this.queue.map(({ device_id, file_path, status, retry_count, last_error, created_at, updated_at }) => ({ device_id, file_path, status, retry_count, last_error, created_at, updated_at }));
      this.listeners.status(snapshot);
    }
  }

  _log(msg) {
    try { if (this.opts && typeof this.opts.log === 'function') this.opts.log(msg); } catch {}
  }

  // 获取当前队列统计
  _getCurrentStats() {
    const queue = this.queue || [];
    return {
      total: queue.length,
      success: queue.filter(t => t.status === 'success').length,
      failed: queue.filter(t => t.status === 'failed').length
    };
  }
}

module.exports = { UploaderService };


