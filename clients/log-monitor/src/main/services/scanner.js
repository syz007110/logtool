const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const iconv = require('iconv-lite');
let _7zBin = null;
try { _7zBin = require('7zip-bin'); } catch {}
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
      if (lower.endsWith('.7z') && _7zBin && _7zBin.path7za) {
        const { spawnSync } = require('child_process');
        const res = spawnSync(_7zBin.path7za, ['x', archivePath, `-o${target}`, '-y']);
        if (res.status === 0) return target;
        return null;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  extractDeviceIdFromPath(p) {
    const parts = p.split(/[/\\]/).reverse();
    for (const seg of parts) {
      const m = seg.match(/\b[0-9A-Za-z]{3,5}-[0-9A-Za-z]{2}\b/);
      if (m) return m[0];
    }
    return '';
  }

  parseKeyInDir(dir, keyFileName = 'SystemInfo.txt') {
    try {
      const file = path.join(dir, keyFileName);
      const logger = this.options.log || (() => {});
      console.log(`🔍 查找密钥文件: ${file}`);
      if (fs.existsSync(file)) {
        console.log(`✅ 找到密钥文件: ${file}`);
        // 多编码尝试
        const encodings = ['utf8','gbk','gb2312','latin1'];
        let content = null;
        for (const enc of encodings) {
          try {
            const buf = fs.readFileSync(file);
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
      } else {
        console.log(`❌ 密钥文件不存在: ${file}`);
      }
    } catch (e) {
      const logger = this.options.log || (() => {});
      logger(`Error reading key file: ${e.message}`);
    }
    return null;
  }

  // 在单元内查找密钥（深度优先，找到第一个就返回）
  findUnitKey(rootDir, keyFileName, depthLimit) {
    const stack = [{ dir: rootDir, depth: 0 }];
    while (stack.length) {
      const node = stack.pop();
      const { dir, depth } = node;
      
      if (depth > depthLimit) continue;
      
      const key = this.parseKeyInDir(dir, keyFileName);
      if (key) {
        return key; // 找到第一个密钥就返回
      }
      
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          if (ent.isDirectory()) {
            stack.push({ dir: path.join(dir, ent.name), depth: depth + 1 });
          }
        }
      } catch {}
    }
    return null;
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
      unitKey = this.findUnitKey(rootDir, keyFileName, depthLimit);
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
    
    const stack = [{ dir: rootDir, depth: 0 }];
    const seenNames = new Set(); // 单元内同名合并（original_name）
    const uploader = this.options.uploader;
    while (stack.length) {
      const node = stack.pop();
      const { dir, depth } = node;
      let deviceIdAtDir = unitDeviceId || this.extractDeviceIdFromPath(dir);
      
      console.log(`📂 扫描目录: ${dir} (深度: ${depth})`);
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          if (ent.isDirectory()) {
            if (depth < depthLimit) {
              stack.push({ dir: full, depth: depth + 1 });
            }
          } else {
            const lower = ent.name.toLowerCase();
            if (lower.endsWith('.medbot')) {
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
                let fileHash = null;
                try { fileHash = computeFileHash(full); } catch {}
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
            }
          }
        }
      } catch {}
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


