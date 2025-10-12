const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

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
    // 简单去重（按文件绝对路径 + mtime）
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
      const next = this.queue.find(t => t.status === 'pending' || t.status === 'failed');
      if (!next) return;
      this._start(next);
    }
  }

  async _start(task) {
    this.active++;
    task.status = 'uploading';
    task.updated_at = new Date().toISOString();
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
      // 读取实际上传路径：若提供 upload_path 则使用之，否则用 file_path
      const realPath = task.upload_path || task.file_path;
      form.append('file', fs.createReadStream(realPath));

      const headers = {
        ...form.getHeaders(),
        'Authorization': fresh.token ? `Bearer ${fresh.token}` : undefined,
        'X-Upload-Source': 'auto-upload',
        'X-Client-Id': cfg.clientId || '',
        'X-Device-Id': task.device_id || '',
        'X-Decrypt-Key': task.decrypt_key || undefined
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
      this._log(`uploaded ${realPath} in ${dt}ms`);
      task.status = 'success';
      task.updated_at = new Date().toISOString();
      // 桌面通知（成功）
      try {
        const { Notification } = require('electron');
        if (Notification && Notification.isSupported()) {
          new Notification({ title: '上传成功', body: path.basename(task.file_path) }).show();
        }
      } catch {}
    } catch (e) {
      task.status = 'failed';
      task.retry_count = (task.retry_count || 0) + 1;
      task.last_error = e?.response?.data?.message || e.message || String(e);
      task.updated_at = new Date().toISOString();
      this._log(`failed ${task.file_path}: ${task.last_error}`);
      // 桌面通知（失败）
      try {
        const { Notification } = require('electron');
        if (Notification && Notification.isSupported()) {
          new Notification({ title: '上传失败', body: `${path.basename(task.file_path)}: ${task.last_error}` }).show();
        }
      } catch {}
      // 指数退避：1m -> 5m -> 30m
      const delayMap = [60_000, 5 * 60_000, 30 * 60_000];
      const idx = Math.min(task.retry_count - 1, delayMap.length - 1);
      setTimeout(() => { task.status = 'pending'; this._pump(); }, delayMap[idx]);
    } finally {
      this.active--;
      this._notify();
      this._pump();
    }
  }

  _notify() {
    if (typeof this.listeners.status === 'function') {
      const snapshot = this.queue.map(({ device_id, file_path, status, retry_count, last_error, created_at, updated_at }) => ({ device_id, file_path, status, retry_count, last_error, created_at, updated_at }));
      this.listeners.status(snapshot);
    }
  }

  _log(msg) {
    try { if (this.opts && typeof this.opts.log === 'function') this.opts.log(msg); } catch {}
  }
}

module.exports = { UploaderService };


