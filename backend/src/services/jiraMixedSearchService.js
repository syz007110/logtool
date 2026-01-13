const FaultCase = require('../mongoModels/FaultCase');
const { connectMongo, isMongoConnected } = require('../config/mongodb');
const { getJiraConfig, searchIssues } = require('../services/jiraService');
const { normalizePagination, MAX_PAGE_SIZE } = require('../constants/pagination');

function parseKeywords(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map((v) => String(v).trim()).filter(Boolean);
  return String(val)
    .split(/[,，\n\r\t ]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function safeDateMs(d) {
  if (!d) return 0;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : 0;
}

async function ensureMongoReady() {
  await connectMongo();
  return isMongoConnected();
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Shared implementation for `/api/jira/search-mixed`, also reusable by SmartSearch without an HTTP hop.
 *
 * Notes:
 * - Strict `source`:
 *   - source='jira'   => Mongo is skipped
 *   - source='manual' => Jira is skipped
 * - Mongo status filter uses the standard dictionary key stored in FaultCase.status (matches fault_case_statuses.status_key)
 */
async function runJiraMongoMixedSearch({
  user,
  q,
  page,
  limit,
  jiraWindow,
  source,
  modules,
  moduleKeys,
  statusKeys,
  updatedFrom,
  updatedTo,
  mine,
  // Optional: for SmartSearch to implement OR-search terms without changing the endpoint contract
  mongoSearchTerms,
  mongoModules
}) {
  const cfg = getJiraConfig();
  const keyword = String(q || '').trim();

  const { page: p, limit: l } = normalizePagination(page, limit, 50);
  const pageNum = p;
  const limitNum = l;

  const JIRA_WINDOW = Math.min(Math.max(Number.parseInt(String(jiraWindow ?? '50'), 10) || 50, 10), 50);

  const wantJira = source !== 'manual';
  const wantMongo = source !== 'jira';

  // ---- moduleKeys -> mappings (for Jira + Mongo) ----
  const moduleKeyArr = moduleKeys ? (Array.isArray(moduleKeys) ? moduleKeys : [moduleKeys]) : undefined;
  const modulesArr = modules ? (Array.isArray(modules) ? modules : [modules]) : undefined;

  let moduleMappingsByField = {};
  if (moduleKeyArr && moduleKeyArr.length > 0) {
    try {
      const FaultCaseModule = require('../models/fault_case_module');
      const FaultCaseModuleMapping = require('../models/fault_case_module_mapping');
      const { Op } = require('sequelize');

      const moduleRecords = await FaultCaseModule.findAll({
        where: { module_key: { [Op.in]: moduleKeyArr }, is_active: true },
        attributes: ['id']
      });

      if (moduleRecords.length > 0) {
        const moduleIds = moduleRecords.map((m) => m.id);
        const mappings = await FaultCaseModuleMapping.findAll({
          where: { is_active: true, module_id: { [Op.in]: moduleIds } },
          attributes: ['source_field', 'source_value']
        });

        mappings.forEach((m) => {
          const field = m.source_field || 'default';
          if (!moduleMappingsByField[field]) moduleMappingsByField[field] = [];
          if (m.source_value) moduleMappingsByField[field].push(m.source_value);
        });

        Object.keys(moduleMappingsByField).forEach((field) => {
          moduleMappingsByField[field] = [...new Set(moduleMappingsByField[field])].filter(Boolean);
        });
      }
    } catch (err) {
      console.error('转换模块映射失败:', err);
      moduleMappingsByField = {};
    }
  }

  let finalModules = modulesArr;
  if (moduleKeyArr && moduleKeyArr.length > 0) {
    const allModuleValues = Object.values(moduleMappingsByField).flat();
    if (allModuleValues.length > 0) finalModules = allModuleValues;
  }

  // ---- statusKeys -> Jira statuses (mapping) ----
  const statusKeyArr = statusKeys ? (Array.isArray(statusKeys) ? statusKeys : [statusKeys]) : undefined;
  let jiraStatuses = undefined;
  if (statusKeyArr && statusKeyArr.length > 0) {
    try {
      const FaultCaseStatus = require('../models/fault_case_status');
      const FaultCaseStatusMapping = require('../models/fault_case_status_mapping');
      const { Op } = require('sequelize');

      const statusRecords = await FaultCaseStatus.findAll({
        where: { status_key: { [Op.in]: statusKeyArr }, is_active: true },
        attributes: ['id']
      });

      if (statusRecords.length > 0) {
        const statusIds = statusRecords.map((s) => s.id);
        const mappings = await FaultCaseStatusMapping.findAll({
          where: { is_active: true, status_id: { [Op.in]: statusIds } },
          attributes: ['source_value']
        });
        jiraStatuses = [...new Set(mappings.map((m) => m.source_value))].filter(Boolean);
      }
    } catch (err) {
      console.error('转换状态映射失败:', err);
      jiraStatuses = undefined;
    }
  }

  // ---- Jira ----
  let jiraResp;
  if (!wantJira) {
    jiraResp = {
      ok: true,
      enabled: !!cfg.enabled,
      issues: [],
      items: [],
      total: 0,
      page: 1,
      limit: 0,
      startAt: 0,
      maxResults: 0,
      message: 'Skipped Jira by source filter'
    };
  } else if (!cfg.enabled) {
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
  } else if (keyword && keyword.length > 200) {
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
        q: keyword,
        page: 1,
        limit: JIRA_WINDOW,
        modules: finalModules,
        moduleMappingsByField: Object.keys(moduleMappingsByField).length > 0 ? moduleMappingsByField : undefined,
        statuses: jiraStatuses,
        updatedFrom,
        updatedTo
      });
    } catch (err) {
      console.warn('[jira] mixed search failed (jira part):', err?.status || err?.code || '', err?.message || err);
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
        message: 'Jira 搜索失败'
      };
    }
  }

  const jiraItemsRaw = Array.isArray(jiraResp?.items) ? jiraResp.items : (Array.isArray(jiraResp?.issues) ? jiraResp.issues : []);
  const jiraItems = jiraItemsRaw.map((it) => ({ ...(it || {}), source: 'jira' }));
  const jiraTotal = Number.isFinite(Number(jiraResp?.total)) ? Number(jiraResp.total) : jiraItems.length;

  // ---- Mongo ----
  let mongoOk = true;
  let mongoMessage = '';
  let mongoTotal = 0;
  let mongoItems = [];

  try {
    if (!wantMongo) {
      mongoItems = [];
      mongoTotal = 0;
    } else {
      const mongoReady = await ensureMongoReady();
      if (!mongoReady) {
        mongoOk = false;
        mongoMessage = 'MongoDB 未连接，故障案例功能不可用';
      } else if (!keyword && !(Array.isArray(mongoSearchTerms) && mongoSearchTerms.length)) {
        mongoItems = [];
        mongoTotal = 0;
      } else {
        const mineBool = String(mine || '').toLowerCase() === '1' || String(mine || '').toLowerCase() === 'true';
        const keywordsForIn = parseKeywords(keyword);

        // Build Mongo filter as $and of: visibility + source + module + status + time + search
        const allConditions = [];

        if (mineBool && user?.id) allConditions.push({ created_by: user.id });

        // Strict source filter already handled by wantMongo; keep defensive condition if source is present
        if (source) allConditions.push({ source });

        // Module filter
        const mongoModuleKeyArr = Array.isArray(mongoModules) ? mongoModules.map((x) => String(x).trim()).filter(Boolean) : [];
        if (mongoModuleKeyArr.length) {
          allConditions.push({ module: { $in: mongoModuleKeyArr.slice(0, 50) } });
        } else if (moduleKeyArr && moduleKeyArr.length > 0 && Object.keys(moduleMappingsByField).length > 0) {
          const moduleOrConditions = [];
          Object.keys(moduleMappingsByField).forEach((field) => {
            const values = moduleMappingsByField[field];
            if (values.length > 0) {
              const mongoField = field === 'default' ? 'module' : field;
              moduleOrConditions.push({ [mongoField]: { $in: values } });
            }
          });
          if (moduleOrConditions.length > 0) allConditions.push({ $or: moduleOrConditions });
        } else if (finalModules && finalModules.length > 0) {
          allConditions.push({ module: { $in: finalModules } });
        }

        // Status filter (Mongo uses standard status_key)
        if (statusKeyArr && statusKeyArr.length > 0) {
          allConditions.push({ status: { $in: statusKeyArr } });
        }

        // Date range filter
        if (updatedFrom || updatedTo) {
          const dateFilter = {};
          if (updatedFrom) dateFilter.$gte = new Date(updatedFrom);
          if (updatedTo) dateFilter.$lte = new Date(updatedTo);
          allConditions.push({ updatedAt: dateFilter });
        }

        // Search condition
        const terms = Array.isArray(mongoSearchTerms) ? mongoSearchTerms.map((t) => String(t).trim()).filter(Boolean) : [];
        const effectiveTerms = (terms.length ? terms : [keyword]).filter(Boolean).slice(0, 12);

        const searchConditions = [];
        if (effectiveTerms.length) {
          const pattern = effectiveTerms.map(escapeRegExp).join('|');
          const re = new RegExp(pattern, 'i');
          searchConditions.push(
            { title: re },
            { symptom: re },
            { possible_causes: re },
            { solution: re },
            { remark: re }
          );
        }

        const kws = [...new Set([...keywordsForIn, ...effectiveTerms.flatMap(parseKeywords)])].filter(Boolean).slice(0, 50);
        if (kws.length > 0) searchConditions.push({ keywords: { $in: kws } });

        if (searchConditions.length) allConditions.push({ $or: searchConditions });

        const filter = allConditions.length ? { $and: allConditions } : {};

        // Debug logs (kept consistent with previous behavior)
        const start = (pageNum - 1) * limitNum;
        const mongoSkip = Math.max(0, start - JIRA_WINDOW);
        const mongoLimit = limitNum + (JIRA_WINDOW * 2);

        const queryPipeline = [
          { $match: filter },
          { $sort: { updatedAt: -1 } },
          { $skip: mongoSkip },
          { $limit: mongoLimit }
        ];
        console.log('[混合搜索-MongoDB] MongoDB 查询语句:');
        console.log(JSON.stringify(queryPipeline, null, 2));
        console.log('[混合搜索-MongoDB] 查询参数:', {
          q: keyword,
          source,
          modules: finalModules,
          moduleKeys: moduleKeyArr,
          statusKeys: statusKeyArr,
          updatedFrom,
          updatedTo,
          page: pageNum,
          limit: limitNum,
          mine: mineBool,
          mongoSearchTerms: effectiveTerms,
          mongoModules: mongoModuleKeyArr
        });

        mongoTotal = await FaultCase.countDocuments(filter);
        const docs = await FaultCase.aggregate(queryPipeline);

        const baseUrl = jiraResp?.baseUrl || cfg.baseUrl || '';
        mongoItems = (docs || []).map((d) => {
          const id = d?._id ? String(d._id) : '';
          const jiraKey = d?.jira_key ? String(d.jira_key).trim() : '';
          const caseCode = d?.case_code ? String(d.case_code).trim() : '';
          const key = caseCode || jiraKey || (id ? `FC-${id.slice(-6).toUpperCase()}` : '');
          const updated = d?.updatedAt || d?.createdAt || null;
          const url = (jiraKey && baseUrl) ? `${baseUrl.replace(/\/+$/, '')}/browse/${encodeURIComponent(jiraKey)}` : '';
          return {
            source: 'mongo',
            key,
            case_code: caseCode,
            jira_key: jiraKey,
            fault_case_id: id,
            module: d?.module || '',
            summary: d?.title || '',
            status: d?.status || '',
            updated,
            url
          };
        }).filter((x) => x && x.key);
      }
    }
  } catch (err) {
    mongoOk = false;
    mongoMessage = 'MongoDB 搜索失败';
    console.warn('[jira] mixed search failed (mongo part):', err?.message || err);
  }

  // ---- merge + sort + slice ----
  const jiraActualCount = jiraItems.length;
  const jiraActualTotal = jiraTotal ? Math.min(jiraTotal, JIRA_WINDOW) : Math.min(jiraActualCount, JIRA_WINDOW);
  const total = (wantJira ? jiraActualTotal : 0) + (wantMongo ? (mongoTotal || 0) : 0);

  const merged = [...(wantJira ? jiraItems : []), ...(wantMongo ? mongoItems : [])]
    .sort((a, b) => safeDateMs(b?.updated) - safeDateMs(a?.updated));

  const startAbs = (pageNum - 1) * limitNum;
  const mongoSkipForSlice = Math.max(0, startAbs - JIRA_WINDOW);
  const startLocal = Math.max(0, startAbs - mongoSkipForSlice);
  const items = merged.slice(startLocal, startLocal + limitNum);

  return {
    ok: jiraResp?.ok !== false,
    enabled: jiraResp?.enabled !== false,
    message: jiraResp?.message || '',
    mongo_ok: mongoOk,
    mongo_message: mongoMessage,
    total,
    page: pageNum,
    limit: limitNum,
    issues: items,
    items
  };
}

module.exports = {
  runJiraMongoMixedSearch
};

