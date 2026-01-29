const path = require('path');
const { objectKeyFromUrl } = require('../utils/oss');

function isTruthy(v) {
  return String(v || '').toLowerCase() === 'true' || String(v || '') === '1';
}

function safeFilename(name, fallback = 'file') {
  const base = path.basename(String(name || '').trim() || fallback);
  // very small hardening: drop CR/LF and quotes
  return base.replace(/[\r\n"]/g, '_');
}

async function proxyOssObject(req, res, opts) {
  const {
    getClient,
    allowedPrefixes,
    defaultFilename,
    permissionHint
  } = opts;

  try {
    const keyParam = req.query.key || '';
    const urlParam = req.query.url || '';
    const raw = keyParam || urlParam;
    if (!raw) {
      return res.status(400).json({ message: 'Missing key' });
    }

    // Express already decodes querystring; still guard against leading "/"
    let objectKey = keyParam ? String(keyParam) : objectKeyFromUrl(urlParam);
    objectKey = String(objectKey || '').replace(/^\//, '');
    if (!objectKey) {
      return res.status(400).json({ message: 'Invalid key' });
    }

    if (Array.isArray(allowedPrefixes) && allowedPrefixes.length > 0) {
      const ok = allowedPrefixes.some((p) => objectKey.startsWith(String(p || '')));
      if (!ok) {
        return res.status(403).json({ message: 'Forbidden key' });
      }
    }

    const client = await getClient();
    if (!client) {
      return res.status(500).json({ message: 'OSS client not available' });
    }

    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;

    const result = await client.getStream(objectKey, { headers });
    const status = result?.res?.status || result?.res?.statusCode || 200;
    const ossHeaders = result?.res?.headers || {};

    // Pass through key headers (important for PDF preview / range requests)
    const passthrough = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'last-modified',
      'etag',
      'cache-control'
    ];
    for (const h of passthrough) {
      if (ossHeaders[h]) res.setHeader(h, ossHeaders[h]);
    }

    // Default content-type if OSS doesn't provide it
    if (!res.getHeader('content-type')) {
      res.setHeader('content-type', 'application/octet-stream');
    }

    // download=1 forces attachment download
    if (isTruthy(req.query.download)) {
      const filename = safeFilename(req.query.filename || defaultFilename || objectKey, defaultFilename || 'file');
      res.setHeader('content-disposition', `attachment; filename="${filename}"`);
    }

    res.status(status);
    return result.stream.pipe(res);
  } catch (err) {
    const status = err?.status || err?.statusCode || 500;
    const code = err?.code || err?.name || 'OSS_PROXY_ERROR';
    const message = err?.message || 'OSS proxy failed';
    console.error('[OSS][proxy] failed:', { code, status, message, permissionHint });
    return res.status(status).json({ message, code });
  }
}

async function proxyTechSolutionObject(req, res) {
  // eslint-disable-next-line global-require
  const techStorage = require('../config/techSolutionStorage');
  const prefixes = [
    (techStorage.OSS_PREFIX || 'tech-solution/').replace(/^\//, ''),
    (techStorage.TMP_PREFIX || 'tech-solution/tmp/').replace(/^\//, '')
  ];
  return proxyOssObject(req, res, {
    getClient: techStorage.getOssClient,
    allowedPrefixes: prefixes,
    defaultFilename: 'tech-solution-asset',
    permissionHint: 'error_code:read'
  });
}

async function proxyFaultCaseObject(req, res) {
  // eslint-disable-next-line global-require
  const faultStorage = require('../config/faultCaseStorage');
  const prefixes = [
    (faultStorage.OSS_PREFIX || 'fault-cases/').replace(/^\//, ''),
    (faultStorage.TMP_PREFIX || 'fault-cases/tmp/').replace(/^\//, '')
  ];
  return proxyOssObject(req, res, {
    getClient: faultStorage.getOssClient,
    allowedPrefixes: prefixes,
    defaultFilename: 'fault-case-asset',
    permissionHint: 'fault_case:read'
  });
}

async function proxyKbObject(req, res) {
  // eslint-disable-next-line global-require
  const kbStorage = require('../config/kbStorage');
  const prefixes = [
    (kbStorage.OSS_PREFIX || 'kb/').replace(/^\//, ''),
    (kbStorage.TMP_PREFIX || 'kb/tmp/').replace(/^\//, '')
  ];
  return proxyOssObject(req, res, {
    getClient: kbStorage.getOssClient,
    allowedPrefixes: prefixes,
    defaultFilename: 'kb-document',
    permissionHint: 'kb:read'
  });
}

async function proxyMotionDataObject(req, res) {
  // eslint-disable-next-line global-require
  const motionStorage = require('../config/motionDataStorage');
  const fs = require('fs');
  const path = require('path');

  // 如果使用本地存储，直接从本地文件系统读取
  if (motionStorage.STORAGE === 'local') {
    try {
      const keyParam = req.query.key || '';
      const urlParam = req.query.url || '';
      const raw = keyParam || urlParam;
      if (!raw) {
        return res.status(400).json({ message: 'Missing key' });
      }

      let objectKey = keyParam ? String(keyParam) : (urlParam ? decodeURIComponent(urlParam) : '');
      objectKey = String(objectKey || '').replace(/^\//, '');
      if (!objectKey) {
        return res.status(400).json({ message: 'Invalid key' });
      }

      // 构建本地文件路径
      const localPath = path.join(motionStorage.LOCAL_DIR, objectKey);
      
      // 安全检查：确保路径在 LOCAL_DIR 内，防止路径遍历攻击
      const normalizedPath = path.normalize(localPath);
      const normalizedDir = path.normalize(motionStorage.LOCAL_DIR);
      if (!normalizedPath.startsWith(normalizedDir)) {
        return res.status(403).json({ message: 'Forbidden path' });
      }

      if (!fs.existsSync(localPath)) {
        return res.status(404).json({ message: 'File not found' });
      }

      const stats = fs.statSync(localPath);
      const fileSize = stats.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(localPath, { start, end });
        const head = {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'application/octet-stream',
        };
        res.writeHead(206, head);
        file.pipe(res);
      } else {
        const head = {
          'Content-Length': fileSize,
          'Content-Type': 'application/octet-stream',
        };
        if (isTruthy(req.query.download)) {
          const filename = safeFilename(req.query.filename || path.basename(objectKey), 'motion-data');
          head['Content-Disposition'] = `attachment; filename="${filename}"`;
        }
        res.writeHead(200, head);
        fs.createReadStream(localPath).pipe(res);
      }
    } catch (err) {
      const status = err?.status || err?.statusCode || 500;
      const code = err?.code || err?.name || 'LOCAL_STORAGE_ERROR';
      const message = err?.message || 'Local storage proxy failed';
      console.error('[motion-data][local][proxy] failed:', { code, status, message });
      return res.status(status).json({ message, code });
    }
    return;
  }

  // OSS 存储：使用原有逻辑
  const prefixes = [
    (motionStorage.OSS_PREFIX || 'motion-data/').replace(/^\//, '')
  ];
  return proxyOssObject(req, res, {
    getClient: motionStorage.getOssClient,
    allowedPrefixes: prefixes,
    defaultFilename: 'motion-data',
    permissionHint: 'data_replay:manage'
  });
}

module.exports = {
  proxyTechSolutionObject,
  proxyFaultCaseObject,
  proxyKbObject,
  proxyMotionDataObject
};


