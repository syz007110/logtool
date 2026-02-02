const {
  resolveProvider,
  getSmartSearchLlmStatusForProvider,
  extractBatchFiltersWithProvider
} = require('../services/smartSearchLlmService');

function pickLang(req) {
  const acceptLanguage = req.headers['accept-language'] || 'zh';
  return String(acceptLanguage).startsWith('en') ? 'en' : 'zh';
}

function getClientIp(req) {
  const xff = req?.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim();
  const xrip = req?.headers?.['x-real-ip'];
  if (typeof xrip === 'string' && xrip.trim()) return xrip.trim();
  return req?.ip || '';
}

function truncateString(s, maxLen) {
  const str = String(s ?? '');
  if (str.length <= maxLen) return str;
  return `${str.slice(0, maxLen)}...<truncated:${str.length - maxLen}>`;
}

function fireAndForgetOperationLog(payload) {
  Promise.resolve()
    .then(async () => {
      const { logOperation } = require('../utils/operationLogger');
      await logOperation(payload);
    })
    .catch((err) => {
      console.warn('[batch-analysis-nl] logOperation failed (ignored):', err?.message || err);
    });
}

async function nlToBatchFilters(req, res) {
  const body = req.body || {};
  const text = String(body.text || body.query || '').trim();
  const llmProviderId = String(body.llmProviderId || body.providerId || body.provider || '').trim();

  const provider = resolveProvider(llmProviderId);
  const llmStatus = getSmartSearchLlmStatusForProvider(provider);
  const providerPublic = provider ? { id: provider.id, label: provider.label, model: provider.model } : null;

  if (!llmStatus.available) {
    fireAndForgetOperationLog({
      operation: 'batch_analysis_nl_search',
      description: `自然语言搜索（批量，不可用）: ${truncateString(text, 120)}`,
      user_id: req.user?.id ?? null,
      username: req.user?.username ?? '',
      status: 'failed',
      ip: getClientIp(req),
      user_agent: req.headers?.['user-agent'] || '',
      details: { input: { text: truncateString(text, 500) }, reason: llmStatus.reason }
    });
    return res.status(503).json({
      ok: false,
      message: 'LLM not available',
      meta: {
        lang: pickLang(req),
        llmEnabled: llmStatus.enabled,
        llmAvailable: llmStatus.available,
        llmReason: llmStatus.reason,
        llmProvider: providerPublic?.id || null,
        llmModel: providerPublic?.model || null
      }
    });
  }

  try {
    const llm = await extractBatchFiltersWithProvider({ providerId: llmProviderId, text });
    const result = llm?.result || {};
    const hasSearch = typeof result.search === 'string' && result.search.trim();
    const hasTime = !!(result.start_time && result.end_time);
    const hasFilters = !!(result.filters && Array.isArray(result.filters.conditions) && result.filters.conditions.length > 0);

    const raw = llm?.raw || {};
    const usage = raw.usage && typeof raw.usage === 'object' ? {
      total_tokens: raw.usage.total_tokens,
      prompt_tokens: raw.usage.prompt_tokens,
      completion_tokens: raw.usage.completion_tokens,
      prompt_tokens_details: raw.usage.prompt_tokens_details || null
    } : null;

    fireAndForgetOperationLog({
      operation: 'batch_analysis_nl_search',
      description: `自然语言搜索（批量）: ${truncateString(text, 120)}`,
      user_id: req.user?.id ?? null,
      username: req.user?.username ?? '',
      status: 'success',
      ip: getClientIp(req),
      user_agent: req.headers?.['user-agent'] || '',
      details: {
        input: { text: text || '' },
        resultSummary: { hasSearch, hasTime, hasFilters },
        llmRaw: {
          response: {
            model: raw.model ?? providerPublic?.model ?? null,
            usage,
            content: raw.content ?? '',
            provider: raw.provider ?? providerPublic?.id ?? null
          }
        }
      }
    });

    return res.json({
      ok: true,
      result,
      meta: {
        lang: pickLang(req),
        llmEnabled: llmStatus.enabled,
        llmAvailable: llmStatus.available,
        llmReason: llmStatus.reason,
        llmProvider: providerPublic?.id || null,
        llmModel: providerPublic?.model || null
      },
      debug: body.debug ? { llmPrompt: { messages: llm?.messages || [] }, llmRaw: llm?.raw || null } : undefined
    });
  } catch (err) {
    console.error('[nlToBatchFilters] failed:', err?.message || err);
    fireAndForgetOperationLog({
      operation: 'batch_analysis_nl_search',
      description: `自然语言搜索（批量，失败）: ${truncateString(text, 120)}`,
      user_id: req.user?.id ?? null,
      username: req.user?.username ?? '',
      status: 'failed',
      ip: getClientIp(req),
      user_agent: req.headers?.['user-agent'] || '',
      details: { input: { text: truncateString(text, 500) }, error: String(err?.message || err) }
    });
    return res.status(500).json({ ok: false, message: 'Failed to parse natural language', error: String(err?.message || err) });
  }
}

module.exports = {
  nlToBatchFilters
};

