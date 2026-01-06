const { getJiraConfig, searchIssues, getIssue } = require('../services/jiraService');
const { connectMongo, isMongoConnected } = require('../config/mongodb');
const FaultCase = require('../mongoModels/FaultCase');

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
  const page = Number.parseInt(req.query.page || '1', 10) || 1;
  const limit = Number.parseInt(req.query.limit || req.query.maxResults || '10', 10) || 10;
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
  const cfg = getJiraConfig();
  const q = (req.query.q || req.query.keyword || '').toString().trim();

  const page = Math.max(Number.parseInt(req.query.page || '1', 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '20', 10) || 20, 1), 50);

  // Two-stage aggregation strategy:
  // - MongoDB: stable internal dataset -> do precise pagination with skip/limit
  // - Jira: external system (slow/limited) -> fetch a bounded "window" (top N), then merge
  const JIRA_WINDOW = Math.min(Math.max(Number.parseInt(req.query.jiraWindow || '50', 10) || 50, 10), 50);

  // Filters (applied to both Jira and MongoDB)
  const source = req.query.source;
  const modules = req.query.modules ? (Array.isArray(req.query.modules) ? req.query.modules : [req.query.modules]) : undefined;
  const statuses = req.query.statuses ? (Array.isArray(req.query.statuses) ? req.query.statuses : [req.query.statuses]) : undefined;
  const updatedFrom = req.query.updatedFrom || req.query.updated_from;
  const updatedTo = req.query.updatedTo || req.query.updated_to;

  // ---- Jira ----
  let jiraResp;
  if (!cfg.enabled) {
    jiraResp = {
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
    };
  } else if (q && q.length > 200) {
    jiraResp = {
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
    };
  } else {
    try {
      jiraResp = await searchIssues({
        q,
        page: 1,
        // bounded window for Jira
        limit: JIRA_WINDOW,
        modules,
        statuses,
        updatedFrom,
        updatedTo
      });
    } catch (err) {
      console.warn('[jira] mixed search failed (jira part):', err?.status || err?.code || '', err?.message || err);
      
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
      
      jiraResp = {
        ok: false,
        enabled: true,
        issues: [],
        items: [],
        total: 0,
        page: 1,
        limit: JIRA_WINDOW,
        startAt: 0,
        maxResults: JIRA_WINDOW,
        message
      };
    }
  }

  const jiraItemsRaw = Array.isArray(jiraResp?.items) ? jiraResp.items : (Array.isArray(jiraResp?.issues) ? jiraResp.issues : []);
  const jiraItems = jiraItemsRaw.map((it) => ({ ...(it || {}), source: 'jira' }));
  const jiraTotal = Number.isFinite(Number(jiraResp?.total)) ? Number(jiraResp.total) : jiraItems.length;

  // ---- Mongo fault cases ----
  let mongoOk = true;
  let mongoMessage = '';
  let mongoTotal = 0;
  let mongoItems = [];

  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      mongoOk = false;
      mongoMessage = 'MongoDB 未连接，故障案例功能不可用';
    } else if (!q) {
      // When no keyword, keep old behavior: this mixed endpoint is for keyword search
      mongoItems = [];
      mongoTotal = 0;
    } else {
      const mine = String(req.query.mine || '').toLowerCase() === '1' || String(req.query.mine || '').toLowerCase() === 'true';
      const keywords = parseKeywords(q);
      
      // MongoDB $text search limitation: $text must be at top level and cannot be mixed with $or in $and
      // Solution: Use regex-based search instead of $text for better compatibility
      const filter = {};

      // Visibility condition
      if (mine) {
        filter.created_by = req.user.id;
      } else {
        filter.$or = [{ is_published: true }, { created_by: req.user.id }];
      }

      // Source filter (manual/jira)
      if (source) {
        filter.source = source;
      }

      // Module filter
      if (modules && modules.length > 0) {
        filter.module = { $in: modules };
      }

      // Status filter - MongoDB fault cases don't have status field, skip this filter for MongoDB
      // Date range filter
      if (updatedFrom || updatedTo) {
        const dateFilter = {};
        if (updatedFrom) {
          dateFilter.$gte = new Date(updatedFrom);
        }
        if (updatedTo) {
          dateFilter.$lte = new Date(updatedTo);
        }
        filter.updatedAt = dateFilter;
      }

      // Search condition: use regex on text fields + keywords match
      const searchConditions = [];
      const searchRegex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      searchConditions.push(
        { title: searchRegex },
        { symptom: searchRegex },
        { possible_causes: searchRegex },
        { solution: searchRegex },
        { remark: searchRegex },
        { troubleshooting_steps: searchRegex },
        { experience: searchRegex }
      );
      if (keywords.length > 0) {
        searchConditions.push({ keywords: { $in: keywords } });
      }

      // Combine all conditions with $and
      const allConditions = [];

      // Add visibility condition
      if (mine) {
        allConditions.push({ created_by: req.user.id });
      } else {
        allConditions.push({ $or: [{ is_published: true }, { created_by: req.user.id }] });
      }

      // Add source filter
      if (source) {
        allConditions.push({ source });
      }

      // Add module filter
      if (modules && modules.length > 0) {
        allConditions.push({ module: { $in: modules } });
      }

      // Add date range filter
      if (updatedFrom || updatedTo) {
        const dateFilter = {};
        if (updatedFrom) {
          dateFilter.$gte = new Date(updatedFrom);
        }
        if (updatedTo) {
          dateFilter.$lte = new Date(updatedTo);
        }
        allConditions.push({ updatedAt: dateFilter });
      }

      // Add search condition
      allConditions.push({ $or: searchConditions });

      filter.$and = allConditions;

      mongoTotal = await FaultCase.countDocuments(filter);

      // Precise pagination for Mongo, with a small "offset correction window" to account for Jira items
      // potentially appearing before Mongo items in the unified sorted list.
      const start = (page - 1) * limit;
      const mongoSkip = Math.max(0, start - JIRA_WINDOW);
      const mongoLimit = limit + (JIRA_WINDOW * 2);

      const docs = await FaultCase.aggregate([
        { $match: filter },
        { $addFields: { effectiveUpdatedAt: { $ifNull: ['$updated_at_user', '$updatedAt'] } } },
        { $sort: { effectiveUpdatedAt: -1, updatedAt: -1 } },
        { $skip: mongoSkip },
        { $limit: mongoLimit }
      ]);

      const baseUrl = jiraResp?.baseUrl || cfg.baseUrl || '';
      mongoItems = (docs || []).map((d) => {
        const id = d?._id ? String(d._id) : '';
        const jiraKey = d?.jira_key ? String(d.jira_key).trim() : '';
        const key = jiraKey || (id ? `FC-${id.slice(-6).toUpperCase()}` : '');
        const updated = d?.updated_at_user || d?.updatedAt || d?.createdAt || null;
        const url = (jiraKey && baseUrl) ? `${baseUrl.replace(/\/+$/, '')}/browse/${encodeURIComponent(jiraKey)}` : '';
        return {
          source: 'mongo',
          key,
          jira_key: jiraKey,
          fault_case_id: id,
          module: d?.module || '',
          summary: d?.title || '',
          status: d?.is_published === true ? 'published' : 'draft',
          updated,
          url
        };
      }).filter((x) => x && x.key);
    }
  } catch (err) {
    mongoOk = false;
    mongoMessage = 'MongoDB 搜索失败';
    console.warn('[jira] mixed search failed (mongo part):', err?.message || err);
  }

  // ---- merge + sort + slice ----
  // Total should reflect actual fetchable data:
  // - JIRA: only top JIRA_WINDOW items are available (even if jiraTotal reports more)
  //   Use actual returned count if jiraTotal is not available
  // - MongoDB: all matching items are available
  const jiraActualCount = jiraItems.length;
  // If jiraTotal exists, cap it at JIRA_WINDOW; otherwise use actual count (also capped)
  const jiraActualTotal = jiraTotal 
    ? Math.min(jiraTotal, JIRA_WINDOW)
    : Math.min(jiraActualCount, JIRA_WINDOW);
  const total = jiraActualTotal + (mongoTotal || 0);
  let items = [];
  let message = jiraResp?.message || '';

  // Merge Jira top-window + Mongo paged-window, then slice relative to mongoSkip
  const merged = [...jiraItems, ...mongoItems].sort((a, b) => safeDateMs(b?.updated) - safeDateMs(a?.updated));
  const startAbs = (page - 1) * limit;
  const mongoSkipForSlice = Math.max(0, startAbs - JIRA_WINDOW);
  const startLocal = Math.max(0, startAbs - mongoSkipForSlice);
  items = merged.slice(startLocal, startLocal + limit);
  
  // If we've exhausted available data but total was higher, adjust total to reflect reality
  // This prevents showing "815 results" when only ~50 JIRA + some Mongo items are actually available
  if (items.length === 0 && startAbs >= total) {
    // Page is beyond available data, but we already adjusted total above
  }

  return res.json({
    ok: jiraResp?.ok !== false,
    enabled: jiraResp?.enabled !== false,
    message,
    // extra info for troubleshooting mongo problems, while keeping old jira response contract intact
    mongo_ok: mongoOk,
    mongo_message: mongoMessage,
    total,
    page,
    limit,
    // keep backward compatible keys for existing UIs
    issues: items,
    items
  });
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
  }
};


