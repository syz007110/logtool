const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const AdmZip = require('adm-zip');
const iconv = require('iconv-lite');
let _7zBin = null;
let _7zPath = null;
try { 
  _7zBin = require('7zip-bin'); 
  // 7zip-bin 使用 path7za 属性
  _7zPath = _7zBin.path7za || null;
  if (_7zPath) {
    // 检查路径是否在app.asar中，如果是，转换为app.asar.unpacked中的路径
    if (_7zPath.includes('app.asar') && !_7zPath.includes('app.asar.unpacked')) {
      // 将 app.asar 替换为 app.asar.unpacked
      _7zPath = _7zPath.replace(/app\.asar[\/\\]/, 'app.asar.unpacked/');
      console.log(`🔄 检测到asar路径，已转换为unpacked路径: ${_7zPath}`);
    }
    
    // 验证文件是否存在
    if (fs.existsSync(_7zPath)) {
      console.log(`✅ 7zip-bin 加载成功: ${_7zPath}`);
    } else {
      console.warn(`⚠️ 7zip-bin 路径不存在: ${_7zPath}`);
      // 如果转换后的路径不存在，尝试原始路径
      const originalPath = _7zBin.path7za;
      if (originalPath && fs.existsSync(originalPath)) {
        _7zPath = originalPath;
        console.log(`✅ 使用原始路径: ${_7zPath}`);
      } else {
        _7zPath = null;
      }
    }
  } else {
    console.warn(`⚠️ 7zip-bin 已加载但未找到 path7za 属性`);
  }
} catch (e) {
  console.warn(`⚠️ 7zip-bin 加载失败: ${e.message}`);
}
const { computeFileHash, hasSuccessByHash } = require('./storage');
const { getKeyAndDeviceForFile, isMacLike } = require('./keyExtractor');

function isArchive(p) {
  const lower = p.toLowerCase();
  return lower.endsWith('.zip') || lower.endsWith('.7z');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

class ScannerService {
  constructor(options) {
    this.options = options || {}; // { uploader, getConfig, appDataDir, log }
  }

  getTempDir() {
    const base = this.options.appDataDir();
    const dir = path.join(base, 'temp');
    ensureDir(dir);
    return dir;
  }

  extractArchiveToTemp(archivePath) {
    try {
      const lower = String(archivePath || '').toLowerCase();
      const target = path.join(this.getTempDir(), `extract_${Date.now()}_${Math.floor(Math.random()*1e6)}`);
      ensureDir(target);
      
      if (lower.endsWith('.zip')) {
        const zip = new AdmZip(archivePath);
        zip.extractAllTo(target, true);
        return target;
      }
      
      if (lower.endsWith('.7z')) {
        if (!_7zPath) {
          const logger = this.options.log || console.log;
          logger(`❌ 7z解压失败: 7zip-bin未正确加载或找不到可执行文件`);
          return null;
        }
        
        // 再次验证7z可执行文件是否存在
        if (!fs.existsSync(_7zPath)) {
          const logger = this.options.log || console.log;
          logger(`❌ 7z解压失败: 7z可执行文件不存在: ${_7zPath}`);
          return null;
        }
        
        const { spawnSync } = require('child_process');
        const logger = this.options.log || console.log;
        logger(`🔧 开始解压7z文件: ${archivePath}`);
        logger(`📂 目标目录: ${target}`);
        logger(`🔨 使用7z工具: ${_7zPath}`);
        
        // 确保目标目录路径使用正确的分隔符（Windows需要反斜杠）
        // 注意：7za.exe 的 -o 参数后面不能有空格，格式为 -o路径
        const targetDir = target.replace(/\//g, path.sep);
        const archivePathNormalized = archivePath.replace(/\//g, path.sep);
        
        // 7za.exe 命令格式: 7za.exe x 源文件 -o目标目录 -y
        // -o 参数后面直接跟路径，不能有空格
        const res = spawnSync(_7zPath, ['x', archivePathNormalized, `-o${targetDir}`, '-y'], {
          encoding: 'utf8',
          timeout: 300000 // 5分钟超时
        });
        
        if (res.status === 0) {
          logger(`✅ 7z解压成功: ${archivePath} -> ${target}`);
          return target;
        } else {
          const errorOutput = (res.stderr || res.stdout || '').toString();
          logger(`❌ 7z解压失败 (退出码: ${res.status}): ${archivePath}`);
          if (errorOutput) {
            logger(`   错误信息: ${errorOutput.substring(0, 500)}`);
          }
          return null;
        }
      }
      
      return null;
    } catch (e) {
      const logger = this.options.log || console.error;
      logger(`❌ 解压异常: ${archivePath}, 错误: ${e.message}`);
      return null;
    }
  }

  extractDeviceIdFromPath(p) {
    // 与后端逻辑保持一致：支持 5G-数字 和 4xxx-xx 两种格式
    // 正则：5G-\d+ 或 4\d{3}-\d{2}
    const deviceIdRegex = /(5G-\d+|4\d{3}-\d{2})/;
    const parts = p.split(/[/\\]/).reverse();
    for (const seg of parts) {
      const m = seg.match(deviceIdRegex);
      if (m) return m[0];
    }
    return '';
  }

  async parseKeyInDir(dir, keyFileName = 'SystemInfo.txt') {
    try {
      const file = path.join(dir, keyFileName);
      const logger = this.options.log || (() => {});
      console.log(`🔍 查找密钥文件: ${file}`);
      try {
        await fsPromises.access(file);
        console.log(`✅ 找到密钥文件: ${file}`);
        // 多编码尝试
        const encodings = ['utf8','gbk','gb2312','latin1'];
        let content = null;
        for (const enc of encodings) {
          try {
            const buf = await fsPromises.readFile(file);
            content = iconv.decode(buf, enc);
            if (content && /[\s\S]+/.test(content)) break;
          } catch {}
        }
        const m = content ? content.match(/([0-9A-Fa-f]{2}[-:]){5}[0-9A-Fa-f]{2}/) : null;
        if (m && isMacLike(m[0])) {
          console.log(`🔑 提取到密钥: ${m[0]}`);
          return m[0].toLowerCase();
        } else {
          console.log(`❌ 密钥文件中未找到有效MAC地址`);
        }
      } catch {
        console.log(`❌ 密钥文件不存在: ${file}`);
      }
    } catch (e) {
      const logger = this.options.log || (() => {});
      logger(`Error reading key file: ${e.message}`);
    }
    return null;
  }

  // 在单元内查找密钥（深度优先，找到第一个就返回）- 异步版本
  async findUnitKey(rootDir, keyFileName, depthLimit) {
    const stack = [{ dir: rootDir, depth: 0 }];
    const BATCH_SIZE = 10; // 每处理10个目录后让出CPU
    let processed = 0;
    
    while (stack.length) {
      const node = stack.pop();
      const { dir, depth } = node;
      
      if (depth > depthLimit) continue;
      
      const key = await this.parseKeyInDir(dir, keyFileName);
      if (key) {
        return key; // 找到第一个密钥就返回
      }
      
      try {
        const entries = await fsPromises.readdir(dir, { withFileTypes: true });
        for (const ent of entries) {
          if (ent.isDirectory()) {
            stack.push({ dir: path.join(dir, ent.name), depth: depth + 1 });
          }
        }
      } catch {}
      
      processed++;
      
      // 让出CPU时间，避免阻塞
      if (processed >= BATCH_SIZE && stack.length > 0) {
        await new Promise(resolve => setImmediate(resolve));
        processed = 0;
      }
    }
    return null;
  }

  // 严格日志文件名校验：YYYYMMDDhh_log.medbot（10位数字开头，无额外段）
  isValidLogFileName(fileName) {
    if (!fileName || typeof fileName !== 'string') return false;
    const lower = fileName.toLowerCase();
    if (!lower.endsWith('_log.medbot')) return false;
    // 提取前缀：去掉 _log.medbot 后缀
    const prefix = fileName.slice(0, fileName.length - '_log.medbot'.length);
    // 必须恰好10位数字（YYYYMMDDhh）
    return /^\d{10}$/.test(prefix);
  }

  async scanDirectory(rootDir, depthLimit = 4, currentKey = null, keyFileName = 'SystemInfo.txt', unitDeviceId = '', ctx = {}) {
    console.log(`🔍 开始扫描目录: ${rootDir}`);
    console.log(`📁 递归深度限制: ${depthLimit}`);
    console.log(`🔑 密钥文件名: ${keyFileName}`);
    if (unitDeviceId) console.log(`🆔 单元设备编号: ${unitDeviceId}`);
    
    // 单元级密钥：一旦找到就固定，不再重复查找
    let unitKey = currentKey;
    if (!unitKey) {
      console.log(`🔍 单元级密钥查找开始...`);
      unitKey = await this.findUnitKey(rootDir, keyFileName, depthLimit);
      if (unitKey) {
        console.log(`🔑 单元密钥已确定: ${unitKey}`);
      } else {
        console.log(`❌ 单元内未找到密钥`);
        // 尝试后端自动填充（根据设备编号）
        if (unitDeviceId) {
          try {
            const cfg = await this.options.getConfig();
            const base = (cfg.apiBaseUrl || '').replace(/\/$/, '');
            const url = `${base}/logs/auto-fill/key?device_id=${encodeURIComponent(unitDeviceId)}`;
            const headers = cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {};
            const axios = require('axios');
            const res = await axios.get(url, { headers });
            if (res.data && res.data.key) {
              unitKey = res.data.key;
              console.log(`🔑 后端自动填充密钥成功: ${unitKey}`);
            } else {
              console.log(`❌ 后端未返回密钥`);
            }
          } catch (e) {
            console.log(`❌ 后端自动填充密钥失败: ${e.message}`);
          }
        }
      }
    } else {
      console.log(`🔑 使用传入的单元密钥: ${unitKey}`);
    }
    
    // 异步扫描目录：使用队列和批处理，避免阻塞
    const stack = [{ dir: rootDir, depth: 0 }];
    const seenNames = new Set(); // 单元内同名合并（original_name）
    const uploader = this.options.uploader;
    const BATCH_SIZE = 50; // 每处理50个文件/目录后让出CPU
    
    let fileProcessed = 0;
    let dirProcessed = 0;
    
    while (stack.length) {
      const node = stack.pop();
      const { dir, depth } = node;
      let deviceIdAtDir = unitDeviceId || this.extractDeviceIdFromPath(dir);
      
      console.log(`📂 扫描目录: ${dir} (深度: ${depth})`);
      try {
        const entries = await fsPromises.readdir(dir, { withFileTypes: true });
        
        // 处理目录
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          if (ent.isDirectory()) {
            if (depth < depthLimit) {
              stack.push({ dir: full, depth: depth + 1 });
            }
            dirProcessed++;
          } else {
            const lower = ent.name.toLowerCase();
            if (lower.endsWith('.medbot')) {
              // 严格校验日志文件名格式
              if (!this.isValidLogFileName(ent.name)) {
                console.log(`⚠️ 文件名不符合日志格式（需 YYYYMMDDhh_log.medbot），跳过: ${ent.name}`);
                continue;
              }
              const fileDevice = unitDeviceId || deviceIdAtDir;
              const logger = this.options.log || (() => {});
              console.log(`📄 发现日志文件: ${ent.name}`);
              console.log(`🆔 设备编号: ${fileDevice || '(none)'}`);
              console.log(`🔑 密钥状态: ${unitKey ? '[found]' : '(missing)'}`);
              
              // 单元内同名合并（优先非临时路径）
              const isTemp = /\btemp\b[/\\]extract_/i.test(dir);
              const originalName = ent.name;
              if (seenNames.has(originalName)) {
                // 已见到同名，若当前是临时路径则直接跳过
                if (isTemp) {
                  console.log(`↩️ 跳过临时同名文件: ${originalName}`);
                  continue;
                }
              } else {
                seenNames.add(originalName);
              }

              if (fileDevice && unitKey) {
                // 规范化持久化路径：对于解压来源，使用 "archivePath!/inner/relative" 形式
                let persistPath = full;
                try {
                  if (ctx && ctx.archiveBase && ctx.extractedRoot) {
                    const rel = path.relative(ctx.extractedRoot, full).replace(/\\/g,'/');
                    persistPath = `${ctx.archiveBase}!/${rel}`;
                  }
                } catch {}
                
                // 内容哈希去重（跨路径/跨重启）
                // 延迟计算哈希，先加入队列，避免阻塞
                let fileHash = null;
                try {
                  // 先检查文件是否存在
                  await fsPromises.access(full);
                  // 异步计算哈希（使用 setImmediate 让出CPU）
                  fileHash = await new Promise((resolve) => {
                    setImmediate(() => {
                      try {
                        resolve(computeFileHash(full));
                      } catch {
                        resolve(null);
                      }
                    });
                  });
                } catch {}
                
                if (fileHash && hasSuccessByHash(this.options.appDataDir || (()=>''), fileHash)) {
                  console.log(`✅ 已上传过相同内容（hash），跳过: ${originalName}`);
                  continue;
                }
                
                const cfg = await this.options.getConfig();
                if (!cfg.scanOnly) {
                  console.log(`📤 准备上传文件: ${ent.name}`);
                  uploader.enqueue({ device_id: fileDevice, decrypt_key: unitKey, file_path: persistPath, upload_path: full, file_hash: fileHash });
                } else {
                  console.log(`🔍 仅扫描模式，跳过上传: ${ent.name}`);
                }
              } else {
                console.log(`⚠️ 缺少设备编号或密钥，跳过: ${ent.name}`);
              }
              
              fileProcessed++;
              
              // 每处理一定数量的文件后让出CPU
              if (fileProcessed >= BATCH_SIZE) {
                await new Promise(resolve => setImmediate(resolve));
                fileProcessed = 0;
              }
            }
          }
        }
      } catch (err) {
        // 忽略权限错误等
        console.log(`⚠️ 扫描目录失败: ${dir}, ${err.message}`);
      }
      
      // 每处理一定数量的目录后也让出CPU
      if (dirProcessed >= BATCH_SIZE) {
        await new Promise(resolve => setImmediate(resolve));
        dirProcessed = 0;
      }
    }
  }

  async scanUnit(unitPath, depthLimit = 4, keyFileName = 'SystemInfo.txt') {
    console.log(`\n🚀 开始扫描单元: ${unitPath}`);
    const unitDeviceId = this.extractDeviceIdFromPath(unitPath);
    if (unitDeviceId) console.log(`🆔 锁定单元设备编号: ${unitDeviceId}`);
    
    if (isArchive(unitPath)) {
      console.log(`📦 检测到压缩包: ${unitPath}`);
      const extracted = this.extractArchiveToTemp(unitPath);
      if (extracted) {
        console.log(`📂 解压到临时目录: ${extracted}`);
        await this.scanDirectory(extracted, depthLimit, null, keyFileName, unitDeviceId, { archiveBase: unitPath, extractedRoot: extracted });
        // 临时目录不立刻删除，避免与上传器的读冲突；由系统或后续清理
      } else {
        console.log(`❌ 解压失败: ${unitPath}`);
      }
      return;
    }
    // directory unit
    console.log(`📁 检测到目录: ${unitPath}`);
    await this.scanDirectory(unitPath, depthLimit, null, keyFileName, unitDeviceId);
  }
}

module.exports = { ScannerService };


