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

module.exports = {
  proxyTechSolutionObject,
  proxyFaultCaseObject
};


