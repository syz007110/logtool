const { getJiraConfig, searchIssues } = require('../services/jiraService');

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
      message: 'Jira 搜索失败（请检查后端配置、网络或权限）'
    });
  }
}

module.exports = {
  searchJiraIssues
};


