const http = require('http');
const https = require('https');
const { URL } = require('url');

const DEFAULT_KB_LIMIT = 5;
const SUPPORTED_INTENTS = new Set(['definition', 'how_to_use']);

function clampLimit(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_KB_LIMIT;
  return Math.min(5, Math.max(1, parsed));
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '');
}

/** Prefer dedicated MKnowledge JWT when logtool users are not valid on MKnowledge. */
function resolveMKnowledgeAuthToken(incomingBearer = '') {
  const fixed = String(process.env.MKNOWLEDGE_BEARER_TOKEN || '').trim();
  if (fixed) return fixed;
  return String(incomingBearer || '').trim();
}

function shouldUseMKnowledgeForIntent(intent) {
  return SUPPORTED_INTENTS.has(String(intent || '').trim());
}

function sanitizeKbAssetForClient(asset) {
  if (!asset || typeof asset !== 'object') return null;
  const id = Number(asset.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    id,
    assetType: String(asset.assetType || ''),
    mimeType: String(asset.mimeType || ''),
    sourceRef: asset.sourceRef != null ? String(asset.sourceRef) : ''
  };
}

function mapMKnowledgeHitsToKbDocs(payload, { limit = DEFAULT_KB_LIMIT } = {}) {
  const safeLimit = clampLimit(limit);
  const hits = Array.isArray(payload?.hits) ? payload.hits : [];
  return hits.slice(0, safeLimit).map((item, index) => {
    const sourceRef = item?.sourceRef && typeof item.sourceRef === 'object' ? item.sourceRef : null;
    const fileId = Number(sourceRef?.fileId);
    const rawAssets = Array.isArray(item?.assets) ? item.assets : [];
    const assets = rawAssets.map(sanitizeKbAssetForClient).filter(Boolean);
    return {
      ref: String(item?.ref || `K${index + 1}`),
      title: String(item?.title || item?.fileName || ''),
      headingPath: String(item?.headingPath || ''),
      snippet: String(item?.snippet || item?.content || ''),
      sourceRef,
      fileId: Number.isFinite(fileId) && fileId > 0 ? fileId : null,
      chunkId: item?.chunkId != null ? String(item.chunkId) : '',
      chunkNo: Number(item?.chunkNo) || 0,
      assets
    };
  });
}

function normalizeKeywords(keywords = []) {
  if (!Array.isArray(keywords)) return [];
  return keywords
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function buildMKnowledgeSearchBody({
  collectionId,
  query = '',
  keywords = [],
  limit = DEFAULT_KB_LIMIT,
  generate = false
} = {}) {
  const safeLimit = clampLimit(limit);
  const normalizedKeywords = normalizeKeywords(keywords);
  const safeQuery = String(query || '').trim() || normalizedKeywords.join(' ');
  const body = {
    collectionId,
    query: safeQuery,
    keywords: normalizedKeywords,
    esTopK: safeLimit,
    vecTopK: safeLimit,
    fuseTopK: safeLimit
  };
  if (generate) {
    body.generate = true;
  }
  return body;
}

function requestJson({ url, method = 'POST', headers = {}, body = null, timeoutMs = 10000 }) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;
    const payload = body ? JSON.stringify(body) : '';

    const req = transport.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: `${parsed.pathname}${parsed.search}`,
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers
      }
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = raw ? JSON.parse(raw) : null;
        } catch (_) { }
        const status = Number(res.statusCode || 0);
        if (status >= 200 && status < 300) {
          return resolve({ status, json });
        }
        const err = new Error(`mknowledge_request_failed:${status}`);
        err.status = status;
        err.body = json || raw;
        return reject(err);
      });
    });

    req.on('error', (error) => reject(error));
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('mknowledge_timeout'));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function fetchMKnowledgeAssetBuffer({
  token = '',
  fileId,
  assetId,
  timeoutMs = 60000
} = {}) {
  const authToken = resolveMKnowledgeAuthToken(token);
  const baseUrl = normalizeBaseUrl(process.env.MKNOWLEDGE_BASE_URL || '');
  if (!baseUrl) {
    const err = new Error('mknowledge_base_url_missing');
    err.status = 503;
    throw err;
  }
  const fid = Number(fileId);
  const aid = Number(assetId);
  if (!Number.isFinite(fid) || fid <= 0 || !Number.isFinite(aid) || aid <= 0) {
    const err = new Error('invalid_file_or_asset_id');
    err.status = 400;
    throw err;
  }
  const url = new URL(`${baseUrl}/api/kb/files/${fid}/assets/${aid}`);

  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;
    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: '*/*'
        }
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const status = Number(res.statusCode || 0);
          if (status >= 200 && status < 300) {
            return resolve({
              buffer,
              contentType: String(res.headers['content-type'] || 'application/octet-stream')
            });
          }
          const err = new Error(`mknowledge_asset_failed:${status}`);
          err.status = status;
          return reject(err);
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('mknowledge_asset_timeout'));
    });
    req.end();
  });
}

async function searchMKnowledgeForKbIntent({
  token = '',
  query = '',
  keywords = [],
  limit = DEFAULT_KB_LIMIT,
  generate = false
} = {}) {
  const baseUrl = normalizeBaseUrl(process.env.MKNOWLEDGE_BASE_URL || '');
  if (!baseUrl) {
    return {
      ok: false,
      items: [],
      error: { code: 'mknowledge_base_url_missing', message: 'MKNOWLEDGE_BASE_URL 未配置' }
    };
  }

  const safeLimit = clampLimit(limit);
  const collectionId = Number.parseInt(String(process.env.SMART_SEARCH_KB_COLLECTION_ID || '1'), 10) || 1;
  // ES/向量融合检索常超过 10s（冷启动、大库）；默认放宽，可用 MKNOWLEDGE_TIMEOUT_MS 覆盖
  const timeoutMs = Number.parseInt(String(process.env.MKNOWLEDGE_TIMEOUT_MS || '60000'), 10) || 60000;
  const requestBody = buildMKnowledgeSearchBody({
    collectionId,
    query,
    keywords,
    limit: safeLimit,
    generate
  });
  if (!requestBody.query) {
    return {
      ok: true,
      items: [],
      generation: null,
      debug: { skipped: true, reason: 'empty_query' }
    };
  }

  const chatTimeout = Number.parseInt(
    String(process.env.MKNOWLEDGE_CHAT_TIMEOUT_MS || process.env.MKNOWLEDGE_TIMEOUT_MS || '120000'),
    10
  ) || 120000;
  const effectiveTimeout = generate ? Math.max(timeoutMs, chatTimeout) : timeoutMs;

  const authToken = resolveMKnowledgeAuthToken(token);

  try {
    const response = await requestJson({
      url: `${baseUrl}/api/kb/retrieval/search`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`
      },
      body: requestBody,
      timeoutMs: effectiveTimeout
    });

    const json = response?.json || null;
    const generation = json?.generation && typeof json.generation === 'object' ? json.generation : null;

    return {
      ok: true,
      items: mapMKnowledgeHitsToKbDocs(json, { limit: safeLimit }),
      generation,
      raw: json
    };
  } catch (error) {
    return {
      ok: false,
      items: [],
      error: {
        code: error?.message || 'mknowledge_request_error',
        status: Number(error?.status || 0) || null,
        message: String(error?.body?.message || error?.message || error)
      }
    };
  }
}

module.exports = {
  DEFAULT_KB_LIMIT,
  shouldUseMKnowledgeForIntent,
  mapMKnowledgeHitsToKbDocs,
  buildMKnowledgeSearchBody,
  searchMKnowledgeForKbIntent,
  fetchMKnowledgeAssetBuffer,
  sanitizeKbAssetForClient,
  resolveMKnowledgeAuthToken
};

