const fs = require('fs');
const path = require('path');

class TempCleanerService {
  constructor(options) {
    this.options = options || {}; // { getConfig, appDataDir, log, getUploader? }
    this.cleanupInterval = null;
  }

  async start() {
    // 从配置读取清理间隔
    const cfg = await this.options.getConfig();
    const intervalMinutes = (cfg.tempCleanupInterval && Number.isFinite(+cfg.tempCleanupInterval)) 
      ? Math.max(1, Math.min(1440, +cfg.tempCleanupInterval)) // 限制在 1-1440 分钟之间
      : 60; // 默认60分钟
    const INTERVAL_MS = intervalMinutes * 60 * 1000;
    
    this._log(`Starting temp file cleaner, interval: ${intervalMinutes} minutes`);
    
    // 立即执行一次
    this.cleanup();
    
    // 设置定时器
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, INTERVAL_MS);
  }

  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this._log('Temp file cleaner stopped');
    }
  }

  async restart() {
    this.stop();
    await this.start();
  }

  async cleanup() {
    const appDataDir = this.options.appDataDir?.() || '';
    if (!appDataDir) {
      this._log('Cannot cleanup: appDataDir not available');
      return;
    }

    const tempDir = path.join(appDataDir, 'temp');
    if (!fs.existsSync(tempDir)) {
      this._log('Temp directory does not exist, skipping cleanup');
      return;
    }

    this._log(`Starting cleanup of temp directory: ${tempDir}`);

    try {
      // 获取所有上传任务的状态
      const { loadTasks } = require('./storage');
      const tasks = loadTasks(this.options.appDataDir) || [];
      
      // 按 hash 分组成功任务（主要判断方式）
      const successfulHashes = new Set();
      // 按 hash 分组失败任务（用于保守策略）
      const failedHashes = new Set();
      
      tasks.forEach(task => {
        if (task && task.file_hash) {
          if (task.status === 'success') {
            successfulHashes.add(task.file_hash);
          } else if (task.status === 'failed') {
            failedHashes.add(task.file_hash);
          }
        }
      });
      
      // 检查是否有活跃的上传任务
      let hasActiveUploads = false;
      try {
        const uploader = this.options.getUploader?.();
        if (uploader && Array.isArray(uploader.queue)) {
          hasActiveUploads = uploader.queue.some(task => 
            task.status === 'uploading' || task.status === 'pending'
          );
        }
      } catch {}

      // 扫描临时目录
      const entries = fs.readdirSync(tempDir, { withFileTypes: true });
      let cleanedCount = 0;
      let keptCount = 0;

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        
        const extractDir = path.join(tempDir, entry.name);
        if (!/^extract_/.test(entry.name)) continue;

        try {
          // 检查这个解压目录中的所有文件是否都已上传完成
          const shouldDelete = await this._shouldDeleteExtractDir(extractDir, successfulHashes, failedHashes, hasActiveUploads);
          
          if (shouldDelete) {
            // 删除整个目录
            fs.rmSync(extractDir, { recursive: true, force: true });
            cleanedCount++;
            this._log(`Deleted completed temp dir: ${entry.name}`);
          } else {
            keptCount++;
            this._log(`Kept temp dir (files still uploading): ${entry.name}`);
          }
        } catch (e) {
          this._log(`Error processing ${entry.name}: ${e.message}`);
        }
      }

      this._log(`Cleanup completed: deleted ${cleanedCount} dirs, kept ${keptCount} dirs`);
    } catch (e) {
      this._log(`Cleanup failed: ${e.message}`);
    }
  }

  async _shouldDeleteExtractDir(extractDir, successfulHashes, failedHashes, hasActiveUploads) {
    try {
      const files = this._getAllFiles(extractDir);
      
      if (files.length === 0) {
        // 空目录，可以删除
        return true;
      }

      const { computeFileHash } = require('./storage');

      // 检查每个文件的状态
      for (const file of files) {
        // 只检查 .medbot 文件
        if (!file.toLowerCase().endsWith('.medbot')) continue;

        // 按文件名规则过滤：只对标准格式 YYYYDDhh_log.medbot 执行 hash 比对
        // 非标准（如 YYYYDDhh_XXX_log.medbot）不参与比对，也不阻塞清理
        try {
          const baseName = path.basename(file).toLowerCase();
          const strictPattern = /^\d{10}_log\.medbot$/; // 与扫描器一致：10位数字 + _log.medbot
          if (!strictPattern.test(baseName)) {
            this._log(`  Ignore non-standard name: ${baseName}`);
            continue;
          }
        } catch {}

        // 计算文件的 hash
        let hash = null;
        try {
          hash = computeFileHash(file);
        } catch (e) {
          this._log(`  Failed to compute hash for ${path.relative(extractDir, file)}: ${e.message}`);
        }

        if (!hash) {
          // 无法计算 hash，保守策略：不删除
          return false;
        }

        // 检查 hash 是否在成功列表
        if (successfulHashes.has(hash)) {
          // 文件内容已成功上传
          continue;
        }

        // 检查 hash 是否在失败列表
        if (failedHashes.has(hash)) {
          // 文件上传失败，可能还会重试，保留
          const relativePath = path.relative(extractDir, file);
          this._log(`  File failed to upload: ${relativePath}, keeping for retry`);
          return false;
        }

        // hash 不在任何列表中，可能是新文件或未识别的文件
        // 保守策略：不删除
        return false;
      }

      // 所有 .medbot 文件都已成功上传
      // 检查是否有活跃的上传任务
      if (hasActiveUploads) {
        // 还有任务在上传，先不删除（保守策略）
        return false;
      }

      // 所有文件都已成功上传，且没有正在进行的上传任务
      return true;
    } catch (e) {
      this._log(`Error checking extract dir: ${e.message}`);
      return false;
    }
  }

  _getAllFiles(dir) {
    const files = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...this._getAllFiles(fullPath));
        } else {
          files.push(fullPath);
        }
      }
    } catch (e) {
      // 忽略错误
    }
    return files;
  }

  _log(msg) {
    try {
      if (this.options.log && typeof this.options.log === 'function') {
        this.options.log(msg);
      }
      console.log(`[Cleaner] ${msg}`);
    } catch {}
  }
}

module.exports = { TempCleanerService };

