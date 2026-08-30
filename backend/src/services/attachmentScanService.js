const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const ArchiveProcessor = require('../utils/archiveProcessor');
const { extractMacFromSystemInfo, validateMacAddress, normalizeMacAddress } = require('../utils/systemInfoParser');
const { findDeviceIdByKeyValue } = require('./deviceKeyService');
const { resolveAttachmentSourcePath } = require('./agentLogUploadHelper');
const { getOssClient } = require('../config/agentAssetStorage');
const {
  normalizeName,
  isArchiveName,
  isSystemInfoName,
  isValidLogFileName,
  extractDeviceIdFromText,
  extractMacAddressFromText,
  DEVICE_ID_EXTRACT_REGEX
} = require('./attachmentScanHelper');
const { SCAN_WORKSPACE_ROOT } = require('../config/agentScanWorkspace');
const { resolveAttachmentUploadPreparation } = require('./attachmentUploadPreparationResolver');
const MAX_SCAN_DEPTH = 3;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_) {}
}

async function safeRm(dirPath) {
  try {
    if (dirPath && fs.existsSync(dirPath)) {
      await fs.promises.rm(dirPath, { recursive: true, force: true });
    }
  } catch (_) {}
}

async function materializeAttachmentToWorkspace(attachment, workspaceDir) {
  const originalName = normalizeName(attachment?.originalName || attachment?.storedName || 'attachment');
  const safeOriginalName = path.basename(originalName) || 'attachment';
  const targetDir = ensureDir(path.join(workspaceDir, `attachment_${Date.now()}_${randomUUID()}`));
  const targetPath = path.join(targetDir, safeOriginalName);
  const storage = normalizeName(attachment?.storage).toLowerCase();

  if (storage === 'oss') {
    const objectKey = normalizeName(attachment?.objectKey);
    if (!objectKey) throw new Error(`attachment objectKey missing: ${originalName}`);
    const client = await getOssClient();
    if (!client || typeof client.get !== 'function') {
      throw new Error(`attachment oss client unavailable: ${originalName}`);
    }
    await client.get(objectKey.replace(/^\//, ''), targetPath);
    return { originalName: safeOriginalName, localPath: targetPath };
  }

  const sourcePath = resolveAttachmentSourcePath(attachment);
  await fs.promises.copyFile(sourcePath, targetPath);
  return { originalName: safeOriginalName, localPath: targetPath };
}

function extractDeviceIdFromAnyPath(input) {
  const text = normalizeName(input);
  const match = text.match(DEVICE_ID_EXTRACT_REGEX);
  return match ? String(match[1] || match[0]).toUpperCase() : '';
}

async function gatherScanRoots(stagedAttachment, workspaceDir) {
  const attachmentName = stagedAttachment.originalName;
  const localPath = stagedAttachment.localPath;
  const scanRoots = [];
  const archivesFound = isArchiveName(attachmentName) ? 1 : 0;

  if (archivesFound > 0) {
    const extractDir = path.join(workspaceDir, `extract_${randomUUID()}`);
    ensureDir(extractDir);
    const archiveProcessor = new ArchiveProcessor({ tempDirBase: workspaceDir });
    await archiveProcessor.extractArchive(localPath, extractDir);
    scanRoots.push({ rootPath: extractDir, rootName: attachmentName });
  } else {
    scanRoots.push({ rootPath: localPath, rootName: attachmentName });
  }

  return { archivesFound, scanRoots };
}

async function inspectFile(filePath, rootName, relativePath, scanState, attachmentMeta = {}) {
  const filename = path.basename(filePath);
  const deviceIdFromPath = extractDeviceIdFromAnyPath(`${rootName}\\${relativePath}`);
  if (deviceIdFromPath) scanState.deviceIdCandidates.add(deviceIdFromPath);

  if (isSystemInfoName(filename)) {
    scanState.systemInfoFound += 1;
    const mac = extractMacFromSystemInfo(filePath);
    if (mac && validateMacAddress(mac)) {
      const normalized = normalizeMacAddress(mac);
      scanState.detectedKeys.push({ value: normalized, source: 'systeminfo' });
      const reverseDeviceId = await findDeviceIdByKeyValue(normalized);
      if (reverseDeviceId) scanState.deviceIdCandidates.add(String(reverseDeviceId).toUpperCase());
    }
    return;
  }

  if (isValidLogFileName(filename)) {
    scanState.logs.push({
      filePath,
      originalName: filename,
      deviceIdHint: deviceIdFromPath || '',
      attachmentAssetId: normalizeName(attachmentMeta.assetId) || null
    });
  }
}

async function scanDirectoryRecursive(dirPath, rootName, scanState, depth, rootBasePath, attachmentMeta = {}) {
  if (depth > MAX_SCAN_DEPTH) return;
  let entries = [];
  try {
    entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  } catch (_) {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(rootBasePath, fullPath);
    if (entry.isDirectory()) {
      await scanDirectoryRecursive(fullPath, rootName, scanState, depth + 1, rootBasePath, attachmentMeta);
    } else {
      await inspectFile(fullPath, rootName, relativePath, scanState, attachmentMeta);
    }
  }
}

async function scanRoot(root, scanState, attachmentMeta = {}) {
  if (!root || !root.rootPath) return;
  const absoluteRoot = path.resolve(root.rootPath);
  if (!fs.existsSync(absoluteRoot)) return;
  const stat = await fs.promises.stat(absoluteRoot);
  if (stat.isFile()) {
    await inspectFile(absoluteRoot, root.rootName, root.rootName, scanState, attachmentMeta);
    return;
  }
  await scanDirectoryRecursive(absoluteRoot, root.rootName, scanState, 0, absoluteRoot, attachmentMeta);
}

async function scanAttachmentsForMessage(request = {}) {
  const attachments = Array.isArray(request?.message?.attachments) ? request.message.attachments : [];
  const supportedAttachments = attachments.filter((attachment) => {
    const name = normalizeName(attachment?.originalName || attachment?.storedName).toLowerCase();
    return name.endsWith('.medbot') || name.endsWith('.txt') || name.endsWith('.zip') || name.endsWith('.7z');
  });
  if (supportedAttachments.length < 1) return null;

  ensureDir(SCAN_WORKSPACE_ROOT);
  const workspaceDir = ensureDir(path.join(SCAN_WORKSPACE_ROOT, `scan_${Date.now()}_${randomUUID()}`));
  const scanState = {
    explicitDeviceId: extractDeviceIdFromText(request?.message?.text),
    explicitKey: extractMacAddressFromText(request?.message?.text),
    deviceIdCandidates: new Set(),
    detectedKeys: [],
    logs: [],
    systemInfoFound: 0,
    archivesFound: 0
  };

  try {
    for (const attachment of supportedAttachments) {
      const staged = await materializeAttachmentToWorkspace(attachment, workspaceDir);
      const gathered = await gatherScanRoots(staged, workspaceDir);
      scanState.archivesFound += gathered.archivesFound;
      const directDeviceId = extractDeviceIdFromAnyPath(staged.originalName);
      if (directDeviceId) scanState.deviceIdCandidates.add(directDeviceId);
      for (const root of gathered.scanRoots) {
        await scanRoot(root, scanState, { assetId: attachment?.assetId || null });
      }
    }

    return resolveAttachmentUploadPreparation({
      files: scanState.logs.map((log) => ({
        sourceFilePath: log.filePath,
        originalName: log.originalName,
        attachmentAssetId: log.attachmentAssetId || null,
        deviceIdHint: log.deviceIdHint || ''
      })),
      explicitDeviceId: scanState.explicitDeviceId,
      explicitDecryptKey: scanState.explicitKey,
      deviceIdCandidates: Array.from(scanState.deviceIdCandidates),
      detectedKeys: scanState.detectedKeys
    });
  } finally {
    // 保留扫描工作区，供后续日志上传复用 sourceFilePath。
  }
}

module.exports = {
  SCAN_WORKSPACE_ROOT,
  scanAttachmentsForMessage
};
