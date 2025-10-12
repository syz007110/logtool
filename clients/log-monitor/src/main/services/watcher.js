const path = require('path');
const chokidar = require('chokidar');

class WatcherService {
  constructor(options) {
    this.options = options;
    this.watcher = null;
    this.onFile = null; // (fullPath) => void
    this.deviceRegex = /(\b[0-9A-Za-z]{3,5}-[0-9A-Za-z]{2}\b)/; // 粗略：如 4371-04 / ABCD-12
    this.keyFileName = 'systemInfo.txt';
    this.suppressMedbotAdd = false; // 冷启动期间抑制 .medbot 触发
    this.triggerDelayMs = (options && typeof options.triggerDelayMs === 'number') ? options.triggerDelayMs : 3000; // 触发延时，默认3秒
    this._unitTimers = new Map(); // unitPath(lower) -> timeout
  }

  setSuppressMedbotAdd(flag) { this.suppressMedbotAdd = !!flag; }

  // 合并/延迟触发同一单元扫描，避免复制过程中多次/过早扫描
  _scheduleUnitScan(unitPath) {
    try {
      if (!this.onUnit || !unitPath) return;
      const key = unitPath.toLowerCase();
      if (this._unitTimers.has(key)) {
        clearTimeout(this._unitTimers.get(key));
      }
      const t = setTimeout(() => {
        this._unitTimers.delete(key);
        try { this.onUnit(unitPath); } catch {}
      }, this.triggerDelayMs);
      this._unitTimers.set(key, t);
    } catch {}
  }

  start(paths, includeExtensions, depth = 4, options = {}) {
    if (this.watcher) this.stop();
    const patterns = (paths || []).map(p => path.join(p));
    const ignoreInitial = !!options.ignoreInitial;
    this.watcher = chokidar.watch(patterns, {
      ignoreInitial: ignoreInitial,
      depth,
      awaitWriteFinish: { stabilityThreshold: 3000, pollInterval: 250 }
    });

    const matchExt = (file) => {
      if (!includeExtensions || includeExtensions.length === 0) return true;
      const lower = file.toLowerCase();
      return includeExtensions.some(ext => lower.endsWith(ext.toLowerCase()));
    };

    // 仅在新增目录或新增压缩包时触发单元扫描
    this.watcher.on('addDir', (dir) => {
      this._scheduleUnitScan(dir);
    });
    this.watcher.on('add', (file) => {
      const lower = file.toLowerCase();
      // 压缩包新增：触发扫描
      if ((lower.endsWith('.zip') || lower.endsWith('.7z'))) {
        this._scheduleUnitScan(file);
        return;
      }
      // .medbot 新增：向上寻找包含设备编号的单元目录，触发扫描
      if (this.suppressMedbotAdd) return; // 冷启动抑制
      if (matchExt(file) && lower.endsWith('.medbot')) {
        try {
          let cur = path.dirname(file);
          const maxSteps = Math.max(1, Math.min(5, depth + 1));
          for (let i = 0; i < maxSteps && cur && cur !== path.dirname(cur); i++) {
            if (this.deviceRegex.test(path.basename(cur))) {
              this._scheduleUnitScan(cur);
              return;
            }
            cur = path.dirname(cur);
          }
        } catch {}
      }
    });

    // 归档文件变更：触发扫描
    this.watcher.on('change', (file) => {
      const lower = file.toLowerCase();
      if ((lower.endsWith('.zip') || lower.endsWith('.7z'))) {
        this._scheduleUnitScan(file);
      }
    });
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}

module.exports = { WatcherService };


