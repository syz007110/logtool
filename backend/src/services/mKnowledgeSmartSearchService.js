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

function shouldUseMKnowledgeForIntent(intent) {
  return SUPPORTED_INTENTS.has(String(intent || '').trim());
}

function mapMKnowledgeHitsToKbDocs(payload, { limit = DEFAULT_KB_LIMIT } = {}) {
  const safeLimit = clampLimit(limit);
  const hits = Array.isArray(payload?.hits) ? payload.hits : [];
  return hits.slice(0, safeLimit).map((item, index) => ({
    ref: String(item?.ref || `K${index + 1}`),
    title: String(item?.title || item?.fileName || ''),
    headingPath: String(item?.headingPath || ''),
    snippet: String(item?.snippet || item?.content || ''),
    sourceRef: item?.sourceRef || null,
    assets: Array.isArray(item?.assets) ? item.assets : []
  }));
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
  limit = DEFAULT_KB_LIMIT
} = {}) {
  const safeLimit = clampLimit(limit);
  const normalizedKeywords = normalizeKeywords(keywords);
  const safeQuery = String(query || '').trim() || normalizedKeywords.join(' ');
  return {
    collectionId,
    query: safeQuery,
    keywords: normalizedKeywords,
    esTopK: safeLimit,
    vecTopK: safeLimit,
    fuseTopK: safeLimit
  };
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
        } catch (_) {}
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

async function searchMKnowledgeForKbIntent({
  token = '',
  query = '',
  keywords = [],
  limit = DEFAULT_KB_LIMIT
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
  const timeoutMs = Number.parseInt(String(process.env.MKNOWLEDGE_TIMEOUT_MS || '10000'), 10) || 10000;
  const requestBody = buildMKnowledgeSearchBody({
    collectionId,
    query,
    keywords,
    limit: safeLimit
  });
  if (!requestBody.query) {
    return {
      ok: true,
      items: [],
      debug: { skipped: true, reason: 'empty_query' }
    };
  }

  try {
    const response = await requestJson({
      url: `${baseUrl}/api/kb/retrieval/search`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: requestBody,
      timeoutMs
    });

    return {
      ok: true,
      items: mapMKnowledgeHitsToKbDocs(response?.json, { limit: safeLimit }),
      raw: response?.json || null
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
  searchMKnowledgeForKbIntent
};

