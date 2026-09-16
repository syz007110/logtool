/**
 * RAR 只走 unrar（RARLab / WinRAR UnRAR），不回退 7z。
 * 7z/p7zip 对 RAR5 会报 Unsupported Method，不能当作 RAR 解压器。
 */
const fs = require('fs');
const path = require('path');

function errorText(err) {
  return [err?.message, err?.stderr, err?.stdout].filter(Boolean).join('\n');
}

function isExtractorMissingError(err) {
  const text = errorText(err);
  return err?.code === 'ENOENT'
    || /not found|不是内部或外部命令|command not found/i.test(text);
}

function withTrailingSep(dir) {
  if (!dir) return dir;
  return dir.endsWith(path.sep) ? dir : dir + path.sep;
}

function buildUnrarExtractArgs(archivePath, extractDir) {
  return ['x', '-o+', '-y', archivePath, withTrailingSep(extractDir)];
}

function isPathLookupName(bin) {
  return !bin.includes('/') && !bin.includes('\\');
}

function listUnrarBinaries() {
  const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
  const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';

  const bins = [
    'unrar',
    path.join(programFiles, 'WinRAR', 'UnRAR.exe'),
    path.join(programFilesX86, 'WinRAR', 'UnRAR.exe'),
    '/usr/bin/unrar',
    '/usr/local/bin/unrar'
  ];

  const seen = new Set();
  return bins.filter((bin) => {
    const key = bin.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    if (isPathLookupName(bin)) return true;
    return fs.existsSync(bin);
  });
}

function formatRarExtractFailure(attemptErrors) {
  const details = attemptErrors.length > 0
    ? attemptErrors.join('\n')
    : '未找到 unrar';
  return `RAR解压失败: .rar 只使用 unrar，请安装 RARLab 的 unrar（不要只用 unrar-free）。\n${details}`;
}

module.exports = {
  buildUnrarExtractArgs,
  errorText,
  formatRarExtractFailure,
  isExtractorMissingError,
  listUnrarBinaries,
  withTrailingSep
};
