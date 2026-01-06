const http = require('http');
const https = require('https');
const url = require('url');

function normalizeBaseUrl(baseUrl) {
  const s = String(baseUrl || '').trim();
  if (!s) return '';
  return s.replace(/\/+$/, '');
}

function getJiraConfig() {
  const baseUrl = normalizeBaseUrl(process.env.JIRA_BASE_URL);
  const apiVersion = String(process.env.JIRA_API_VERSION || '3').trim() || '3';
  const authType = String(process.env.JIRA_AUTH_TYPE || 'basic').trim().toLowerCase(); // basic | bearer

  const username = String(process.env.JIRA_USERNAME || '').trim(); // cloud: email
  // Cloud: API token; DC/Server: can be password if Basic Auth is enabled.
  const apiToken = String(process.env.JIRA_API_TOKEN || process.env.JIRA_PASSWORD || '').trim();
  const bearerToken = String(process.env.JIRA_BEARER_TOKEN || '').trim(); // dc/server: PAT etc

  const projectKeys = String(process.env.JIRA_PROJECT_KEYS || '')
    .split(/[,，\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);

  const timeoutMs = Number.parseInt(process.env.JIRA_TIMEOUT_MS || '8000', 10) || 8000;
  const maxResultsDefault = Math.min(Number.parseInt(process.env.JIRA_MAX_RESULTS || '10', 10) || 10, 50);

  const enabled = !!baseUrl && (
    (authType === 'basic' && username && apiToken) ||
    (authType === 'bearer' && bearerToken)
  );

  return {
    enabled,
    baseUrl,
    apiVersion,
    authType,
    username,
    apiToken,
    bearerToken,
    projectKeys,
    timeoutMs,
    maxResultsDefault
  };
}

function escapeJqlText(input) {
  // Minimal escaping for JQL quoted string
  return String(input || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function buildJql(q, projectKeys = [], filters = {}) {
  const kw = escapeJqlText(q);
  if (!kw) return '';

  const clauses = [];
  
  // Use Jira full-text search. This matches summary/description/comments depending on Jira config.
  clauses.push(`text ~ "${kw}"`);
  
  // 项目筛选
  if (Array.isArray(projectKeys) && projectKeys.length) {
    const proj = projectKeys.map((k) => `"${escapeJqlText(k)}"`).join(', ');
    clauses.push(`project in (${proj})`);
  }
  
  // 组件（模块）筛选
  if (filters.modules && Array.isArray(filters.modules) && filters.modules.length > 0) {
    const modules = filters.modules.map((m) => `"${escapeJqlText(m)}"`).join(', ');
    clauses.push(`component in (${modules})`);
  }
  
  // 状态筛选
  if (filters.statuses && Array.isArray(filters.statuses) && filters.statuses.length > 0) {
    const statuses = filters.statuses.map((s) => `"${escapeJqlText(s)}"`).join(', ');
    clauses.push(`status in (${statuses})`);
  }
  
  // 更新日期范围筛选
  if (filters.updatedFrom) {
    // JQL 日期格式：yyyy-MM-dd 或 yyyy-MM-dd HH:mm
    // ISO 8601 格式转换（如：2024-01-01T00:00:00.000Z -> 2024-01-01）
    try {
      const fromDate = new Date(filters.updatedFrom);
      if (!isNaN(fromDate.getTime())) {
        const year = fromDate.getUTCFullYear();
        const month = String(fromDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(fromDate.getUTCDate()).padStart(2, '0');
        const jqlDate = `${year}-${month}-${day}`;
        clauses.push(`updated >= "${jqlDate}"`);
      }
    } catch (e) {
      // 如果日期解析失败，跳过该筛选条件
    }
  }
  if (filters.updatedTo) {
    try {
      const toDate = new Date(filters.updatedTo);
      if (!isNaN(toDate.getTime())) {
        const year = toDate.getUTCFullYear();
        const month = String(toDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(toDate.getUTCDate()).padStart(2, '0');
        const jqlDate = `${year}-${month}-${day}`;
        clauses.push(`updated <= "${jqlDate}"`);
      }
    } catch (e) {
      // 如果日期解析失败，跳过该筛选条件
    }
  }
  
  return `${clauses.join(' AND ')} ORDER BY updated DESC`;
}

function buildTextClausesOr(terms) {
  const list = Array.isArray(terms) ? terms : [];
  const parts = [];
  for (const t of list) {
    const v = escapeJqlText(t);
    if (!v) continue;
    parts.push(`text ~ "${v}"`);
  }
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0];
  return `(${parts.join(' OR ')})`;
}

/**
 * SmartSearch v2: compile a safe JQL from a structured QueryPlan.
 * - Only whitelisted clauses are generated (no raw JQL from LLM).
 * - Symptom/trigger are treated as two must-groups: (symptom OR ...) AND (trigger OR ...)
 * - faultTypes are added as a must-group against text.
 * - neg terms are added as text !~ "..."
 * - updated is restricted by days: updated >= -Nd
 */
function buildJqlFromQueryPlan(plan, projectKeys = [], filters = {}) {
  const p = plan && typeof plan === 'object' ? plan : {};
  const symptom = Array.isArray(p.symptom) ? p.symptom : [];
  const trigger = Array.isArray(p.trigger) ? p.trigger : [];
  const faultCodes = Array.isArray(p.fault_codes) ? p.fault_codes : [];
  const neg = Array.isArray(p.neg) ? p.neg : [];
  const days = Number.isFinite(Number(p.days)) ? Math.floor(Number(p.days)) : null;

  const clauses = [];

  const symptomClause = buildTextClausesOr(symptom);
  const triggerClause = buildTextClausesOr(trigger);
  if (symptomClause && triggerClause) clauses.push(`(${symptomClause} AND ${triggerClause})`);
  else if (symptomClause) clauses.push(symptomClause);
  else if (triggerClause) clauses.push(triggerClause);

  // fault code must: also search without 0X prefix to improve recall
  const faultTerms = [];
  for (const c of faultCodes) {
    const raw = String(c || '').trim().toUpperCase();
    if (!raw) continue;
    faultTerms.push(raw);
    if (raw.startsWith('0X')) faultTerms.push(raw.slice(2));
  }
  const faultClause = buildTextClausesOr(faultTerms);
  if (faultClause) clauses.push(faultClause);

  for (const n of neg) {
    const v = escapeJqlText(n);
    if (!v) continue;
    clauses.push(`text !~ "${v}"`);
  }

  // 项目筛选（白名单：由后端配置提供）
  if (Array.isArray(projectKeys) && projectKeys.length) {
    const proj = projectKeys.map((k) => `"${escapeJqlText(k)}"`).join(', ');
    clauses.push(`project in (${proj})`);
  }

  // 组件（模块）筛选
  if (filters.modules && Array.isArray(filters.modules) && filters.modules.length > 0) {
    const modules = filters.modules.map((m) => `"${escapeJqlText(m)}"`).join(', ');
    clauses.push(`component in (${modules})`);
  }

  // 状态筛选
  if (filters.statuses && Array.isArray(filters.statuses) && filters.statuses.length > 0) {
    const statuses = filters.statuses.map((s) => `"${escapeJqlText(s)}"`).join(', ');
    clauses.push(`status in (${statuses})`);
  }

  if (Number.isFinite(days) && days > 0) {
    const d = Math.min(Math.max(days, 1), 3650);
    clauses.push(`updated >= -${d}d`);
  }

  const core = clauses.filter(Boolean).join(' AND ');
  return core ? `${core} ORDER BY updated DESC` : '';
}

function doJsonRequest({ method, endpoint, pathName, headers, body, timeoutMs }) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = url.parse(endpoint);
      const isHttps = parsed.protocol === 'https:';
      const client = isHttps ? https : http;

      const fullPath = (parsed.pathname ? parsed.pathname.replace(/\/$/, '') : '') + pathName;
      const payload = body ? JSON.stringify(body) : '';

      const req = client.request({
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        path: fullPath,
        method,
        headers: Object.assign(
          {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          headers || {},
          payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}
        )
      }, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let json = null;
          try { json = data ? JSON.parse(data) : null; } catch (_) {}
          const status = res.statusCode || 0;
          if (status >= 200 && status < 300) return resolve({ status, json });
          const err = new Error(`Jira request failed: ${status}`);
          err.status = status;
          err.body = json || data;
          return reject(err);
        });
      });

      req.on('error', (err) => reject(err));
      req.setTimeout(timeoutMs || 8000, () => {
        try { req.destroy(new Error('Request timeout')); } catch (_) {}
        const err = new Error('Jira request timeout');
        err.code = 'ETIMEDOUT';
        reject(err);
      });

      if (payload) req.write(payload);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

function buildQueryString(params) {
  const pairs = [];
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) {
      v.forEach((vv) => pairs.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(vv))}`));
      return;
    }
    pairs.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  });
  return pairs.length ? `?${pairs.join('&')}` : '';
}

function extractTextFromAdf(node, out) {
  const n = node && typeof node === 'object' ? node : null;
  if (!n) return;
  if (n.type === 'text' && typeof n.text === 'string') {
    out.push(n.text);
    return;
  }
  const content = Array.isArray(n.content) ? n.content : [];
  for (const c of content) extractTextFromAdf(c, out);
  if (n.type === 'paragraph') out.push('\n');
}

function normalizeJiraDescription(desc) {
  if (desc == null) return '';
  if (typeof desc === 'string') return desc;
  // Jira Cloud uses Atlassian Document Format (ADF)
  if (typeof desc === 'object' && desc.type === 'doc') {
    const parts = [];
    extractTextFromAdf(desc, parts);
    return parts.join('').replace(/\n{3,}/g, '\n\n').trim();
  }
  try {
    return JSON.stringify(desc);
  } catch (_) {
    return String(desc);
  }
}

async function searchIssues({ q, jql: overrideJql, page = 1, limit = undefined, startAt = undefined, maxResults = undefined, modules, statuses, updatedFrom, updatedTo }) {
  const cfg = getJiraConfig();
  if (!cfg.enabled) {
    return { ok: true, enabled: false, issues: [], items: [], total: 0, page: 1, limit: 0, startAt: 0, maxResults: 0 };
  }

  const keyword = String(q || '').trim();
  if (!keyword && !overrideJql) {
    return { ok: true, enabled: true, issues: [], items: [], total: 0, page: 1, limit: 0, startAt: 0, maxResults: 0 };
  }

  const filters = {};
  if (modules) filters.modules = Array.isArray(modules) ? modules : [modules];
  if (statuses) filters.statuses = Array.isArray(statuses) ? statuses : [statuses];
  if (updatedFrom) filters.updatedFrom = updatedFrom;
  if (updatedTo) filters.updatedTo = updatedTo;

  const jql = overrideJql ? String(overrideJql) : buildJql(keyword, cfg.projectKeys, filters);
  const pageNum = Math.max(Number.parseInt(page, 10) || 1, 1);
  const pageSize = Math.min(
    Number.isFinite(Number(limit)) ? Number(limit)
      : Number.isFinite(Number(maxResults)) ? Number(maxResults)
        : cfg.maxResultsDefault,
    50
  );

  const offset = Number.isFinite(Number(startAt))
    ? Math.max(Number.parseInt(startAt, 10) || 0, 0)
    : (pageNum - 1) * pageSize;

  const headers = {};
  if (cfg.authType === 'basic') {
    const raw = `${cfg.username}:${cfg.apiToken}`;
    const token = Buffer.from(raw, 'utf8').toString('base64');
    headers['Authorization'] = `Basic ${token}`;
  } else if (cfg.authType === 'bearer') {
    headers['Authorization'] = `Bearer ${cfg.bearerToken}`;
  }

  const apiPath = `/rest/api/${cfg.apiVersion}/search`;
  // Jira 6.x (API v2) is most compatible with GET /search.
  const fields = 'summary,updated,status,project,components,attachment,resolution';
  const qs = buildQueryString({
    jql,
    startAt: offset,
    maxResults: pageSize,
    fields
  });
  const resp = await doJsonRequest({
    method: 'GET',
    endpoint: cfg.baseUrl,
    pathName: `${apiPath}${qs}`,
    headers,
    timeoutMs: cfg.timeoutMs
  });

  const issues = Array.isArray(resp?.json?.issues) ? resp.json.issues : [];
  const out = issues.map((it) => {
    const key = it && it.key ? String(it.key) : '';
    const summary = it?.fields?.summary != null ? String(it.fields.summary) : '';
    const status = it?.fields?.status?.name != null ? String(it.fields.status.name) : '';
    const updated = it?.fields?.updated || null;
    const projectKey = it?.fields?.project?.key != null ? String(it.fields.project.key) : '';
    const projectName = it?.fields?.project?.name != null ? String(it.fields.project.name) : '';
    const components = Array.isArray(it?.fields?.components)
      ? it.fields.components
        .map((c) => (c?.name != null ? String(c.name).trim() : ''))
        .filter(Boolean)
      : [];
    // "模块"优先展示组件（components）；没有组件时回退到项目
    const module = components.length ? components.join(', ') : (projectName || projectKey || '');

    // 提取附件信息
    const attachments = Array.isArray(it?.fields?.attachment)
      ? it.fields.attachment.map((att) => ({
          id: att?.id || '',
          filename: att?.filename || '',
          content: att?.content || '',
          mimeType: att?.mimeType || '',
          size: att?.size || 0,
          created: att?.created || null,
          author: att?.author ? {
            displayName: att?.author.displayName || '',
            emailAddress: att?.author.emailAddress || ''
          } : null
        }))
      : [];

    // 提取解决方案
    const resolution = it?.fields?.resolution ? {
      id: it.fields.resolution.id || '',
      name: it.fields.resolution.name || '',
      description: it.fields.resolution.description || ''
    } : null;

    const issueUrl = key ? `${cfg.baseUrl}/browse/${encodeURIComponent(key)}` : cfg.baseUrl;
    return { key, module, components, projectKey, projectName, summary, status, updated, url: issueUrl, attachments, resolution };
  }).filter((x) => x && x.key);

  const total = Number.isFinite(Number(resp?.json?.total)) ? Number(resp.json.total) : out.length;
  const limitOut = pageSize;
  const pageOut = Math.floor(offset / (limitOut || 1)) + 1;

  return {
    ok: true,
    enabled: true,
    baseUrl: cfg.baseUrl,
    jql,
    total,
    page: pageOut,
    limit: limitOut,
    startAt: offset,
    maxResults: pageSize,
    // backward compatible key
    issues: out,
    // new key for list UIs
    items: out
  };
}

async function getIssue(issueKey, { fields = 'summary,updated,status,project,components,description,attachment,resolution,customfield_10705,customfield_10600,customfield_12213,customfield_12284,customfield_12233,customfield_12239' } = {}) {
  const cfg = getJiraConfig();
  if (!cfg.enabled) {
    return { ok: true, enabled: false, issue: null };
  }

  const key = String(issueKey || '').trim();
  if (!key) {
    return { ok: false, enabled: true, issue: null, message: 'issue key required' };
  }

  const headers = {};
  if (cfg.authType === 'basic') {
    const raw = `${cfg.username}:${cfg.apiToken}`;
    const token = Buffer.from(raw, 'utf8').toString('base64');
    headers['Authorization'] = `Basic ${token}`;
  } else if (cfg.authType === 'bearer') {
    headers['Authorization'] = `Bearer ${cfg.bearerToken}`;
  }

  const apiPath = `/rest/api/${cfg.apiVersion}/issue/${encodeURIComponent(key)}`;
  const qs = buildQueryString({ fields });
  const resp = await doJsonRequest({
    method: 'GET',
    endpoint: cfg.baseUrl,
    pathName: `${apiPath}${qs}`,
    headers,
    timeoutMs: cfg.timeoutMs
  });

  const it = resp?.json || null;
  const summary = it?.fields?.summary != null ? String(it.fields.summary) : '';
  const status = it?.fields?.status?.name != null ? String(it.fields.status.name) : '';
  const updated = it?.fields?.updated || null;
  const projectKey = it?.fields?.project?.key != null ? String(it.fields.project.key) : '';
  const projectName = it?.fields?.project?.name != null ? String(it.fields.project.name) : '';
  const components = Array.isArray(it?.fields?.components)
    ? it.fields.components
      .map((c) => (c?.name != null ? String(c.name).trim() : ''))
      .filter(Boolean)
    : [];
  const module = components.length ? components.join(', ') : (projectName || projectKey || '');
  const issueUrl = `${cfg.baseUrl}/browse/${encodeURIComponent(key)}`;
  const descriptionRaw = it?.fields?.description;
  const description = normalizeJiraDescription(descriptionRaw);

  // 提取附件信息
  const attachments = Array.isArray(it?.fields?.attachment)
    ? it.fields.attachment.map((att) => ({
        id: att?.id || '',
        filename: att?.filename || '',
        content: att?.content || '',
        mimeType: att?.mimeType || '',
        size: att?.size || 0,
        created: att?.created || null,
        author: att?.author ? {
          displayName: att?.author.displayName || '',
          emailAddress: att?.author.emailAddress || ''
        } : null
      }))
    : [];

  // 提取解决方案
  const resolution = it?.fields?.resolution ? {
    id: it.fields.resolution.id || '',
    name: it.fields.resolution.name || '',
    description: it.fields.resolution.description || ''
  } : null;

  // 提取自定义字段 - 普通JIRA
  const customfield_10705 = it?.fields?.customfield_10705 != null ? normalizeJiraDescription(it.fields.customfield_10705) : '';
  const customfield_10600 = it?.fields?.customfield_10600 != null ? normalizeJiraDescription(it.fields.customfield_10600) : '';

  // 提取自定义字段 - 客诉
  const customfield_12213 = it?.fields?.customfield_12213 != null ? normalizeJiraDescription(it.fields.customfield_12213) : '';
  const customfield_12284 = it?.fields?.customfield_12284 != null ? normalizeJiraDescription(it.fields.customfield_12284) : '';
  const customfield_12233 = it?.fields?.customfield_12233 != null ? normalizeJiraDescription(it.fields.customfield_12233) : '';
  const customfield_12239 = it?.fields?.customfield_12239 != null ? normalizeJiraDescription(it.fields.customfield_12239) : '';

  return {
    ok: true,
    enabled: true,
    issue: { 
      key, 
      summary, 
      status, 
      updated, 
      projectKey, 
      projectName, 
      components, 
      module, 
      url: issueUrl, 
      description, 
      attachments, 
      resolution,
      // 普通JIRA自定义字段
      customfield_10705,
      customfield_10600,
      // 客诉自定义字段
      customfield_12213,
      customfield_12284,
      customfield_12233,
      customfield_12239
    }
  };
}

module.exports = {
  getJiraConfig,
  searchIssues,
  buildJql,
  buildJqlFromQueryPlan,
  getIssue
};


