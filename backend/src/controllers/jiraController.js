const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { getJiraConfig, searchIssues, getIssue, downloadJiraAttachmentToFile } = require('../services/jiraService');
const { connectMongo, isMongoConnected } = require('../config/mongodb');
const FaultCase = require('../mongoModels/FaultCase');
const { normalizePagination, MAX_PAGE_SIZE } = require('../constants/pagination');

const {
  STORAGE,
  TMP_DIR,
  MAX_FILES,
  MAX_FILE_SIZE,
  ALLOWED_MIMES,
  ensureTempDir,
  getOssClient,
  buildOssUrl,
  buildTempOssObjectKey,
  buildTempLocalUrl
} = require('../config/faultCaseStorage');

function safeUnlink(p) {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
  } catch (_) {}
}

function safeFilename(name, fallback = 'file') {
  const base = path.basename(String(name || '').trim() || fallback);
  return base.replace(/[\r\n"]/g, '_');
}

function getBearerToken(req) {
  const raw = req?.headers?.authorization || req?.get?.('authorization') || '';
  const parts = String(raw).split(' ');
  if (parts.length === 2 && /^bearer$/i.test(parts[0])) return parts[1];
  return '';
}

function withQueryToken(urlStr, req) {
  const token = getBearerToken(req);
  if (!token) return urlStr;
  if (!urlStr || !String(urlStr).includes('/api/oss/')) return urlStr;
  if (String(urlStr).includes('token=')) return urlStr;
  const sep = String(urlStr).includes('?') ? '&' : '?';
  return `${urlStr}${sep}token=${encodeURIComponent(token)}`;
}

function buildJiraAuthHeaders(cfg) {
  const headers = {};
  if (!cfg || !cfg.enabled) return headers;
  if (cfg.authType === 'basic') {
    const raw = `${cfg.username}:${cfg.apiToken}`;
    const token = Buffer.from(raw, 'utf8').toString('base64');
    headers.Authorization = `Basic ${token}`;
  } else if (cfg.authType === 'bearer') {
    headers.Authorization = `Bearer ${cfg.bearerToken}`;
  }
  return headers;
}

function isPrivateHost(hostname) {
  const h = String(hostname || '').trim().toLowerCase();
  if (!h) return true;
  if (h === 'localhost' || h === '::1') return true;
  if (h.endsWith('.local') || h.endsWith('.internal')) return true;

  // IPv4 private ranges (best-effort, without DNS resolve)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const [a, b] = h.split('.').map((x) => Number.parseInt(x, 10));
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
  }
  return false;
}

async function proxyStreamWithRedirects(startUrl, res, { headers, timeoutMs, maxBytes } = {}) {
  const MAX_REDIRECTS = 5;
  let redirects = 0;

  const doOnce = (currentUrl) => new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(String(currentUrl || '').trim());
    } catch (e) {
      return reject(new Error('Invalid url'));
    }
    const isHttps = parsed.protocol === 'https:';
    const client = isHttps ? https : http;

    const req = client.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port,
      path: `${parsed.pathname}${parsed.search || ''}`,
      method: 'GET',
      headers: headers || {}
    }, (up) => {
      const status = up.statusCode || 0;

      if ([301, 302, 303, 307, 308].includes(status) && up.headers.location && redirects < MAX_REDIRECTS) {
        redirects += 1;
        const nextUrl = new URL(up.headers.location, parsed).toString();
        up.resume();
        return resolve({ redirect: true, nextUrl });
      }

      if (status < 200 || status >= 300) {
        up.resume();
        const err = new Error(`Upstream failed: ${status}`);
        err.status = status;
        return reject(err);
      }

      const len = Number.parseInt(up.headers['content-length'] || '0', 10) || 0;
      if (maxBytes && len && len > maxBytes) {
        up.resume();
        const err = new Error(`File too large: ${len}`);
        err.status = 413;
        return reject(err);
      }

      const passthrough = ['content-type', 'content-length', 'cache-control', 'etag', 'last-modified'];
      for (const h of passthrough) {
        if (up.headers[h]) res.setHeader(h, up.headers[h]);
      }
      if (!res.getHeader('cache-control')) {
        res.setHeader('cache-control', 'private, max-age=300');
      }

      res.status(status);

      let received = 0;
      up.on('data', (chunk) => {
        received += chunk.length;
        if (maxBytes && received > maxBytes) {
          try { req.destroy(new Error('File too large')); } catch (_) {}
        }
      });
      up.on('error', (e) => reject(e));
      up.on('end', () => resolve({ redirect: false }));
      up.pipe(res);
    });

    req.on('error', (e) => reject(e));
    req.setTimeout(timeoutMs || 8000, () => {
      try { req.destroy(new Error('Request timeout')); } catch (_) {}
      const err = new Error('Proxy timeout');
      err.code = 'ETIMEDOUT';
      reject(err);
    });
    req.end();
  });

  let current = String(startUrl || '').trim();
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const r = await doOnce(current);
    if (!r?.redirect) return;
    const next = String(r.nextUrl || '');
    const nextParsed = new URL(next);
    if (isPrivateHost(nextParsed.hostname)) {
      const err = new Error('Forbidden redirect host');
      err.status = 403;
      throw err;
    }
    current = next;
  }
}

async function ensureMongoReady() {
  await connectMongo();
  return isMongoConnected();
}

function parseKeywords(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean);
  return String(val)
    .split(/[,，\n\r\t ]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function safeDateMs(d) {
  if (!d) return 0;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : 0;
}

async function searchJiraIssues(req, res) {
  const cfg = getJiraConfig();
  const q = (req.query.q || req.query.keyword || '').toString().trim();

  // Prefer page+limit (same style as logs), fallback to Jira native startAt/maxResults
  const pageParam = req.query.page || (req.query.maxResults ? undefined : '1');
  const limitParam = req.query.limit || req.query.maxResults || '10';
  const { page, limit } = normalizePagination(pageParam, limitParam, MAX_PAGE_SIZE.JIRA);
  const startAt = req.query.startAt !== undefined ? Number.parseInt(req.query.startAt || '0', 10) || 0 : undefined;
  const maxResults = req.query.maxResults !== undefined ? Number.parseInt(req.query.maxResults || '10', 10) || 10 : undefined;

  // 如果未启用，直接返回（前端用于隐藏/提示）
  if (!cfg.enabled) {
    return res.json({
      ok: true,
      enabled: false,
      issues: [],
      items: [],
      total: 0,
      page: 1,
      limit: 0,
      startAt: 0,
      maxResults: 0,
      message: 'Jira integration is not configured'
    });
  }

  // 输入校验：为了避免JQL注入/超长请求
  if (q && q.length > 200) {
    return res.json({
      ok: false,
      enabled: true,
      issues: [],
      items: [],
      total: 0,
      page: 1,
      limit: 0,
      startAt: 0,
      maxResults: 0,
      message: '关键词过长（最多200字符）'
    });
  }

  // 筛选参数
  const modules = req.query.modules ? (Array.isArray(req.query.modules) ? req.query.modules : [req.query.modules]) : undefined;
  const statuses = req.query.statuses ? (Array.isArray(req.query.statuses) ? req.query.statuses : [req.query.statuses]) : undefined;
  const updatedFrom = req.query.updatedFrom || req.query.updated_from;
  const updatedTo = req.query.updatedTo || req.query.updated_to;

  try {
    const resp = await searchIssues({
      q,
      page,
      limit,
      startAt,
      maxResults,
      modules,
      statuses,
      updatedFrom,
      updatedTo
    });
    return res.json(resp);
  } catch (err) {
    console.warn('[jira] search failed:', err?.status || err?.code || '', err?.message || err);
    
    // 根据错误类型提供更明确的提示
    let message = 'Jira 搜索失败';
    const errCode = err?.code || '';
    const errMessage = String(err?.message || '').toLowerCase();
    
    // 网络连接错误（通常是没连 VPN 或无法访问 JIRA 服务器）
    if (errCode === 'ECONNREFUSED' || errCode === 'ENOTFOUND' || errCode === 'EHOSTUNREACH' || 
        errCode === 'ETIMEDOUT' || errMessage.includes('timeout') || errMessage.includes('connect') ||
        errMessage.includes('refused') || errMessage.includes('not found')) {
      message = '无法连接到 JIRA 服务器（请检查 VPN 连接或网络配置）';
    } else if (err?.status === 401 || err?.status === 403) {
      message = 'JIRA 认证失败（请检查 API Token 或权限配置）';
    } else if (err?.status >= 400 && err?.status < 500) {
      message = `JIRA 请求失败（错误代码: ${err.status}）`;
    } else if (err?.status >= 500) {
      message = 'JIRA 服务器错误，请稍后重试';
    } else {
      message = 'Jira 搜索失败（请检查后端配置、网络或权限）';
    }
    
    return res.json({
      ok: false,
      enabled: true,
      issues: [],
      items: [],
      total: 0,
      page: Math.max(page, 1),
      limit: Math.min(Math.max(limit, 1), 50),
      startAt: 0,
      maxResults: 0,
      message
    });
  }
}

// Mixed search: Jira issues + Mongo fault cases in one list (sorted by updated desc, backend pagination)
async function searchJiraIssuesMixed(req, res) {
  const { runJiraMongoMixedSearch } = require('../services/jiraMixedSearchService');
  const resp = await runJiraMongoMixedSearch({
    user: req.user,
    q: req.query.q || req.query.keyword || '',
    page: req.query.page,
    limit: req.query.limit,
    jiraWindow: req.query.jiraWindow,
    source: req.query.source,
    modules: req.query.modules,
    moduleKeys: req.query.moduleKeys,
    statusKeys: req.query.statusKeys,
    updatedFrom: req.query.updatedFrom || req.query.updated_from,
    updatedTo: req.query.updatedTo || req.query.updated_to,
    mine: req.query.mine
  });
  return res.json(resp);
}

module.exports = {
  searchJiraIssues,
  searchJiraIssuesMixed,
  getJiraIssue: async (req, res) => {
    const cfg = getJiraConfig();
    if (!cfg.enabled) {
      return res.json({ ok: true, enabled: false, issue: null, message: 'Jira integration is not configured' });
    }
    try {
      const key = (req.params.key || '').toString().trim();
      const resp = await getIssue(key);
      return res.json(resp);
    } catch (err) {
      console.warn('[jira] get issue failed:', err?.status || err?.code || '', err?.message || err);
      
      // 根据错误类型提供更明确的提示
      let message = 'Jira 获取详情失败';
      const errCode = err?.code || '';
      const errMessage = String(err?.message || '').toLowerCase();
      
      // 网络连接错误（通常是没连 VPN 或无法访问 JIRA 服务器）
      if (errCode === 'ECONNREFUSED' || errCode === 'ENOTFOUND' || errCode === 'EHOSTUNREACH' || 
          errCode === 'ETIMEDOUT' || errMessage.includes('timeout') || errMessage.includes('connect') ||
          errMessage.includes('refused') || errMessage.includes('not found')) {
        message = '无法连接到 JIRA 服务器（请检查 VPN 连接或网络配置）';
      } else if (err?.status === 401 || err?.status === 403) {
        message = 'JIRA 认证失败（请检查 API Token 或权限配置）';
      } else if (err?.status === 404) {
        message = 'JIRA Issue 不存在或无权访问';
      } else if (err?.status >= 400 && err?.status < 500) {
        message = `JIRA 请求失败（错误代码: ${err.status}）`;
      } else if (err?.status >= 500) {
        message = 'JIRA 服务器错误，请稍后重试';
      } else {
        message = 'Jira 获取详情失败（请检查后端配置、网络或权限）';
      }
      
      return res.json({ ok: false, enabled: true, issue: null, message });
    }
  },
  // Stream Jira attachment via backend so browser can render images without Jira CORS/auth.
  // Only allow proxying urls that start with JIRA_BASE_URL (first hop), then allow redirects to public hosts.
  proxyJiraAttachment: async (req, res) => {
    const cfg = getJiraConfig();
    if (!cfg.enabled) {
      return res.status(400).json({ message: 'Jira integration is not configured' });
    }

    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl) return res.status(400).json({ message: 'url required' });

    let parsed;
    let base;
    try {
      parsed = new URL(rawUrl);
      base = new URL(cfg.baseUrl);
    } catch (_) {
      return res.status(400).json({ message: 'invalid url' });
    }

    if (!/^https?:$/.test(parsed.protocol)) return res.status(400).json({ message: 'invalid protocol' });

    // first hop must be Jira base host (avoid open proxy / SSRF)
    if (String(parsed.hostname).toLowerCase() !== String(base.hostname).toLowerCase()) {
      return res.status(403).json({ message: 'forbidden url host' });
    }

    try {
      const headers = buildJiraAuthHeaders(cfg);
      if (req.headers.range) headers.Range = req.headers.range;
      const maxBytes = Number.isFinite(Number(MAX_FILE_SIZE)) ? Number(MAX_FILE_SIZE) : (50 * 1024 * 1024);
      await proxyStreamWithRedirects(rawUrl, res, { headers, timeoutMs: cfg.timeoutMs, maxBytes });
    } catch (err) {
      const status = err?.status || err?.statusCode || 500;
      const message = err?.message || 'proxy failed';
      console.warn('[jira] proxy attachment failed:', status, message);
      if (!res.headersSent) return res.status(status).json({ message });
    }
  },
  // Preview Jira issue attachments by downloading them into fault-case temp storage.
  // This avoids browser CORS/auth issues when directly using Jira attachment URLs.
  previewJiraIssueAttachments: async (req, res) => {
    const cfg = getJiraConfig();
    if (!cfg.enabled) {
      return res.status(400).json({ message: 'Jira integration is not configured' });
    }
    const key = (req.params.key || '').toString().trim();
    if (!key) return res.status(400).json({ message: 'issue key required' });

    try {
      const issueResp = await getIssue(key);
      const issue = issueResp?.issue || null;
      const list = Array.isArray(issue?.attachments) ? issue.attachments : [];
      if (!list.length) return res.json({ success: true, files: [] });

      const previewFiles = [];
      const limited = list.slice(0, MAX_FILES);

      for (const att of limited) {
        const originalName = safeFilename(att?.filename || 'file');
        const mimeType = String(att?.mimeType || '').trim();
        const size = Number.isFinite(Number(att?.size)) ? Number(att.size) : 0;

        if (size && size > MAX_FILE_SIZE) continue;
        if (ALLOWED_MIMES.length && mimeType && !ALLOWED_MIMES.includes(mimeType)) continue;

        const contentUrl = String(att?.content || '').trim();
        if (!contentUrl) continue;

        const tmpLocalDir = ensureTempDir();
        const localTmpName = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}-${originalName}`;
        const localTmpPath = path.resolve(tmpLocalDir, localTmpName);

        try {
          await downloadJiraAttachmentToFile(contentUrl, localTmpPath, { maxBytes: MAX_FILE_SIZE });

          if (STORAGE === 'oss') {
            const client = await getOssClient();
            const objectKey = buildTempOssObjectKey(localTmpName);
            await client.put(objectKey, localTmpPath);
            safeUnlink(localTmpPath);
            previewFiles.push({
              storage: 'oss',
              object_key: objectKey,
              filename: localTmpName,
              original_name: originalName,
              mime_type: mimeType,
              size_bytes: size || undefined,
              url: withQueryToken(buildOssUrl(objectKey), req)
            });
          } else {
            previewFiles.push({
              storage: 'local',
              object_key: `tmp/${localTmpName}`,
              filename: localTmpName,
              original_name: originalName,
              mime_type: mimeType,
              size_bytes: size || undefined,
              url: buildTempLocalUrl(localTmpName)
            });
          }
        } catch (e) {
          safeUnlink(localTmpPath);
        }
      }

      return res.json({ success: true, files: previewFiles });
    } catch (err) {
      console.warn('[jira] preview attachments failed:', err?.status || err?.code || '', err?.message || err);
      return res.status(500).json({ message: '预览JIRA附件失败', error: err.message });
    }
  },
  // Import Jira issue attachments into fault-case temp storage and return object_key list for form usage.
  importJiraIssueAttachments: async (req, res) => {
    const cfg = getJiraConfig();
    if (!cfg.enabled) {
      return res.status(400).json({ message: 'Jira integration is not configured' });
    }
    const key = (req.params.key || '').toString().trim();
    if (!key) return res.status(400).json({ message: 'issue key required' });

    try {
      const issueResp = await getIssue(key);
      const issue = issueResp?.issue || null;
      const list = Array.isArray(issue?.attachments) ? issue.attachments : [];
      if (!list.length) return res.json({ success: true, files: [] });

      const imported = [];
      const limited = list.slice(0, MAX_FILES);

      for (const att of limited) {
        const originalName = safeFilename(att?.filename || 'file');
        const mimeType = String(att?.mimeType || '').trim();
        const size = Number.isFinite(Number(att?.size)) ? Number(att.size) : 0;

        if (size && size > MAX_FILE_SIZE) {
          // skip oversized
          continue;
        }
        if (ALLOWED_MIMES.length && mimeType && !ALLOWED_MIMES.includes(mimeType)) {
          // skip unsupported mime
          continue;
        }

        const contentUrl = String(att?.content || '').trim();
        if (!contentUrl) continue;

        const tmpLocalDir = ensureTempDir();
        const localTmpName = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}-${originalName}`;
        const localTmpPath = path.resolve(tmpLocalDir, localTmpName);

        try {
          await downloadJiraAttachmentToFile(contentUrl, localTmpPath, { maxBytes: MAX_FILE_SIZE });

          if (STORAGE === 'oss') {
            const client = await getOssClient();
            const objectKey = buildTempOssObjectKey(localTmpName);
            await client.put(objectKey, localTmpPath);
            safeUnlink(localTmpPath);
            imported.push({
              storage: 'oss',
              object_key: objectKey,
              filename: localTmpName,
              original_name: originalName,
              mime_type: mimeType,
              size_bytes: size || undefined,
              url: withQueryToken(buildOssUrl(objectKey), req)
            });
          } else {
            // local: keep in TMP_DIR
            imported.push({
              storage: 'local',
              object_key: `tmp/${localTmpName}`,
              filename: localTmpName,
              original_name: originalName,
              mime_type: mimeType,
              size_bytes: size || undefined,
              url: buildTempLocalUrl(localTmpName)
            });
          }
        } catch (e) {
          safeUnlink(localTmpPath);
          // skip failed attachment
        }
      }

      return res.json({ success: true, files: imported });
    } catch (err) {
      console.warn('[jira] import attachments failed:', err?.status || err?.code || '', err?.message || err);
      return res.status(500).json({ message: '导入JIRA附件失败', error: err.message });
    }
  }
};


