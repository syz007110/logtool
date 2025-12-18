const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
let electronApp = null;
try { electronApp = require('electron').app; } catch {}

function getDefaultAppDataDir() {
  const base = process.env.APPDATA || path.join(process.env.HOME || process.cwd(), 'AppData', 'Roaming');
  const dir = path.join(base, 'LogMonitor');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getAppDataDir() {
  // 日志/临时等数据目录：优先使用配置中的 logsDir，否则使用默认路径
  try {
    const cfgPath = getConfigPath();
    if (fs.existsSync(cfgPath)) {
      const raw = fs.readFileSync(cfgPath, 'utf-8');
      const cfg = JSON.parse(raw);
      // 兼容旧字段 customDataDir
      const candidate = (cfg.logsDir && cfg.logsDir.trim()) || (cfg.customDataDir && cfg.customDataDir.trim()) || '';
      if (candidate) {
        const resolved = path.resolve(candidate);
        if (!fs.existsSync(resolved)) fs.mkdirSync(resolved, { recursive: true });
        return resolved;
      }
    }
  } catch {}
  return getDefaultAppDataDir();
}

function getProgramRootDir() {
  try {
    if (electronApp) {
      // 判断是否为打包后的环境（包括 NSIS 安装版和便携版）
      const isPackaged = electronApp.isPackaged;
      
      if (isPackaged) {
        // 打包后（包括安装版和便携版）：使用 exe 文件所在目录
        // - NSIS 安装版：exe 在安装目录（如 C:\Program Files\日志监控客户端\）
        // - 便携版：exe 在解压目录（如 D:\tools\日志监控客户端-0.1.0-portable\）
        if (typeof electronApp.getPath === 'function') {
          const exePath = electronApp.getPath('exe');
          if (exePath) {
            const exeDir = path.dirname(exePath);
            return exeDir;
          }
        }
      } else {
        // 开发环境：使用应用路径（项目根目录）
        // app.getAppPath() 在开发环境返回项目目录，打包后返回 app.asar 路径
        if (typeof electronApp.getAppPath === 'function') {
          const appPath = electronApp.getAppPath();
          if (appPath) {
            // 检查是否是 app.asar 路径，如果是则使用其所在目录
            if (appPath.includes('.asar')) {
              return path.dirname(appPath);
            }
            // 开发环境直接返回项目目录
            return appPath;
          }
        }
      }
    }
  } catch (e) {
    console.warn('Failed to get program root dir:', e);
  }
  // 如果获取失败，回退到当前工作目录
  return process.cwd();
}

function getConfigPath() {
  // 配置文件固定保存在程序根目录
  const dir = getProgramRootDir();
  const cfg = path.join(dir, 'config.json');
  return cfg;
}

async function ensureConfig() {
  const cfgPath = getConfigPath();
  if (fs.existsSync(cfgPath)) return;
  const initial = {
    apiBaseUrl: 'http://localhost:3000/api',
    clientId: uuidv4(),
    token: null,
    username: '',
    password: '',
    concurrency: 3,
    watchPaths: [],
    recurseDepth: 4,
    includeExtensions: ['.medbot'],
    keyFileName: 'systemInfo.txt',
    scanOnly: false,
    logsDir: '', // 自定义日志/数据目录路径
    autoLogin: true,
    tokenExpiresAt: null,
    successRetentionDays: 7,
    ignoreInitial: true, // true=仅监控新增/变更(忽略现有)，false=纳入现有(启动扫描现有)
    periodicRescanInterval: 5, // 周期补扫间隔（分钟），0=禁用补扫
    tempCleanupInterval: 60 // 临时文件清理间隔（分钟），默认60分钟
  };
  fs.writeFileSync(cfgPath, JSON.stringify(initial, null, 2), 'utf-8');
}

async function getConfig() {
  const cfgPath = getConfigPath();
  const raw = fs.readFileSync(cfgPath, 'utf-8');
  const cfg = JSON.parse(raw);
  // 兼容旧字段迁移（内存层面）
  if (!cfg.logsDir && cfg.customDataDir) cfg.logsDir = cfg.customDataDir;
  return cfg;
}

async function saveConfig(updated) {
  const cfgPath = getConfigPath();
  const toSave = { ...updated };
  // 清理旧字段
  delete toSave.customDataDir;
  delete toSave.configFilePath;
  // 规范化与约束：监控路径 ≤ 10，递归深度 ≤ 5
  try {
    // watchPaths 规范化与去重
    const rawPaths = Array.isArray(toSave.watchPaths) ? toSave.watchPaths : [];
    const normalized = [];
    const seen = new Set();
    for (const p of rawPaths) {
      if (!p || typeof p !== 'string') continue;
      const resolved = path.resolve(p.trim());
      const key = resolved.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push(resolved);
      if (normalized.length >= 10) break; // 限制最多10个
    }
    toSave.watchPaths = normalized;

    // 递归深度：默认4，最大5，最小1
    const depthNum = Number.isFinite(+toSave.recurseDepth) ? (+toSave.recurseDepth | 0) : 4;
    toSave.recurseDepth = Math.max(1, Math.min(5, depthNum));

    // 并发：限定区间 [0, 5]
    const concNum = Number.isFinite(+toSave.concurrency) ? (+toSave.concurrency | 0) : 2;
    toSave.concurrency = Math.max(0, Math.min(5, concNum));

    // 扩展名：确保包含 .medbot
    const exts = Array.isArray(toSave.includeExtensions) ? toSave.includeExtensions : ['.medbot'];
    const exSet = new Set((exts || []).map(e => String(e || '').toLowerCase()));
    exSet.add('.medbot');
    toSave.includeExtensions = Array.from(exSet);

    // 关键文件名规范化
    if (typeof toSave.keyFileName === 'string' && toSave.keyFileName.trim()) {
      toSave.keyFileName = toSave.keyFileName.trim();
    } else {
      toSave.keyFileName = 'systemInfo.txt';
    }
    // 强制关闭仅扫描（按需求）
    toSave.scanOnly = false;

    // 清理间隔：默认60分钟，限制在 1-1440 分钟之间（1分钟到24小时）
    const cleanupNum = Number.isFinite(+toSave.tempCleanupInterval) ? (+toSave.tempCleanupInterval | 0) : 60;
    toSave.tempCleanupInterval = Math.max(1, Math.min(1440, cleanupNum));
  } catch {}
  console.log('Saving config to:', cfgPath);
  console.log('Config content:', JSON.stringify(toSave, null, 2));
  fs.writeFileSync(cfgPath, JSON.stringify(toSave, null, 2), 'utf-8');
  return toSave;
}

module.exports = { ensureConfig, getConfig, saveConfig, getAppDataDir };


