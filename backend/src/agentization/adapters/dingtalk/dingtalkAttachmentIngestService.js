const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { ensureTempDir } = require('../../../config/agentAssetStorage');
const { ingestAgentAssetFromFile, safeUnlink } = require('../../../services/agentAssetIngestService');
const {
  validateAttachmentCount,
  validateAttachmentTotalSize
} = require('../../../services/agentAttachmentPolicy');
const { getRobotAccessToken, postJson } = require('../../delivery/dingtalkOutboundService');

const DOWNLOAD_FILE_ENDPOINT = 'https://api.dingtalk.com/v1.0/robot/messageFiles/download';
const MAX_REDIRECTS = 5;

function isAttachmentDebugEnabled() {
  return false;
}

function maskValue(value, keepStart = 6, keepEnd = 4) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= keepStart + keepEnd) return '***';
  return `${text.slice(0, keepStart)}***${text.slice(-keepEnd)}`;
}

function sanitizeUrlForLog(urlValue) {
  const text = String(urlValue || '').trim();
  if (!text) return '';
  try {
    const parsed = new URL(text);
    return `${parsed.origin}${parsed.pathname}`;
  } catch (_) {
    return maskValue(text, 8, 4);
  }
}

function logAttachmentDebug(step, payload) {
  if (!isAttachmentDebugEnabled()) return;
  console.info('[dingtalk-attachment]', {
    step: String(step || '').trim() || 'unknown',
    ...(payload && typeof payload === 'object' ? payload : {})
  });
}

function asPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function optionalString(value) {
  const text = String(value || '').trim();
  return text || undefined;
}

function visitNodes(value, visitor) {
  if (Array.isArray(value)) {
    value.forEach((item) => visitNodes(item, visitor));
    return;
  }
  if (!value || typeof value !== 'object') return;
  visitor(value);
  Object.values(value).forEach((child) => {
    if (child && typeof child === 'object') visitNodes(child, visitor);
  });
}

function buildAttachmentCandidate(node, type, fields = {}) {
  const raw = asPlainObject(node);
  const downloadCode = optionalString(raw[fields.downloadCodeField || '']);
  const url = optionalString(raw[fields.urlField || '']);
  if (!downloadCode && !url) return null;
  return {
    type: String(type || '').trim() || 'file',
    downloadCode,
    url,
    name: optionalString(raw[fields.nameField || '']),
    mimeType: optionalString(raw[fields.mimeTypeField || '']),
    sourceNodeType: optionalString(raw[fields.sourceNodeTypeField || 'type'])
  };
}

function parseContentObject(payload) {
  const content = payload?.content;
  if (content && typeof content === 'object' && !Array.isArray(content)) return content;
  if (typeof content !== 'string') return null;
  const text = content.trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

function getTopLevelPayloadByMsgType(payload, msgtype) {
  const normalized = String(msgtype || '').trim();
  if (!normalized) return null;
  return asPlainObject(payload?.[normalized]);
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(candidates) ? candidates : []) {
    if (!item || typeof item !== 'object') continue;
    const key = `${item.downloadCode || ''}|${item.url || ''}|${item.name || ''}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function extractPictureCandidates(payload) {
  const content = parseContentObject(payload);
  const candidate = buildAttachmentCandidate(content, 'image', {
    downloadCodeField: 'downloadCode',
    nameField: 'pictureName',
    mimeTypeField: 'pictureType',
    sourceNodeTypeField: 'msgtype'
  }) || buildAttachmentCandidate(content, 'image', {
    downloadCodeField: 'pictureDownloadCode',
    nameField: 'pictureName',
    mimeTypeField: 'pictureType',
    sourceNodeTypeField: 'msgtype'
  });
  return candidate ? [candidate] : [];
}

function extractFileCandidates(payload) {
  const content = parseContentObject(payload);
  const candidate = buildAttachmentCandidate(content, 'file', {
    downloadCodeField: 'downloadCode',
    nameField: 'fileName',
    mimeTypeField: 'fileType',
    sourceNodeTypeField: 'msgtype'
  });
  return candidate ? [candidate] : [];
}

function extractVideoCandidates(payload) {
  const content = parseContentObject(payload);
  const candidate = buildAttachmentCandidate(content, 'file', {
    downloadCodeField: 'downloadCode',
    nameField: 'videoName',
    mimeTypeField: 'videoType',
    sourceNodeTypeField: 'msgtype'
  });
  return candidate ? [candidate] : [];
}

function extractRichTextCandidates(payload) {
  const content = parseContentObject(payload);
  const richText = Array.isArray(content?.richText) ? content.richText : [];
  const out = [];
  for (const node of richText) {
    const rawNode = asPlainObject(node);
    const nodeType = String(rawNode.type || '').trim().toLowerCase();
    if (nodeType === 'picture') {
      const candidate = buildAttachmentCandidate(rawNode, 'image', {
        downloadCodeField: 'downloadCode',
        nameField: 'pictureName',
        mimeTypeField: 'pictureType'
      }) || buildAttachmentCandidate(rawNode, 'image', {
        downloadCodeField: 'pictureDownloadCode',
        nameField: 'pictureName',
        mimeTypeField: 'pictureType'
      });
      if (candidate) out.push(candidate);
      continue;
    }
    if (nodeType === 'file') {
      const candidate = buildAttachmentCandidate(rawNode, 'file', {
        downloadCodeField: 'downloadCode',
        nameField: 'fileName',
        mimeTypeField: 'fileType'
      });
      if (candidate) out.push(candidate);
      continue;
    }
    if (nodeType === 'video') {
      const candidate = buildAttachmentCandidate(rawNode, 'file', {
        downloadCodeField: 'downloadCode',
        nameField: 'videoName',
        mimeTypeField: 'videoType'
      });
      if (candidate) out.push(candidate);
    }
  }
  return out;
}

function extractAttachmentCandidates(payload = {}) {
  const msgtype = String(payload?.msgtype || '').trim().toLowerCase();
  if (!msgtype || msgtype === 'text' || msgtype === 'audio') return [];

  let candidates = [];
  if (msgtype === 'picture') {
    candidates = extractPictureCandidates(payload);
  } else if (msgtype === 'file') {
    candidates = extractFileCandidates(payload);
  } else if (msgtype === 'video') {
    candidates = extractVideoCandidates(payload);
  } else if (msgtype === 'richtext') {
    candidates = extractRichTextCandidates(payload);
  }

  const deduped = dedupeCandidates(candidates);
  logAttachmentDebug('candidate_extract', {
    messageId: maskValue(payload?.msgId || payload?.messageId, 4, 4),
    msgtype,
    candidateCount: deduped.length,
    candidates: deduped.map((item) => ({
      type: item.type,
      hasDownloadCode: Boolean(item.downloadCode),
      downloadCode: item.downloadCode ? maskValue(item.downloadCode, 4, 4) : '',
      downloadCodeRaw: item.downloadCode || '',
      hasUrl: Boolean(item.url),
      url: item.url ? sanitizeUrlForLog(item.url) : '',
      name: item.name || '',
      mimeType: item.mimeType || '',
      sourceNodeType: item.sourceNodeType || ''
    }))
  });
  return deduped;
}

function extractAudioRecognitionText(payload = {}) {
  const msgtype = String(payload?.msgtype || '').trim().toLowerCase();
  if (msgtype !== 'audio') return '';
  const content = parseContentObject(payload);
  return String(
    content?.recognition
    || content?.recognitionContent
    || content?.speechText
    || payload?.recognition
    || ''
  ).trim();
}

async function requestDownloadUrl(downloadCode, options = {}) {
  const robotCode = String(options.robotCode || '').trim();
  if (!robotCode) {
    throw new Error('dingtalk robotCode is required for attachment download');
  }
  const accessToken = await (options.getAccessToken || getRobotAccessToken)();
  const resp = await (options.postJson || postJson)(
    DOWNLOAD_FILE_ENDPOINT,
    {
      robotCode,
      downloadCode: String(downloadCode || '').trim()
    },
    { 'x-acs-dingtalk-access-token': accessToken }
  );
  const downloadUrl = String(
    resp?.downloadUrl || resp?.download_url || resp?.url || resp?.downloadUri || ''
  ).trim();
  if (!downloadUrl) {
    logAttachmentDebug('download_url_missing', {
      downloadCode: maskValue(downloadCode, 4, 4),
      downloadCodeRaw: String(downloadCode || ''),
      httpStatus: Number(resp?._httpStatus) || 0,
      responseHeaders: resp?._httpHeaders || {},
      response: resp && typeof resp === 'object'
        ? JSON.stringify(resp)
        : String(resp || '')
    });
    throw new Error(`dingtalk downloadUrl missing for downloadCode: ${String(downloadCode || '')}`);
  }
  logAttachmentDebug('download_url_resolved', {
    downloadCode: maskValue(downloadCode, 4, 4),
    downloadCodeRaw: String(downloadCode || ''),
    downloadUrl: sanitizeUrlForLog(downloadUrl)
  });
  return downloadUrl;
}

function guessExtension({ filename, url, mimeType }) {
  const fromName = path.extname(String(filename || '').trim());
  if (fromName) return fromName;
  try {
    const pathname = new URL(String(url || '')).pathname || '';
    const fromUrl = path.extname(pathname);
    if (fromUrl) return fromUrl;
  } catch (_) {}
  const mime = String(mimeType || '').trim().toLowerCase();
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'text/plain') return '.txt';
  if (mime === 'application/zip') return '.zip';
  return '';
}

function writeResponseToFile(response, targetPath) {
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(targetPath);
    response.pipe(stream);
    stream.on('finish', () => resolve());
    stream.on('error', reject);
    response.on('error', reject);
  });
}

async function downloadFileToTemp(urlValue, options = {}, redirectCount = 0) {
  const targetUrl = String(urlValue || '').trim();
  if (!targetUrl) {
    throw new Error('download url is required');
  }
  if (redirectCount > MAX_REDIRECTS) {
    throw new Error('too many redirects while downloading dingtalk attachment');
  }

  const parsed = new URL(targetUrl);
  const transport = parsed.protocol === 'http:' ? http : https;
  const ext = guessExtension({
    filename: options.filename,
    url: targetUrl,
    mimeType: options.mimeType
  });
  const targetPath = path.resolve(
    ensureTempDir(),
    `dingtalk-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`
  );

  return new Promise((resolve, reject) => {
    const req = transport.get(targetUrl, (res) => {
      const status = Number(res.statusCode || 0);
      if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
        res.resume();
        safeUnlink(targetPath);
        return resolve(
          downloadFileToTemp(new URL(res.headers.location, targetUrl).toString(), options, redirectCount + 1)
        );
      }
      if (status < 200 || status >= 300) {
        res.resume();
        safeUnlink(targetPath);
        return reject(new Error(`download dingtalk attachment failed: ${status}`));
      }

      writeResponseToFile(res, targetPath)
        .then(() => {
          const result = {
            filePath: targetPath,
            mimeType: String(res.headers['content-type'] || options.mimeType || 'application/octet-stream').split(';')[0].trim(),
            sizeBytes: Number(res.headers['content-length'] || 0) || Number(fs.statSync(targetPath).size || 0)
          };
          logAttachmentDebug('file_downloaded', {
            filename: options.filename || path.basename(targetPath),
            mimeType: result.mimeType,
            targetPath,
            statusCode: status
          });
          resolve(result);
        })
        .catch((error) => {
          safeUnlink(targetPath);
          reject(error);
        });
      return undefined;
    });
    req.on('error', (error) => {
      safeUnlink(targetPath);
      reject(error);
    });
  });
}

async function ingestDingtalkAttachment(candidate, options = {}) {
  logAttachmentDebug('candidate_ingest_start', {
    type: candidate?.type || '',
    hasDownloadCode: Boolean(candidate?.downloadCode),
    downloadCode: candidate?.downloadCode ? maskValue(candidate.downloadCode, 4, 4) : '',
    downloadCodeRaw: candidate?.downloadCode || '',
    url: candidate?.url ? sanitizeUrlForLog(candidate.url) : '',
    name: candidate?.name || '',
    mimeType: candidate?.mimeType || ''
  });
  const downloadUrl = candidate.downloadCode
    ? await requestDownloadUrl(candidate.downloadCode, options)
    : String(candidate.url || '').trim();
  const downloaded = await downloadFileToTemp(downloadUrl, {
    filename: candidate.name,
    mimeType: candidate.mimeType
  });
  try {
    const asset = await ingestAgentAssetFromFile({
      filePath: downloaded.filePath,
      originalName: candidate.name || path.basename(downloaded.filePath),
      mimeType: downloaded.mimeType || candidate.mimeType || 'application/octet-stream',
      uploaderId: options.uploaderId,
      source: 'dingtalk'
    });
    logAttachmentDebug('asset_ingested', {
      type: asset?.type || '',
      assetId: asset?.assetId || '',
      storage: asset?.storage || '',
      objectKey: asset?.objectKey || '',
      mimeType: asset?.mimeType || '',
      url: asset?.url ? sanitizeUrlForLog(asset.url) : ''
    });
    return asset;
  } catch (error) {
    logAttachmentDebug('asset_ingest_failed', {
      name: candidate?.name || '',
      mimeType: downloaded?.mimeType || candidate?.mimeType || '',
      error: String(error?.message || error)
    });
    safeUnlink(downloaded.filePath);
    throw error;
  }
}

async function ingestDingtalkAttachments(payload, options = {}) {
  const candidates = Array.isArray(options.candidates) ? options.candidates : extractAttachmentCandidates(payload);
  if (candidates.length === 0) return [];
  validateAttachmentCount(candidates.length);
  const out = [];
  let totalSizeBytes = 0;
  for (const candidate of candidates) {
    const asset = await ingestDingtalkAttachment(candidate, {
      ...options,
      robotCode: String(options.robotCode || payload?.robotCode || '').trim() || undefined
    });
    totalSizeBytes += Number(asset?.sizeBytes || 0);
    validateAttachmentTotalSize(totalSizeBytes);
    out.push(asset);
  }
  logAttachmentDebug('message_attachment_result', {
    messageId: maskValue(payload?.msgId || payload?.messageId, 4, 4),
    attachmentCount: out.length,
    attachments: out.map((item) => ({
      type: item?.type || '',
      assetId: item?.assetId || '',
      storage: item?.storage || '',
      objectKey: item?.objectKey || '',
      mimeType: item?.mimeType || ''
    }))
  });
  return out;
}

module.exports = {
  DOWNLOAD_FILE_ENDPOINT,
  extractAttachmentCandidates,
  extractAudioRecognitionText,
  ingestDingtalkAttachments,
  requestDownloadUrl
};
