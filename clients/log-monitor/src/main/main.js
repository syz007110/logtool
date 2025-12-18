const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification, shell } = require('electron');
const path = require('path');
const { ensureConfig, getConfig, saveConfig, getAppDataDir } = require('./services/config');
const { WatcherService } = require('./services/watcher');
const { getKeyAndDeviceForFile } = require('./services/keyExtractor');
const { ScannerService } = require('./services/scanner');
const { UploaderService } = require('./services/uploader');
const { TempCleanerService } = require('./services/cleaner');
const { loadTasks, saveTasks, getTaskStats, clearTaskStats, computeTaskStatsFromDb } = require('./services/storage');

let mainWindow = null;
let watcher = null;
let uploader = null;
let tray = null;
let paused = true;
let scanner = null;
let cleaner = null;
// Track unit scan sessions for per-device completion notifications
const unitSessions = new Map(); // sessionId -> { deviceId, startedAt }

function notifyDesktop(title, body) {
  try {
    const { Notification } = require('electron');
    if (Notification && Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  } catch {}
}

function createWindow() {
  // 设置窗口图标
  const logoPath = path.join(__dirname, '../assets/logo.ico');
  
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    icon: logoPath,  // 使用 logo.ico 作为窗口图标
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // 移除默认菜单（Edit/View/Window等）
  mainWindow.setMenu(null);

  const indexHtml = path.join(__dirname, '../renderer/index.html');
  mainWindow.loadFile(indexHtml);
  
  // 关闭窗口时弹窗询问：关闭或最小化到托盘
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      const { dialog } = require('electron');
      dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['最小化到托盘', '退出程序'],
        defaultId: 0,
        title: '关闭窗口',
        message: '请选择操作：'
      }).then(result => {
        if (result.response === 0) {
          mainWindow.hide();
        } else {
          app.isQuitting = true;
          app.quit();
        }
      });
    }
  });
}

app.whenReady().then(async () => {
  console.log('App ready, starting initialization...');
  
  // 设置 Windows 通知的应用名称
  if (process.platform === 'win32') {
    app.setAppUserModelId('日志监控客户端');
  }
  
  await ensureConfig();
  console.log('Config ensured');
  const cfg = await getConfig();
  console.log('Config loaded:', cfg);
  // 初始化上传器
  const writeLog = (msg) => {
    try {
      const fs = require('fs');
      const p = require('path');
      const logPath = p.join(getAppDataDir(), 'client.log');
      const line = `[${new Date().toISOString()}] ${msg}\n`;
      fs.appendFileSync(logPath, line, 'utf-8');
      
      // 增加控制台输出，显示更多扫描信息
      console.log(`[LOG] ${msg}`);
    } catch (e) {
      console.error('Log write failed:', e);
    }
  };
  uploader = new UploaderService({ getConfig, log: writeLog, ensureAuth, appDataDir: getAppDataDir });
  // Forward uploader status to renderer, and check unit completion per device
  try {
    uploader.onStatus((snapshot) => {
      try { if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('uploader:status', snapshot); } catch {}
      // Check each active session if its device's tasks (created at/after session start) are all successful
      try {
        for (const [sessionId, sess] of unitSessions.entries()) {
          const deviceId = sess.deviceId || '';
          const startedAt = sess.startedAt || 0;
          const tasksForDevice = snapshot.filter(t => (t.device_id || '') === deviceId);
          const tasksOfSession = tasksForDevice.filter(t => {
            const tCreated = t.created_at ? new Date(t.created_at).getTime() : 0;
            return tCreated >= startedAt;
          });
          if (tasksOfSession.length === 0) {
            // No tasks were generated for this session; skip notification and clear session
            unitSessions.delete(sessionId);
            continue;
          }
          const allSuccess = tasksOfSession.every(t => t.status === 'success');
          const anyPendingOrUploading = tasksOfSession.some(t => t.status === 'pending' || t.status === 'uploading');
          if (allSuccess && !anyPendingOrUploading) {
            notifyDesktop('上传完成', `“${deviceId || '未知设备'}”日志文件上传完成`);
            unitSessions.delete(sessionId);
          }
        }
      } catch {}
    });
  } catch {}
  // 简单的 JWT 过期解析
  function parseJwtExp(token) {
    try {
      const parts = String(token || '').split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
      return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
    } catch { return null; }
  }

  async function ensureAuth(force = false) {
    const cfg = await getConfig();
    const now = Date.now();
    const exp = cfg.tokenExpiresAt ? new Date(cfg.tokenExpiresAt).getTime() : parseJwtExp(cfg.token);
    const nearExpiry = exp ? (exp - now) < 5 * 60 * 1000 : true; // 5分钟内到期视为需要刷新
    const needLogin = force || !cfg.token || (cfg.autoLogin ? nearExpiry : false);
    if (!needLogin) return cfg.token;
    if (!cfg.autoLogin) return cfg.token || null;
    if (!cfg.username || !cfg.password) return cfg.token || null;
    try {
      const base = (cfg.apiBaseUrl || '').replace(/\/$/, '').replace(/\/api$/, '');
      const url = `${base}/api/auth/login`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cfg.username, password: cfg.password })
      });
      if (!res.ok) throw new Error(`login failed ${res.status}`);
      const data = await res.json();
      const token = data.token;
      const tokenExp = parseJwtExp(token);
      const updated = { ...cfg, token, tokenExpiresAt: tokenExp ? new Date(tokenExp).toISOString() : null };
      await saveConfig(updated);
      return token;
    } catch (e) {
      writeLog(`auth refresh failed: ${e.message || e}`);
      return null;
    }
  }

  // 启动时尝试确保 token 可用
  await ensureAuth(false);

  const initialConcurrency = paused ? 0 : (cfg.concurrency || 3);
  uploader.setConcurrency(initialConcurrency);
  uploader.onStatus((snapshot) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('uploader:status', snapshot);
    }
    // 持久化任务快照
    saveTasks(getAppDataDir, uploader.queue);
  });

  // 启动日志
  writeLog('client started');
  console.log('Client started log written');

  // 恢复历史任务
  try {
    const tasks = loadTasks(getAppDataDir) || [];
    if (Array.isArray(tasks) && tasks.length > 0) {
      // 仅恢复未成功的任务
      const pendingOrFailed = tasks.filter(t => t && t.status !== 'success');
      uploader.restore(pendingOrFailed);
    }
    // 每次启动时清空持久化统计，从0开始重新计数
    try {
      clearTaskStats(getAppDataDir);
      writeLog('已清空任务统计，本次会话将从0开始计数');
    } catch {}
  } catch {}

  // 初始化目录监听与扫描器（按流程图：目录/压缩包为单元）
  watcher = new WatcherService({});
  scanner = new ScannerService({ uploader, getConfig, appDataDir: getAppDataDir, log: writeLog });
  // 初始化临时文件清理服务
  cleaner = new TempCleanerService({ 
    getConfig, 
    appDataDir: getAppDataDir, 
    log: writeLog,
    getUploader: () => uploader 
  });
  (async () => {
    try {
      await cleaner.start();
    } catch (e) {
      writeLog(`Failed to start cleaner: ${e.message}`);
    }
  })();
  // 冷启动：抑制 .medbot add 事件，待初次目录发现完成后再开启
  watcher.setSuppressMedbotAdd(true);
  let pendingInitialScan = false;
  const debounced = new Map();
  const scanning = new Set(); // 正在扫描的路径
  let isScanning = false; // 全局扫描状态

  // 设备编号正则，与后端逻辑保持一致：支持 5G-数字 和 4xxx-xx 两种格式
  const deviceIdRegex = /(5G-\d+|4\d{3}-\d{2})/;

  // 归一化单元路径：定位到包含设备编号的目录段（或压缩包本身）
  function normalizeUnitPath(inputPath) {
    try {
      const p = require('path');
      const lower = inputPath.toLowerCase();
      const isArchive = lower.endsWith('.zip') || lower.endsWith('.7z');
      const parts = inputPath.split(/[/\\]/);
      for (let i = parts.length - 1; i >= 0; i--) {
        if (deviceIdRegex.test(parts[i])) {
          return parts.slice(0, i + 1).join(p.sep);
        }
      }
      // 压缩包：若文件名包含设备编号，则以文件自身为单元
      if (isArchive) {
        const base = p.basename(inputPath);
        if (deviceIdRegex.test(base)) return inputPath;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  // 扫描队列管理 - 严格顺序执行
  const scanQueue = [];
  let isProcessingQueue = false;

  function enqueueUnitPath(unitPath) {
    const normalized = normalizeUnitPath(unitPath);
    if (!normalized) return; // 不是有效单元，丢弃
    const key = normalized.toLowerCase();
    if (scanQueue.some(t => t.path.toLowerCase() === key)) return; // 队列去重
    // 简单时间窗口去抖
    const now = Date.now();
    const last = debounced.get(key) || 0;
    if (now - last < 30000) return;
    debounced.set(key, now);
    scanQueue.push({ path: normalized });
    // Desktop notify on new/changed unit discovery（仅在未暂停时发送通知）
    if (!paused) {
      try {
        const m = deviceIdRegex.exec(normalized) || [];
        const dev = m[0] || '';
        notifyDesktop('监测到日志变更', `监测到"${dev || '未知设备'}"日志文件新增/变更`);
      } catch {}
    }
    processScanQueue();
  }

  async function processScanQueue() {
    if (paused) return;
    if (isProcessingQueue) return;
    if (scanQueue.length === 0) return;
    isProcessingQueue = true;
    try {
      while (scanQueue.length > 0) {
        if (paused) break;
        const task = scanQueue.shift();
        const key = task.path.toLowerCase();
        if (isScanning || scanning.has(key)) continue; // 正在扫描，跳过本轮
        scanning.add(key);
        isScanning = true;
        // Start unit session for completion tracking (per device)
        try {
          const m = deviceIdRegex.exec(task.path) || [];
          const dev = m[0] || '';
          const startedAt = Date.now();
          const sessionId = `${dev}|${task.path}|${startedAt}`;
          unitSessions.set(sessionId, { deviceId: dev, startedAt });
        } catch {}
        console.log(`🔄 触发扫描: ${task.path}`);
        try {
          await scanner.scanUnit(task.path, cfg.recurseDepth || 4, cfg.keyFileName || 'SystemInfo.txt');
        } catch (e) {
          console.error('扫描任务失败:', e);
        } finally {
          scanning.delete(key);
          isScanning = false;
          console.log(`✅ 扫描完成: ${task.path}`);
        }
      }
    } finally {
      isProcessingQueue = false;
    }
  }

  // 文件监控触发 - 入队归一化的单元路径
  watcher.onUnit = (unitPath) => {
    enqueueUnitPath(unitPath);
  };
  const startPaths = cfg.watchPaths || [];
  const ignoreInitial = !!cfg.ignoreInitial; // true=仅监控新增/变更，false=纳入现有内容
  const recurseDepth = cfg.recurseDepth || 4;

  const startWatcher = () => {
    watcher.start(startPaths, cfg.includeExtensions || ['.medbot'], recurseDepth, { ignoreInitial });
    writeLog(`watcher started: ${startPaths.join('; ') || '(no paths)'}`);
  };

  if (!paused) {
    startWatcher();
  } else {
    writeLog('Watcher initialized in paused state. Waiting for user to start synchronization.');
  }
  
  const runInitialScan = ({ paths = startPaths, ignore = ignoreInitial, depth = recurseDepth } = {}) => {
    if (!ignore && paths.length > 0) {
      writeLog('Starting manual discovery of existing units (include existing)...');
      setTimeout(async () => {
        const fs = require('fs');
        const fsPromises = fs.promises;
        const p = require('path');
        const maxDepth = Math.max(1, Math.min(4, depth));
        const BATCH_SIZE = 20; // 每处理20个目录后让出CPU
        
        async function discoverUnits(root, depth) {
          try {
            if (depth > maxDepth) return;
            
            const entries = await fsPromises.readdir(root, { withFileTypes: true });
            let processed = 0;
            
            for (const ent of entries) {
              const full = p.join(root, ent.name);
              if (ent.isDirectory()) {
                if (deviceIdRegex.test(ent.name)) {
                  enqueueUnitPath(full);
                } else {
                  await discoverUnits(full, depth + 1);
                }
              } else {
                const lower = ent.name.toLowerCase();
                if ((lower.endsWith('.zip') || lower.endsWith('.7z')) && deviceIdRegex.test(ent.name)) {
                  enqueueUnitPath(full);
                }
              }
              
              processed++;
              if (processed >= BATCH_SIZE) {
                await new Promise(resolve => setImmediate(resolve));
                processed = 0;
              }
            }
          } catch (err) {
            console.log(`⚠️ 发现目录失败: ${root}, ${err.message}`);
          }
        }
        
        for (const root of paths) {
          discoverUnits(root, 0).catch(err => {
            console.error(`启动扫描目录失败: ${root}`, err);
          });
        }
        try { watcher.setSuppressMedbotAdd(false); } catch {}
      }, 500);
    } else {
      setTimeout(() => {
        try { watcher.setSuppressMedbotAdd(false); } catch {}
      }, 1000);
    }
  };

  if (!paused) {
    runInitialScan();
  } else if (!ignoreInitial && startPaths.length > 0) {
    pendingInitialScan = true;
  } else {
    setTimeout(() => {
      try { watcher.setSuppressMedbotAdd(false); } catch {}
    }, 1000);
  }

  // 周期补扫（每5分钟）：根据单元目录/压缩包 mtime 判断是否补扫
  const lastScanned = new Map(); // unitPath(lower) -> timestamp
  function discoverUnitsFor(root, maxDepth) {
    const fs = require('fs');
    const p = require('path');
    const units = [];
    function walk(dir, depth) {
      try {
        if (depth > maxDepth) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          const full = p.join(dir, ent.name);
          if (ent.isDirectory()) {
            if (deviceIdRegex.test(ent.name)) {
              units.push(full);
            }
            walk(full, depth + 1);
          } else {
            const lower = ent.name.toLowerCase();
            if ((lower.endsWith('.zip') || lower.endsWith('.7z')) && deviceIdRegex.test(ent.name)) {
              units.push(full);
            }
          }
        }
      } catch {}
    }
    walk(root, 0);
    return units;
  }

  // 若 ignoreInitial=true，启动时建立 mtime 基线，避免补扫把现有单元入队
  if (ignoreInitial && startPaths.length > 0) {
    try {
      for (const root of startPaths) {
        const units = discoverUnitsFor(root, Math.max(1, Math.min(4, cfg.recurseDepth || 4)));
        const fs = require('fs');
        for (const unit of units) {
          try {
            const stat = fs.statSync(unit);
            const mtime = stat.mtimeMs || stat.mtime.getTime();
            lastScanned.set(unit.toLowerCase(), mtime);
          } catch {}
        }
      }
    } catch {}
  }

  // 周期补扫（所有模式）：按配置间隔检查 mtime，变更则入队
  const rescanInterval = (cfg.periodicRescanInterval || 5) * 60 * 1000;
  if (rescanInterval > 0) {
    setInterval(() => {
      if (paused) return;
      try {
        for (const root of startPaths) {
          const units = discoverUnitsFor(root, Math.max(1, Math.min(4, cfg.recurseDepth || 4)));
          for (const unit of units) {
            try {
              const fs = require('fs');
              const stat = fs.statSync(unit);
              const mtime = stat.mtimeMs || stat.mtime.getTime();
              const key = unit.toLowerCase();
              const last = lastScanned.get(key) || 0;
              // 若首次看到该单元
              if (last === 0) {
                if (ignoreInitial) {
                  // 仅监控新增：建立基线，不入队
                  lastScanned.set(key, mtime);
                  continue;
                } else {
                  // 纳入现有：允许入队，并以当前 mtime 作为基线
                  enqueueUnitPath(unit);
                  lastScanned.set(key, mtime);
                  continue;
                }
              }
              // 正常按 mtime 变更入队
              if (mtime > last) {
                enqueueUnitPath(unit);
                lastScanned.set(key, mtime);
              }
            } catch {}
          }
        }
      } catch (e) {
        console.warn('periodic rescan failed:', e && e.message ? e.message : e);
      }
    }, rescanInterval);
  }

  // 手动触发初始扫描现有文件：仅当 ignoreInitial=false 且未暂停时执行
  if (!paused && !ignoreInitial && startPaths.length > 0) {
    writeLog('Starting initial scan of existing files...');
    setTimeout(() => {
      if (paused) return; // 再次检查暂停状态
      const fs = require('fs');
      const p = require('path');
      const maxDepth = Math.max(1, Math.min(4, cfg.recurseDepth || 4));
      function discoverUnits(root, depth) {
        try {
          if (depth > maxDepth) return;
          const entries = fs.readdirSync(root, { withFileTypes: true });
          for (const ent of entries) {
            const full = p.join(root, ent.name);
            if (ent.isDirectory()) {
              // 目录名含设备编号 → 作为单元入队；否则继续下探
              if (deviceIdRegex.test(ent.name)) {
                enqueueUnitPath(full);
              } else {
                discoverUnits(full, depth + 1);
              }
            } else {
              const lower = ent.name.toLowerCase();
              if ((lower.endsWith('.zip') || lower.endsWith('.7z')) && deviceIdRegex.test(ent.name)) {
                enqueueUnitPath(full);
              }
            }
          }
        } catch {}
      }
      for (const root of startPaths) {
        discoverUnits(root, 0);
      }
      // 初次目录发现完成，解除 .medbot 抑制
      try { watcher.setSuppressMedbotAdd(false); } catch {}
    }, 1000);
  } else {
    // 不做初扫也需要尽快解除 .medbot 抑制，以便监听后续新增
    setTimeout(() => { try { watcher.setSuppressMedbotAdd(false); } catch {} }, 1000);
  }

  createWindow();
  console.log('Window created');

  // 托盘与菜单
  try {
    console.log('Creating tray...');
    // 使用项目 logo.ico 作为托盘图标
    const pathModule = require('path');
    const fs = require('fs');
    const logoIco = pathModule.join(__dirname, '../assets/logo.ico');
    let icon;
    if (fs.existsSync(logoIco)) {
      icon = nativeImage.createFromPath(logoIco);
      console.log('Using logo.ico for tray icon');
    } else {
      // 备用：16x16 蓝色图标
      const b64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAUklEQVQ4y2NgGAUDDTAyMEwMRiYGJgYmhpGNQQamZmxgYmBiYGJgYmBiYGJgYmBiYGJgYmBiYGJgYmBiYGJgYmBiYGJgYmBiYGJgYhgFQw0AAL3wAhHdOW0hAAAAAElFTkSuQmCC';
      icon = nativeImage.createFromDataURL(`data:image/png;base64,${b64}`);
      console.log('Using fallback icon');
    }
    tray = new Tray(icon);
    const buildMenu = () => Menu.buildFromTemplate([
      { label: paused ? 'Resume Upload' : 'Pause Upload', click: async () => { 
        paused = !paused; 
        if (uploader) uploader.setConcurrency(paused ? 0 : (cfg.concurrency || 3)); 
        if (paused) {
          if (watcher) watcher.stop();
        } else {
          if (watcher) {
            const latestCfg = await getConfig();
            const startPaths = latestCfg.watchPaths || [];
            const ignoreInitial = !!latestCfg.ignoreInitial;
            watcher.start(startPaths, latestCfg.includeExtensions || ['.medbot'], latestCfg.recurseDepth || 4, { ignoreInitial });
            if (pendingInitialScan && !ignoreInitial && startPaths.length > 0) {
              pendingInitialScan = false;
              runInitialScan({ paths: startPaths, ignore: ignoreInitial, depth: latestCfg.recurseDepth || 4 });
            }
            processScanQueue();
          }
        }
        tray.setToolTip(paused ? 'Paused' : 'Running'); 
      } },
      { label: 'Open Logs Directory', click: () => { const dir = getAppDataDir(); shell.openPath(dir); } },
      { label: 'Show Window', click: () => { if (mainWindow) mainWindow.show(); } },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ]);
    tray.setContextMenu(buildMenu());
    tray.setToolTip(paused ? 'Paused' : 'Running');
    
    // 双击托盘图标显示窗口
    tray.on('double-click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
    
    writeLog('tray created');
    console.log('Tray created successfully');
  } catch (e) {
    console.error('Tray creation failed:', e);
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// 应用退出时停止清理服务
app.on('before-quit', function () {
  if (cleaner) {
    cleaner.stop();
  }
});

ipcMain.handle('config:get', async () => getConfig());
ipcMain.handle('config:save', async (_evt, updated) => {
  const saved = await saveConfig(updated);
  // 如果清理间隔改变了，重启清理服务
  if (cleaner) {
    try {
      await cleaner.restart();
    } catch (e) {
      console.error('Failed to restart cleaner:', e);
    }
  }
  return saved;
});
ipcMain.handle('app:dataDir', async () => getAppDataDir());
ipcMain.handle('taskStats:get', async () => getTaskStats(getAppDataDir));
ipcMain.handle('dialog:open', async (_evt, options) => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result.canceled ? null : result.filePaths;
});
ipcMain.on('watch:update', async (_evt, { paths, depth, exts }) => {
  if (watcher) {
    const cfg = await getConfig();
    watcher.start(paths || [], exts || ['.medbot'], depth || 4, { ignoreInitial: !!cfg.ignoreInitial });
  }
});
ipcMain.on('uploader:setConcurrency', async (_evt, n) => {
  if (uploader) uploader.setConcurrency(n);
  paused = n === 0;
  if (paused) {
    if (watcher) {
      console.log('暂停监控器');
      watcher.stop();
    }
  } else {
    if (watcher) {
      console.log('恢复监控器');
      const latestCfg = await getConfig();
      const startPaths = latestCfg.watchPaths || [];
      const ignoreInitial = !!latestCfg.ignoreInitial;
      watcher.start(startPaths, latestCfg.includeExtensions || ['.medbot'], latestCfg.recurseDepth || 4, { ignoreInitial });
      if (pendingInitialScan && !ignoreInitial && startPaths.length > 0) {
        pendingInitialScan = false;
        runInitialScan({ paths: startPaths, ignore: ignoreInitial, depth: latestCfg.recurseDepth || 4 });
      }
      processScanQueue();
    }
  }
  if (tray) {
    tray.setToolTip(paused ? 'Paused' : 'Running');
  }
});


