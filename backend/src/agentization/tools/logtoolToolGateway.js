const { buildToolCall } = require('../types/contracts');
const { smartSearch } = require('../../controllers/smartSearchController');
const { extractFaultCodesFromText, normalizeTypeCode } = require('../../services/faultCodeExtractionService');

function parseBool(value, fallback = false) {
  const s = String(value == null ? '' : value).trim().toLowerCase();
  if (!s) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return fallback;
}

function shouldEnableSmartSearchDebug(request) {
  const source = String(request?.context?.source || '').trim().toLowerCase();
  const tab = String(request?.context?.uiTab || '').trim().toLowerCase();
  if (source === 'explanation_tester' || tab === 'agent') return true;
  return parseBool(process.env.AGENT_SMART_SEARCH_DEBUG, false);
}

function runSmartSearchControllerWithPlan({ query, request, llmProviderId, planOverride }) {
  const includeDebug = shouldEnableSmartSearchDebug(request);
  return new Promise((resolve, reject) => {
    const req = {
      body: {
        query,
        limits: {
          errorCodes: 10,
          jira: 10,
          faultCases: 10,
          kbDocs: 5,
          kbGenerate: true
        },
        debug: includeDebug,
        ...(planOverride && typeof planOverride === 'object' ? { queryPlanOverride: planOverride } : {}),
        ...(llmProviderId ? { llmProviderId } : {})
      },
      query: includeDebug ? { debug: '1' } : {},
      headers: {
        'user-agent': 'agentization-tool'
      },
      user: {
        id: request?.user?.id ?? null,
        username: request?.user?.name || request?.user?.id || 'agent-user'
      },
      ip: ''
    };

    const res = {
      _status: 200,
      status(code) {
        this._status = Number(code || 500);
        return this;
      },
      json(payload) {
        const status = Number(this._status || 200);
        if (status >= 400) {
          const err = new Error(String(payload?.message || 'smart-search failed'));
          err.status = status;
          err.payload = payload;
          reject(err);
          return this;
        }
        resolve({ status, payload });
        return this;
      }
    };

    Promise.resolve(smartSearch(req, res)).catch((error) => reject(error));
  });
}

function toStringArray(input, max = 12) {
  if (!Array.isArray(input)) return [];
  return input.map((x) => String(x || '').trim()).filter(Boolean).slice(0, max);
}

function buildFaultCodeCandidates(query, rawFilters) {
  const recognized = extractFaultCodesFromText(query);
  const extracted = Array.isArray(recognized?.typeCodes) ? recognized.typeCodes : [];
  const filterCode = normalizeTypeCode(rawFilters?.errorCode || '');
  const set = new Set();
  for (const c of extracted) set.add(String(c || '').trim());
  if (filterCode) set.add(filterCode);
  return Array.from(set).filter(Boolean).slice(0, 12);
}

function buildPlanOverride(intent, query, slots) {
  const rawFilters = slots?.filters && typeof slots.filters === 'object' ? slots.filters : {};
  const keywords = toStringArray(slots?.keywords, 12);
  const faultCodes = buildFaultCodeCandidates(query, rawFilters);
  return {
    intent,
    query: {
      keywords,
      fault_codes: faultCodes,
      symptom: rawFilters.Phenomenon ? [String(rawFilters.Phenomenon).trim()].filter(Boolean) : [],
      trigger: [],
      component: rawFilters.device ? [String(rawFilters.device).trim()].filter(Boolean) : [],
      neg: [],
      days: 180
    }
  };
}

async function executeIntentRoute({ routeIntent, request, intentResult, query }) {
  const llmProviderId = String(request?.context?.llmProviderId || '').trim() || undefined;
  const slots = intentResult?.slots && typeof intentResult.slots === 'object' ? intentResult.slots : {};
  const planOverride = buildPlanOverride(routeIntent, query, slots);
  const { payload } = await runSmartSearchControllerWithPlan({ query, request, llmProviderId, planOverride });
  return {
    text: String(payload?.answerText || payload?.answer || '').trim() || (query ? `已接收 ${routeIntent} 请求：${query}` : `已接收 ${routeIntent} 请求`),
    payload,
    llmProviderId,
    planOverride
  };
}

function buildIntentExecutionDebug({ routeIntent, common, toolCall, payload }) {
  return {
    ...common,
    executionRoute: routeIntent,
    toolCall,
    intentExecution: {
      route: routeIntent,
      recognized: payload?.recognized || null,
      queryPlan: payload?.queryPlan || null,
      sources: payload?.sources || null,
      meta: payload?.meta || null,
      llmRaw: {
        request: payload?.debug?.llmPrompt || null,
        response: payload?.debug?.llmRaw || null
      }
    }
  };
}

function createIntentHandlers() {
  const directSmartSearchIntents = new Set([
    'lookup_fault_code',
    'find_case',
    'troubleshoot',
    'definition',
    'how_to_use',
    'other',
    'smart_search'
  ]);
  const smartHandlerByIntent = new Map([
    ['lookup_fault_code', 'ErrorCodeHandler'],
    ['find_case', 'CaseSearchHandler'],
    ['definition', 'KbSearchHandler'],
    ['how_to_use', 'KbSearchHandler'],
    ['other', 'KbSearchHandler'],
    ['smart_search', 'KbSearchHandler'],
    ['troubleshoot', 'KbSearchHandler']
  ]);

  return {
    async executeSmartIntent(normalizedIntent, request, intentResult) {
      const query = String(request?.message?.text || '').trim();
      const routeIntent = normalizedIntent === 'smart_search' ? 'other' : normalizedIntent;
      const common = {
        source: 'logtool',
        intent: intentResult.intent,
        traceId: request.traceId,
        handlerName: smartHandlerByIntent.get(normalizedIntent) || 'KbSearchHandler'
      };

      if (directSmartSearchIntents.has(normalizedIntent)) {
        const result = await executeIntentRoute({ routeIntent, request, intentResult, query });
        const toolCall = buildToolCall({
          toolName: routeIntent,
          input: {
            query,
            intent: routeIntent,
            llmProviderId: result.llmProviderId,
            planOverride: result.planOverride
          }
        });
        return {
          text: result.text,
          debugMeta: buildIntentExecutionDebug({
            routeIntent,
            common,
            toolCall,
            payload: result.payload
          })
        };
      }
      return null;
    }
  };
}

function createLogtoolToolGateway() {
  const handlers = createIntentHandlers();
  const handlerByIntent = new Map([
    ['lookup_fault_code', 'ErrorCodeHandler'],
    ['find_case', 'CaseSearchHandler'],
    ['definition', 'KbSearchHandler'],
    ['how_to_use', 'KbSearchHandler'],
    ['other', 'KbSearchHandler'],
    ['smart_search', 'KbSearchHandler'],
    ['log_query', 'LogAnalysisHandler'],
    ['surgery_summary', 'SurgeryDataHandler'],
    ['case_record', 'FaultCaseCollectHandler']
  ]);
  return {
    async invoke(intent, request, intentResult) {
      const query = String(request?.message?.text || '').trim();
      const normalizedIntent = String(intent || '').trim();
      const common = {
        source: 'logtool',
        intent: intentResult.intent,
        traceId: request.traceId,
        handlerName: handlerByIntent.get(normalizedIntent) || 'FaultCaseCollectHandler'
      };

      const smartIntentResult = await handlers.executeSmartIntent(normalizedIntent, request, intentResult);
      if (smartIntentResult) return smartIntentResult;

      if (normalizedIntent === 'log_query') {
        const toolCall = buildToolCall({
          toolName: 'log_query',
          input: { query }
        });
        return {
          text: query ? `已接收 log_query 请求：${query}` : '已接收 log_query 请求',
          debugMeta: { ...common, executionRoute: 'log_query', handlerName: 'LogAnalysisHandler', toolCall }
        };
      }

      if (normalizedIntent === 'surgery_summary') {
        const toolCall = buildToolCall({
          toolName: 'surgery_summary',
          input: { query }
        });
        return {
          text: query ? `已接收 surgery_summary 请求：${query}` : '已接收 surgery_summary 请求',
          debugMeta: { ...common, executionRoute: 'surgery_summary', handlerName: 'SurgeryDataHandler', toolCall }
        };
      }

      const toolCall = buildToolCall({
        toolName: 'case_record',
        input: {
          query,
          confirmationRequired: true
        }
      });
      return {
        text: query
          ? `已生成 case_record 草稿，待人工确认：${query}`
          : '已生成 case_record 草稿，待人工确认',
        actions: [
          { type: 'human_review', label: '人工确认后入库' }
        ],
        debugMeta: { ...common, executionRoute: 'case_record', handlerName: 'FaultCaseCollectHandler', toolCall }
      };
    }
  };
}

module.exports = {
  createLogtoolToolGateway
};
