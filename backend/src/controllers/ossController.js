const { URL } = require('url');

function safeString(v) {
  if (v === null || v === undefined) return '';
  return String(v);
}

function normalizeObjectKey(raw) {
  const k = safeString(raw).trim();
  if (!k) return '';
  // strip leading slash
  const noLead = k.startsWith('/') ? k.slice(1) : k;
  // basic traversal guard
  if (noLead.includes('..')) return '';
  return noLead;
}

function isAllowedKey(key, allowedPrefixes) {
  const k = normalizeObjectKey(key);
  if (!k) return false;
  return allowedPrefixes.some((p) => {
    const pp = safeString(p).trim().replace(/^\//, '');
    if (!pp) return false;
    return k.startsWith(pp);
  });
}

function contentDisposition(filename, type) {
  const name = safeString(filename).trim();
  if (!name) return undefined;
  const fallback = name.replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(name);
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

async function streamOssObject({ req, res, next, client, objectKey }) {
  try {
    const key = normalizeObjectKey(objectKey);
    if (!key) return res.status(400).json({ message: 'invalid key' });

    // HEAD for metadata (content-type/length)
    let head = null;
    try {
      head = await client.head(key);
    } catch (e) {
      // ignore; we'll still try getStream and let it error properly
    }

    const headers = head?.res?.headers || {};
    const contentType = headers['content-type'] || 'application/octet-stream';
    const contentLength = headers['content-length'];

    const download = String(req.query.download || '').toLowerCase();
    const isDownload = download === '1' || download === 'true';
    const dispositionType = isDownload ? 'attachment' : 'inline';
    const cd = contentDisposition(req.query.name, dispositionType);

    res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (cd) res.setHeader('Content-Disposition', cd);
    // keep private: access is via authenticated backend
    res.setHeader('Cache-Control', 'private, max-age=3600');

    const result = await client.getStream(key);
    result.stream.on('error', (err) => next(err));
    result.stream.pipe(res);
  } catch (err) {
    // ali-oss errors often include status/message
    const status = err?.status || err?.statusCode;
    if (status === 404) return res.status(404).json({ message: 'file not found' });
    if (status === 403) return res.status(403).json({ message: 'access denied' });
    return next(err);
  }
}

// /api/oss/fault-cases?key=...&name=...&download=1
async function proxyFaultCases(req, res, next) {
  const {
    getOssClient,
    OSS_PREFIX,
    TMP_PREFIX
  } = require('../config/faultCaseStorage');

  const key = normalizeObjectKey(req.query.key);
  const allowed = [OSS_PREFIX, TMP_PREFIX];
  if (!isAllowedKey(key, allowed)) return res.status(403).json({ message: 'invalid key scope' });

  const client = await getOssClient();
  if (!client) return res.status(500).json({ message: 'OSS client not available' });
  return streamOssObject({ req, res, next, client, objectKey: key });
}

// /api/oss/tech-solution?key=...&name=...&download=1
async function proxyTechSolution(req, res, next) {
  const {
    getOssClient,
    OSS_PREFIX,
    TMP_PREFIX
  } = require('../config/techSolutionStorage');

  const key = normalizeObjectKey(req.query.key);
  const allowed = [OSS_PREFIX, TMP_PREFIX];
  if (!isAllowedKey(key, allowed)) return res.status(403).json({ message: 'invalid key scope' });

  const client = await getOssClient();
  if (!client) return res.status(500).json({ message: 'OSS client not available' });
  return streamOssObject({ req, res, next, client, objectKey: key });
}

// Extract objectKey from a full OSS URL (useful for historical data that stored internal URLs)
function objectKeyFromUrl(maybeUrl) {
  const s = safeString(maybeUrl).trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    const p = (u.pathname || '').replace(/^\//, '');
    return normalizeObjectKey(p);
  } catch (_) {
    return '';
  }
}

module.exports = {
  normalizeObjectKey,
  objectKeyFromUrl,
  proxyFaultCases,
  proxyTechSolution
};


