/**
 * RAR 解压工具选择：优先 RARLab unrar，再回退官方 7zz / 系统 7z。
 * Linux p7zip 的 7z 常因 RAR5 报 Unsupported Method。
 */
const fs = require('fs');
const path = require('path');

function errorText(err) {
  return [err?.message, err?.stderr, err?.stdout].filter(Boolean).join('\n');
}

function isUnsupportedMethodError(err) {
  return /Unsupported Method/i.test(errorText(err));
}

function isExtractorMissingError(err) {
  const text = errorText(err);
  return err?.code === 'ENOENT'
    || /not found|不是内部或外部命令|command not found/i.test(text);
}

function shouldTryNextRarExtractor(err) {
  return isExtractorMissingError(err) || isUnsupportedMethodError(err);
}

function withTrailingSep(dir) {
  if (!dir) return dir;
  return dir.endsWith(path.sep) ? dir : dir + path.sep;
}

function buildRarExtractArgs(kind, archivePath, extractDir) {
  if (kind === 'unrar') {
    return ['x', '-o+', '-y', archivePath, withTrailingSep(extractDir)];
  }
  return ['x', archivePath, `-o${extractDir}`, '-y'];
}

function isPathLookupName(bin) {
  return !bin.includes('/') && !bin.includes('\\');
}

function listRarExtractorCandidates() {
  const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
  const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';

  const candidates = [
    { kind: 'unrar', bin: 'unrar' },
    { kind: 'unrar', bin: path.join(programFiles, 'WinRAR', 'UnRAR.exe') },
    { kind: 'unrar', bin: path.join(programFilesX86, 'WinRAR', 'UnRAR.exe') },
    { kind: 'unrar', bin: '/usr/bin/unrar' },
    { kind: 'unrar', bin: '/usr/local/bin/unrar' },
    { kind: '7z', bin: '7zz' },
    { kind: '7z', bin: '7z' },
    { kind: '7z', bin: path.join(programFiles, '7-Zip', '7z.exe') },
    { kind: '7z', bin: path.join(programFilesX86, '7-Zip', '7z.exe') },
    { kind: '7z', bin: '/usr/bin/7zz' },
    { kind: '7z', bin: '/usr/bin/7z' }
  ];

  const seen = new Set();
  return candidates.filter((item) => {
    const key = `${item.kind}:${item.bin.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (isPathLookupName(item.bin)) return true;
    return fs.existsSync(item.bin);
  });
}

function formatRarExtractFailure(attemptErrors) {
  const details = attemptErrors.length > 0
    ? attemptErrors.join('\n')
    : '未找到可用的 unrar / 7zz / 7z';
  return `RAR解压失败: 当前环境无法解码该 RAR（常见于 RAR5）。请安装 RARLab 的 unrar（不要只用 unrar-free），或官方 7-Zip 的 7zz。\n${details}`;
}

module.exports = {
  buildRarExtractArgs,
  errorText,
  formatRarExtractFailure,
  isExtractorMissingError,
  isUnsupportedMethodError,
  listRarExtractorCandidates,
  shouldTryNextRarExtractor,
  withTrailingSep
};
