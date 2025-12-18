const fs = require('fs');
const path = require('path');

function isMacLike(str) {
  if (!str) return false;
  const s = String(str).trim();
  return /^([0-9A-Fa-f]{2}[-:]){5}[0-9A-Fa-f]{2}$/.test(s);
}

function parseKeyFromFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/([0-9A-Fa-f]{2}[-:]){5}[0-9A-Fa-f]{2}/);
      if (m && isMacLike(m[0])) return m[0].toLowerCase();
    }
  } catch {}
  return null;
}

function findKeyFileUpwards(startDir, maxDepth = 4, fileName = 'systemInfo.txt') {
  try {
    let dir = startDir;
    for (let i = 0; i < maxDepth && dir && dir !== path.parse(dir).root; i++) {
      const candidate = path.join(dir, fileName);
      if (fs.existsSync(candidate)) return candidate;
      dir = path.dirname(dir);
    }
  } catch {}
  return null;
}

function extractDeviceIdFromPath(fullPath) {
  // 与后端逻辑保持一致：支持 5G-数字 和 4xxx-xx 两种格式
  // 正则：5G-\d+ 或 4\d{3}-\d{2}
  const deviceIdRegex = /(5G-\d+|4\d{3}-\d{2})/;
  const parts = fullPath.split(/[/\\]/).reverse();
  for (const seg of parts) {
    const m = seg.match(deviceIdRegex);
    if (m) return m[0];
  }
  return '';
}

function getKeyAndDeviceForFile(fullPath, options = {}) {
  const { recurseDepth = 4, keyFileName = 'systemInfo.txt' } = options;
  const dir = path.dirname(fullPath);
  const keyFile = findKeyFileUpwards(dir, recurseDepth, keyFileName);
  const decryptKey = keyFile ? parseKeyFromFile(keyFile) : null;
  const deviceId = extractDeviceIdFromPath(fullPath);
  return { decryptKey, deviceId };
}

module.exports = { getKeyAndDeviceForFile, isMacLike };


