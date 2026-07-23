const { postgresqlSequelize } = require('../../config/postgresql');
const { buildConversationMessageInput } = require('./conversationMessageMapper');
const { resolveDialogueMessageType, MESSAGE_TYPES } = require('./conversationMessageTypes');
const { buildHistoryMessages } = require('./historyProjection');
const {
  buildContainerKey,
  buildIdempotencyKey,
  buildMessageId,
  buildEventIdempotencyKey,
  extractTokenUsageFromTurn,
  extractTokenUsageFromLoopTrace,
  EVENT_SUFFIX,
  buildSystemMessageSuffix
} = require('./conversationTurnKeys');
const { getLoopPolicy } = require('../runtime/turnPolicy');
const { createMessageService } = require('./messageService');
const { projectToolTracesFromLoopTrace } = require('../types/toolTracesProjection');
const { sanitizeMultimodalPayload } = require('../utils/multimodalPayloadSanitizer');
const { shouldPersistClosedOrchestratorEntry } = require('./toolCallClosure');
const { getAgentFixedT, resolveAgentLng } = require('../utils/agentI18n');
const {
  buildInactiveInstanceNotice,
  buildInstanceNotice,
  getRolloverReason
} = require('./sessionRolloverPolicy');

const messageService = createMessageService();

function nowTs() {
  return new Date();
}


function isSessionContextDebugEnabled() {
  return String(process.env.SESSION_CONTEXT_DEBUG || '').trim().toLowerCase() === 'true';
}

function truncateText(input, max = 120) {
  const text = String(input || '').trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function truncateJson(input, max = 160) {
  try {
    return truncateText(JSON.stringify(input || {}), max);
  } catch (_) {
    return '';
  }
}

function logContextEnvelopeDebug(request, contextEnvelope) {
  if (!isSessionContextDebugEnabled() || !contextEnvelope) return;
  try {
    const historyContext = asPlainObject(contextEnvelope.historyContext);
    const historyMessages = Array.isArray(historyContext.messages) ? historyContext.messages : [];
    const historyMessagesPreview = historyMessages.slice(-2).map((turn) => ({
      role: String(turn?.role || ''),
      content: truncateText(turn?.content, 80)
    }));
    console.log('[session-context] envelope', {
      traceId: String(request?.traceId || ''),
      requestId: String(request?.requestId || ''),
      currentQuery: truncateText(contextEnvelope.currentQuery, 120),
      historySummary: truncateJson(contextEnvelope.historySummary, 200),
      historyMessagesCount: historyMessages.length,
      historyMessagesPreview,
      contextVersion: Number(contextEnvelope.contextVersion || 2)
    });
  } catch (error) {
    console.warn('[session-context] debug log failed:', error?.message || error);
  }
}

function isPrepareDebugEnabled() {
  const raw = String(process.env.SESSION_PREPARE_DEBUG || 'true').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function prepareLog(step, payload = {}) {
  if (!isPrepareDebugEnabled()) return;
  console.log('[session-prepare]', {
    step: String(step || ''),
    ...payload
  });
}

function prepareError(step, error, payload = {}) {
  if (!isPrepareDebugEnabled()) return;
  console.error('[session-prepare-error]', {
    step: String(step || ''),
    message: String(error?.message || error || ''),
    code: String(error?.code || ''),
    ...payload
  });
}

function getPolicy() {
  const maxTurns = Number.parseInt(process.env.SESSION_MAX_TURNS || '20', 10) || 20;
  const historyTurnsRaw = Number.parseInt(process.env.SESSION_CONTEXT_HISTORY_TURNS || '', 10);
  const historyTurns = Number.isFinite(historyTurnsRaw) && historyTurnsRaw > 0
    ? historyTurnsRaw
    : maxTurns;
  return {
    maxTurns,
    idleTimeoutMinutes: Number.parseInt(process.env.SESSION_IDLE_TIMEOUT_MINUTES || '30', 10) || 30,
    maxTokens: Number.parseInt(process.env.SESSION_MAX_TOKENS || '6000', 10) || 6000,
    historyTurns,
    ...getLoopPolicy()
  };
}

function normalizeMessagePayload(request) {
  return {
    externalMessageId: request?.message?.externalMessageId,
    type: request?.message?.type,
    text: request?.message?.text || '',
    contentRaw: request?.message?.contentRaw ?? null,
    attachments: Array.isArray(request?.message?.attachments) ? request.message.attachments : [],
    sentAt: Number(request?.message?.sentAt || Date.now())
  };
}

function asPlainObject(input) {
  return input && typeof input === 'object' && !Array.isArray(input) ? input : {};
}

function sanitizePersistedPayload(input) {
  return sanitizeMultimodalPayload(asPlainObject(input));
}

function cloneJsonObject(input) {
  return JSON.parse(JSON.stringify(asPlainObject(input)));
}

function parseJsonSafely(input) {
  if (input && typeof input === 'object') return input;
  const raw = String(input || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function excludeCurrentMessageFromHistory(history, request) {
  const currentMessageId = String(request?.message?.externalMessageId || '').trim();
  if (!currentMessageId) return Array.isArray(history) ? history : [];
  return (Array.isArray(history) ? history : []).filter((row) => {
    const rowMessageId = String(row?.message_id || row?.messageId || '').trim();
    return rowMessageId !== currentMessageId;
  });
}

function buildCurrentInput(request) {
  const attachments = Array.isArray(request?.message?.attachments) ? request.message.attachments : [];
  const assetIds = Array.from(new Set(
    attachments
      .map((a) => String(a?.assetId || '').trim())
      .filter(Boolean)
  ));
  return {
    messageId: String(request?.message?.externalMessageId || '').trim() || null,
    attachments,
    assetIds
  };
}

function resolveRecentTurnLimit(policy = {}) {
  const maxTurns = Number(policy?.maxTurns);
  const historyTurns = Number(policy?.historyTurns);
  const safeMaxTurns = Number.isFinite(maxTurns) && maxTurns > 0 ? Math.floor(maxTurns) : 20;
  const safeHistoryTurns = Number.isFinite(historyTurns) && historyTurns > 0
    ? Math.floor(historyTurns)
    : safeMaxTurns;
  return Math.max(1, Math.min(safeHistoryTurns, safeMaxTurns));
}

function buildContextEnvelope({ request, history, policy }) {
  const currentQuery = String(request?.message?.text || '').trim();
  const historyBeforeCurrent = excludeCurrentMessageFromHistory(history, request);
  const historyMessages = buildHistoryMessages(historyBeforeCurrent, resolveRecentTurnLimit(policy));

  return {
    currentQuery,
    currentInput: buildCurrentInput(request),
    historySummary: { summary: null },
    historyContext: {
      messages: historyMessages
    },
    contextVersion: 2
  };
}

function toPromptBlocks({ policy, history, request, orchestratorResult }) {
  const resolved = orchestratorResult;
  const blocks = [];
  blocks.push({
    block_type: 'system',
    order: 1,
    content: {
      safety: 'no_fabrication',
      mode: 'chat_completions'
    }
  });
  blocks.push({
    block_type: 'developer',
    order: 2,
    content: {
      orchestration: 'orchestrator_llm',
      llm_enabled: true
    }
  });
  blocks.push({
    block_type: 'session_meta',
    order: 3,
    content: {
      lang: 'zh',
      turnKind: String(resolved?.kind || '').trim() || null
    }
  });
  blocks.push({
    block_type: 'history',
    order: 4,
    content: history
  });
  blocks.push({
    block_type: 'tool_context',
    order: 5,
    content: {
      orchestrator: resolved
    }
  });
  blocks.push({
    block_type: 'current_user',
    order: 6,
    content: {
      text: String(request?.message?.text || ''),
      attachments: Array.isArray(request?.message?.attachments) ? request.message.attachments : []
    }
  });
  blocks.push({
    block_type: 'budget',
    order: 7,
    content: {
      max_input_tokens: policy.maxTokens
    }
  });
  return blocks;
}

async function ensureContainer(request, transaction) {
  const channelType = String(request?.channel?.type || '').trim().toLowerCase();
  const userId = String(request?.user?.id || '').trim();
  const conversationId = String(request?.channel?.conversationId || '').trim();
  const containerKey = buildContainerKey(request);

  const [rows] = await postgresqlSequelize.query(
    `INSERT INTO conversation_containers (
       channel_type, user_id, conversation_id, container_key, metadata, created_at, updated_at
     ) VALUES (
       :channelType, :userId, :conversationId, :containerKey, CAST(:metadata AS jsonb), NOW(), NOW()
     )
     ON CONFLICT (container_key)
     DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    {
      replacements: {
        channelType,
        userId,
        conversationId,
        containerKey,
        metadata: JSON.stringify({})
      },
      transaction
    }
  );
  return rows[0];
}

async function getLatestInstanceNo(containerId, transaction) {
  const [rows] = await postgresqlSequelize.query(
    `SELECT COALESCE(MAX(instance_no), 0) AS max_no
       FROM conversation_instances
      WHERE container_id = :containerId`,
    {
      replacements: { containerId },
      transaction
    }
  );
  return Number(rows[0]?.max_no || 0);
}

async function getActiveInstanceForUpdate(containerId, transaction) {
  const [rows] = await postgresqlSequelize.query(
    `SELECT *
       FROM conversation_instances
      WHERE container_id = :containerId
        AND status = 'active'
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE`,
    {
      replacements: { containerId },
      transaction
    }
  );
  return rows[0] || null;
}

async function getInstanceByIdForUpdate(instanceId, transaction) {
  const [rows] = await postgresqlSequelize.query(
    `SELECT *
       FROM conversation_instances
      WHERE id = :id
      LIMIT 1
      FOR UPDATE`,
    {
      replacements: { id: instanceId },
      transaction
    }
  );
  return rows[0] || null;
}

async function createInstance(containerId, instanceNo, transaction) {
  const [rows] = await postgresqlSequelize.query(
    `INSERT INTO conversation_instances (
       container_id, instance_no, status, turn_count, token_count, version,
       last_message_at, metadata, created_at, updated_at
     ) VALUES (
       :containerId, :instanceNo, 'active', 0, 0, 0, NULL, CAST(:metadata AS jsonb), NOW(), NOW()
     )
     RETURNING *`,
    {
      replacements: {
        containerId,
        instanceNo,
        metadata: JSON.stringify({})
      },
      transaction
    }
  );
  return rows[0];
}

async function resolveActiveInstance(container, request, policy, transaction) {
  const active = await getActiveInstanceForUpdate(container.id, transaction);
  const rolloverReason = getRolloverReason(active, request, policy);
  if (!active || rolloverReason) {
    const previousInstanceNo = active ? Number(active.instance_no || 0) : null;
    if (active) {
      await postgresqlSequelize.query(
        `UPDATE conversation_instances
            SET status = 'archived',
                archived_at = NOW(),
                updated_at = NOW(),
                version = version + 1
          WHERE id = :id`,
        { replacements: { id: active.id }, transaction }
      );
    }
    const nextNo = (await getLatestInstanceNo(container.id, transaction)) + 1;
    const instance = await createInstance(container.id, nextNo, transaction);
    return {
      instance,
      createdNewInstance: true,
      rolloverReason: rolloverReason || 'no_active_instance',
      previousInstanceNo
    };
  }
  return {
    instance: active,
    createdNewInstance: false,
    rolloverReason: null,
    previousInstanceNo: Number(active.instance_no || 0)
  };
}

async function loadHistory(instanceId, turns, transaction, options = {}) {
  const turnLimit = Math.max(1, Math.floor(Number(turns || 5)));
  const excludeMessageId = String(options?.excludeMessageId || '').trim();
  const [rows] = await postgresqlSequelize.query(
    `WITH eligible AS (
       SELECT id,
              message_id,
              role,
              message_type,
              content,
              attachments,
              created_at,
              CASE
                WHEN role = 'assistant' AND message_type = 'orchestrator' THEN payload->'rawMessage'
                ELSE NULL
              END AS payload_raw_message,
              CASE
                WHEN role = 'assistant' AND message_type = 'orchestrator' THEN payload->'toolCalls'
                ELSE NULL
              END AS payload_tool_calls,
              CASE
                WHEN role = 'assistant' AND message_type = 'orchestrator' THEN payload->>'content'
                ELSE NULL
              END AS payload_content,
              CASE
                WHEN role = 'tool' OR message_type = 'tool' THEN COALESCE(payload->>'toolCallId', payload->>'tool_call_id')
                ELSE NULL
              END AS payload_tool_call_id,
              CASE
                WHEN role = 'tool' OR message_type = 'tool' THEN payload->>'status'
                ELSE NULL
              END AS payload_status
         FROM conversation_messages
        WHERE instance_id = :instanceId
          AND (:excludeMessageId = '' OR message_id <> :excludeMessageId)
     ),
     selected_turns AS (
       SELECT id
         FROM eligible
        WHERE role = 'user'
        ORDER BY created_at DESC, id DESC
        LIMIT :turnLimit
     ),
     cutoff AS (
       SELECT MIN(id) AS min_id FROM selected_turns
     )
     SELECT message_id,
            role,
            message_type,
            content,
            attachments,
            created_at,
            payload_raw_message,
            payload_tool_calls,
            payload_content,
            payload_tool_call_id,
            payload_status
       FROM eligible
      WHERE (SELECT min_id FROM cutoff) IS NULL
         OR id >= (SELECT min_id FROM cutoff)
      ORDER BY created_at ASC, id ASC`,
    {
      replacements: { instanceId, turnLimit, excludeMessageId },
      transaction
    }
  );
  return rows;
}

async function prepareConversationContext(request, options = {}) {
  const policy = getPolicy();
  const hintedInstanceId = Number(options?.instanceId || 0);
  const traceId = String(request?.traceId || '');
  const requestId = String(request?.requestId || '');
  const txStartedAt = Date.now();
  prepareLog('tx:begin', { traceId, requestId, hintedInstanceId });
  return postgresqlSequelize.transaction(async (transaction) => {
    try {
      await postgresqlSequelize.query(
        "SET LOCAL statement_timeout = '5s'; SET LOCAL lock_timeout = '2s';",
        { transaction }
      );
      prepareLog('tx:timeouts_set', { traceId, requestId, statementTimeout: '5s', lockTimeout: '2s' });
    } catch (error) {
      prepareError('tx:timeouts_set_failed', error, { traceId, requestId });
    }

    let stepStartedAt = Date.now();
    prepareLog('ensureContainer:start', { traceId, requestId });
    const container = await ensureContainer(request, transaction);
    prepareLog('ensureContainer:done', { traceId, requestId, containerId: Number(container?.id || 0), costMs: Date.now() - stepStartedAt });

    let activeResolution = null;
    let instance = null;
    if (Number.isFinite(hintedInstanceId) && hintedInstanceId > 0) {
      stepStartedAt = Date.now();
      prepareLog('getInstanceByIdForUpdate:start', { traceId, requestId, hintedInstanceId });
      instance = await getInstanceByIdForUpdate(hintedInstanceId, transaction);
      prepareLog('getInstanceByIdForUpdate:done', { traceId, requestId, hintedInstanceId, instanceId: Number(instance?.id || 0), costMs: Date.now() - stepStartedAt });
      if (!instance) {
        throw new Error(`conversation instance not found: ${hintedInstanceId}`);
      }
      if (Number(instance.container_id) !== Number(container.id)) {
        throw new Error(`conversation instance container mismatch: ${hintedInstanceId}`);
      }
      activeResolution = {
        instance,
        createdNewInstance: Boolean(options?.activeResolutionHint?.createdNewInstance),
        rolloverReason: options?.activeResolutionHint?.rolloverReason || null,
        previousInstanceNo: options?.activeResolutionHint?.previousInstanceNo ?? Number(instance.instance_no || 0)
      };
    } else {
      stepStartedAt = Date.now();
      prepareLog('resolveActiveInstance:start', { traceId, requestId });
      activeResolution = await resolveActiveInstance(container, request, policy, transaction);
      prepareLog('resolveActiveInstance:done', {
        traceId,
        requestId,
        instanceId: Number(activeResolution?.instance?.id || 0),
        createdNewInstance: Boolean(activeResolution?.createdNewInstance),
        rolloverReason: activeResolution?.rolloverReason || null,
        costMs: Date.now() - stepStartedAt
      });
      instance = activeResolution.instance;
    }
    const idempotencyKey = buildIdempotencyKey(request);
    stepStartedAt = Date.now();
    prepareLog('loadHistory:start', { traceId, requestId, instanceId: Number(instance?.id || 0), historyTurns: policy.historyTurns });
    const history = await loadHistory(instance.id, policy.historyTurns, transaction, {
      excludeMessageId: request?.message?.externalMessageId
    });
    prepareLog('loadHistory:done', {
      traceId,
      requestId,
      instanceId: Number(instance?.id || 0),
      historyCount: Array.isArray(history) ? history.length : 0,
      firstMessageAt: Array.isArray(history) && history[0] ? history[0].created_at || null : null,
      lastMessageAt: Array.isArray(history) && history[history.length - 1] ? history[history.length - 1].created_at || null : null,
      costMs: Date.now() - stepStartedAt
    });
    stepStartedAt = Date.now();
    prepareLog('buildContextEnvelope:start', { traceId, requestId, instanceId: Number(instance?.id || 0) });
    const contextEnvelope = buildContextEnvelope({ request, history, policy });
    prepareLog('buildContextEnvelope:done', { traceId, requestId, instanceId: Number(instance?.id || 0), costMs: Date.now() - stepStartedAt });
    logContextEnvelopeDebug(request, contextEnvelope);
    prepareLog('tx:commit_ready', { traceId, requestId, totalCostMs: Date.now() - txStartedAt });
    return {
      container,
      instance,
      activeResolution,
      history,
      policy,
      contextEnvelope,
      idempotencyKey
    };
  }).then((result) => {
    prepareLog('tx:commit', { traceId, requestId, totalCostMs: Date.now() - txStartedAt });
    return result;
  }).catch((error) => {
    prepareError('tx:rollback', error, { traceId, requestId, totalCostMs: Date.now() - txStartedAt });
    throw error;
  });
}

async function resolveConversationTarget(request) {
  const policy = getPolicy();
  const language = resolveAgentLng(request?.context?.lang);
  const hintedInstanceId = Number(
    request?.session?.instanceId
    || request?.context?.instanceId
    || 0
  );
  return postgresqlSequelize.transaction(async (transaction) => {
    const container = await ensureContainer(request, transaction);
    let activeResolution = null;
    let instance = null;
    if (Number.isFinite(hintedInstanceId) && hintedInstanceId > 0) {
      instance = await getInstanceByIdForUpdate(hintedInstanceId, transaction);
      if (!instance) {
        throw new Error(`conversation instance not found: ${hintedInstanceId}`);
      }
      if (Number(instance.container_id) !== Number(container.id)) {
        throw new Error(`conversation instance container mismatch: ${hintedInstanceId}`);
      }
      const hintedStatus = String(instance.status || '').trim().toLowerCase();
      const hintedRolloverReason = hintedStatus !== 'active'
        ? 'archived'
        : getRolloverReason(instance, request, policy);
      if (hintedRolloverReason) {
        const err = new Error(buildInactiveInstanceNotice(hintedRolloverReason, policy, language));
        err.code = 'INSTANCE_INACTIVE';
        err.instanceStatus = hintedStatus || 'archived';
        err.rolloverReason = hintedRolloverReason;
        throw err;
      }
      activeResolution = {
        instance,
        createdNewInstance: false,
        rolloverReason: null,
        previousInstanceNo: Number(instance.instance_no || 0)
      };
    } else {
      activeResolution = await resolveActiveInstance(container, request, policy, transaction);
      instance = activeResolution.instance;
    }
    return {
      container,
      instance,
      activeResolution,
      idempotencyKey: buildIdempotencyKey(request),
      policy
    };
  });
}

async function persistUserMessageAtTurn({ request, instanceId, taskId }) {
  const normalizedInstanceId = Number(instanceId || 0);
  if (!Number.isFinite(normalizedInstanceId) || normalizedInstanceId <= 0) {
    throw new Error('instance id is required to persist user message at turn');
  }
  const persistTaskId = normalizePersistTaskId(taskId);
  const idempotencyKey = buildIdempotencyKey(request);

  return postgresqlSequelize.transaction(async (transaction) => {
    const instance = await getInstanceByIdForUpdate(normalizedInstanceId, transaction);
    if (!instance) {
      throw new Error(`conversation instance not found: ${normalizedInstanceId}`);
    }

    const userMessageInsert = await messageService.saveUser({
      instanceId: normalizedInstanceId,
      request,
      idempotencyKey,
      taskId: persistTaskId,
      transaction
    });

    await bumpInstanceStats(normalizedInstanceId, request, userMessageInsert?.inserted, transaction);
    return {
      instanceId: normalizedInstanceId,
      idempotencyKey
    };
  });
}

async function bumpInstanceStats(instanceId, request, inserted, transaction) {
  if (!inserted) return;
  await postgresqlSequelize.query(
    `UPDATE conversation_instances
        SET turn_count = turn_count + :turnDelta,
            last_message_at = TO_TIMESTAMP(:sentAt / 1000.0),
            version = version + 1,
            updated_at = NOW()
      WHERE id = :id`,
    {
      replacements: {
        id: instanceId,
        turnDelta: 1,
        sentAt: Number(request?.message?.sentAt || Date.now())
      },
      transaction
    }
  );
}

async function bumpInstanceTokenUsage(instanceId, tokenDelta, transaction) {
  const delta = Number(tokenDelta || 0);
  if (!Number.isFinite(delta) || delta <= 0) return;
  await postgresqlSequelize.query(
    `UPDATE conversation_instances
        SET token_count = token_count + :tokenDelta,
            version = version + 1,
            updated_at = NOW()
      WHERE id = :id`,
    {
      replacements: {
        id: instanceId,
        tokenDelta: delta
      },
      transaction
    }
  );
}

async function applyTurnTokenUsage(instanceId, loopTrace, transaction) {
  const tokenDelta = extractTokenUsageFromLoopTrace(loopTrace);
  await bumpInstanceTokenUsage(instanceId, tokenDelta, transaction);
  return tokenDelta;
}

function normalizePersistTaskId(value) {
  const text = String(value || '').trim();
  return text || undefined;
}

async function persistOrchestratorTraceEntry(instanceId, request, traceEntry, contextEnvelope, transaction, taskId) {
  const suffix = String(traceEntry?.suffix || '').trim();
  if (!suffix) return { inserted: false, row: null };

  const orchestratorResult = asPlainObject(traceEntry.turnResult);
  const key = buildEventIdempotencyKey(request, suffix);
  const payload = {
    ...sanitizePersistedPayload(orchestratorResult),
    context: {
      currentInput: sanitizePersistedPayload(contextEnvelope?.currentInput)
    }
  };
  const messageInput = buildConversationMessageInput({
    instanceId,
    messageId: buildMessageId(request, suffix),
    requestId: String(request?.requestId || '').trim() || undefined,
    traceId: String(request?.traceId || '').trim() || undefined,
    taskId: normalizePersistTaskId(taskId),
    role: 'assistant',
    explicitMessageType: MESSAGE_TYPES.ORCHESTRATOR,
    content: null,
    payload,
    attachments: [],
    idempotencyKey: key
  });
  return messageService.saveRaw({
    conversationMessageInput: messageInput,
    transaction
  });
}

async function persistToolTraceEntry(instanceId, request, traceEntry, transaction, taskId) {
  const suffix = String(traceEntry?.suffix || '').trim();
  const toolResult = asPlainObject(traceEntry.toolResult);
  if (!suffix || !toolResult.status) return { inserted: false, row: null };

  const key = buildEventIdempotencyKey(request, suffix);
  const messageInput = buildConversationMessageInput({
    instanceId,
    messageId: buildMessageId(request, suffix),
    requestId: String(request?.requestId || '').trim() || undefined,
    traceId: String(request?.traceId || '').trim() || undefined,
    taskId: normalizePersistTaskId(taskId),
    role: 'tool',
    explicitMessageType: MESSAGE_TYPES.TOOL,
    content: String(traceEntry.content || '').trim() || null,
    payload: sanitizePersistedPayload({
      ...toolResult,
      toolCallId: traceEntry.toolCallId || null,
      toolName: traceEntry.toolName || null
    }),
    attachments: [],
    idempotencyKey: key
  });
  return messageService.saveRaw({
    conversationMessageInput: messageInput,
    transaction
  });
}

async function persistAssistantStructuredEvent(instanceId, request, loopTrace, assistantResponse, transaction, taskId) {
  const suffix = EVENT_SUFFIX.ASSISTANT_FINAL;
  const key = buildEventIdempotencyKey(request, suffix);
  const text = String(assistantResponse?.text || '').trim() || 'assistant_reply';
  const attachments = Array.isArray(assistantResponse?.attachments) ? assistantResponse.attachments : [];
  const explicitMessageType = resolveDialogueMessageType({ content: text, attachments });
  const orchestratorEntries = Array.isArray(loopTrace)
    ? loopTrace.filter((entry) => entry?.kind === 'orchestrator')
    : [];
  const lastOrchestrator = orchestratorEntries[orchestratorEntries.length - 1] || null;
  const toolTraces = Array.isArray(assistantResponse?.toolTraces)
    ? assistantResponse.toolTraces
    : projectToolTracesFromLoopTrace(loopTrace);

  const messageInput = buildConversationMessageInput({
    instanceId,
    messageId: buildMessageId(request, suffix),
    requestId: String(request?.requestId || '').trim() || undefined,
    traceId: String(request?.traceId || '').trim() || undefined,
    taskId: normalizePersistTaskId(taskId),
    role: 'assistant',
    explicitMessageType,
    content: text,
    payload: sanitizePersistedPayload({
      mode: String(assistantResponse?.mode || '').trim() || 'llm_response',
      loopSteps: orchestratorEntries.length,
      finishReason: lastOrchestrator?.turnResult?.finishReason || null,
      turnResult: asPlainObject(lastOrchestrator?.turnResult),
      response: asPlainObject(assistantResponse),
      toolTraces
    }),
    attachments,
    idempotencyKey: key
  });
  return messageService.saveRaw({
    conversationMessageInput: messageInput,
    transaction
  });
}

function shouldPersistAssistantStructuredEvent(assistantResponse) {
  const mode = String(assistantResponse?.mode || '').trim().toLowerCase();
  const deliveryHint = String(asPlainObject(assistantResponse?.debugMeta).deliveryHint || '').trim().toLowerCase();
  if (deliveryHint === 'system_action_card') return false;
  if (mode === 'direct_response') return false;
  return true;
}

async function persistErrorRuntimeEvent(instanceId, request, errorRuntime, transaction, taskId) {
  const suffix = EVENT_SUFFIX.ERROR_RUNTIME;
  const key = buildEventIdempotencyKey(request, suffix);
  const payload = sanitizePersistedPayload(errorRuntime);
  const text = String(payload.message || 'Agent 内部异常').trim();
  const messageInput = buildConversationMessageInput({
    instanceId,
    messageId: buildMessageId(request, suffix),
    requestId: String(request?.requestId || '').trim() || undefined,
    traceId: String(request?.traceId || '').trim() || undefined,
    taskId: normalizePersistTaskId(taskId),
    role: 'assistant',
    explicitMessageType: MESSAGE_TYPES.ERROR,
    content: text,
    payload,
    attachments: [],
    idempotencyKey: key
  });
  return messageService.saveRaw({
    conversationMessageInput: messageInput,
    transaction
  });
}

async function persistLoopTrace({
  instanceId,
  request,
  loopTrace,
  contextEnvelope,
  assistantResponse,
  errorRuntime,
  transaction,
  taskId
}) {
  const trace = Array.isArray(loopTrace) ? loopTrace : [];
  for (const entry of trace) {
    if (entry?.kind === 'orchestrator') {
      if (!shouldPersistClosedOrchestratorEntry(entry, trace)) {
        continue;
      }
      await persistOrchestratorTraceEntry(instanceId, request, entry, contextEnvelope, transaction, taskId);
      continue;
    }
    if (entry?.kind === 'tool') {
      await persistToolTraceEntry(instanceId, request, entry, transaction, taskId);
    }
  }
  if (shouldPersistAssistantStructuredEvent(assistantResponse)) {
    await persistAssistantStructuredEvent(instanceId, request, trace, assistantResponse, transaction, taskId);
  }
  if (errorRuntime && typeof errorRuntime === 'object') {
    await persistErrorRuntimeEvent(instanceId, request, errorRuntime, transaction, taskId);
  }
}

function mergeActiveResolution(primary, fallback) {
  const a = asPlainObject(primary);
  const b = asPlainObject(fallback);
  if (a.createdNewInstance) {
    return {
      createdNewInstance: true,
      rolloverReason: a.rolloverReason || b.rolloverReason || null,
      previousInstanceNo: a.previousInstanceNo ?? b.previousInstanceNo ?? null
    };
  }
  return {
    createdNewInstance: Boolean(b.createdNewInstance || a.createdNewInstance),
    rolloverReason: b.rolloverReason || a.rolloverReason || null,
    previousInstanceNo: b.previousInstanceNo ?? a.previousInstanceNo ?? null
  };
}

function buildSystemMessages({ assistantResponse, instanceNotice, language = 'zh' }) {
  const t = getAgentFixedT(language);
  const messages = [];
  const text = String(assistantResponse?.text || '').trim();
  const assistantMode = String(assistantResponse?.mode || '').trim().toLowerCase();
  const deliveryHint = String(asPlainObject(assistantResponse?.debugMeta).deliveryHint || '').trim().toLowerCase();
  const notice = String(instanceNotice || '').trim();

  if (notice) {
    messages.push({
      kind: 'instance_rollover',
      title: t('shared.agent.session.systemMessages.instanceRolloverTitle'),
      text: notice,
      presentation: 'action_card'
    });
  }

  if (deliveryHint === 'system_action_card' || assistantMode === 'direct_response') {
    if (text) {
      messages.push({
        kind: 'direct_response',
        title: t('shared.agent.session.systemMessages.directResponseTitle'),
        text,
        presentation: 'action_card'
      });
    }
  }

  return messages;
}

function buildSystemMessageEventPayload(message, assistantResponse = null) {
  const item = asPlainObject(message);
  const response = asPlainObject(assistantResponse);
  const debugMeta = asPlainObject(response.debugMeta);
  return sanitizePersistedPayload({
    kind: String(item.kind || 'system').trim() || 'system',
    title: String(item.title || '系统提示').trim() || '系统提示',
    text: String(item.text || '').trim(),
    presentation: String(item.presentation || 'action_card').trim().toLowerCase() || 'action_card',
    assistantMode: String(response.mode || '').trim() || null,
    deterministicRule: String(debugMeta.deterministicRule || '').trim() || null,
    deliveryHint: String(debugMeta.deliveryHint || '').trim() || null,
    details: asPlainObject(debugMeta.details)
  });
}

async function persistSystemMessageEvents(instanceId, request, systemMessages, transaction, taskId, assistantResponse = null) {
  const list = Array.isArray(systemMessages) ? systemMessages : [];
  for (let i = 0; i < list.length; i += 1) {
    const message = list[i];
    const text = String(message?.text || '').trim();
    if (!text) continue;
    const suffix = buildSystemMessageSuffix(i + 1);
    const messageInput = buildConversationMessageInput({
      instanceId,
      messageId: buildMessageId(request, suffix),
      requestId: String(request?.requestId || '').trim() || undefined,
      traceId: String(request?.traceId || '').trim() || undefined,
      taskId: normalizePersistTaskId(taskId),
      role: 'system',
      explicitMessageType: MESSAGE_TYPES.SYSTEM,
      content: text,
      payload: buildSystemMessageEventPayload(message, assistantResponse),
      attachments: [],
      idempotencyKey: buildEventIdempotencyKey(request, suffix)
    });
    await messageService.saveRaw({
      conversationMessageInput: messageInput,
      transaction
    });
  }
}

async function persistSystemMessage({
  instanceId,
  request,
  systemMessage,
  taskId,
  transaction = null,
  assistantResponse = null
}) {
  const normalizedInstanceId = Number(instanceId || 0);
  if (!Number.isFinite(normalizedInstanceId) || normalizedInstanceId <= 0) {
    throw new Error('instance id is required to persist system message');
  }

  const run = async (tx) => persistSystemMessageEvents(
    normalizedInstanceId,
    request,
    [systemMessage],
    tx,
    taskId,
    assistantResponse
  );

  if (transaction) return run(transaction);
  return postgresqlSequelize.transaction(run);
}

async function processConversationRequest({
  request,
  loopTrace,
  contextEnvelope,
  activeResolutionHint,
  assistantResponse,
  taskId,
  errorRuntime = null
}) {
  const policy = getPolicy();
  const language = resolveAgentLng(request?.context?.lang);
  const idempotencyKey = buildIdempotencyKey(request);
  const persistTaskId = normalizePersistTaskId(taskId);
  const orchestratorEntries = Array.isArray(loopTrace)
    ? loopTrace.filter((entry) => entry?.kind === 'orchestrator')
    : [];
  const lastOrchestratorResult = orchestratorEntries[orchestratorEntries.length - 1]?.turnResult || null;

  return postgresqlSequelize.transaction(async (transaction) => {
    const container = await ensureContainer(request, transaction);
    let instance = null;
    let effectiveResolution = null;
    const hintedInstanceId = Number(activeResolutionHint?.instance?.id || activeResolutionHint?.instanceId || 0);
    if (Number.isFinite(hintedInstanceId) && hintedInstanceId > 0) {
      const [rows] = await postgresqlSequelize.query(
        `SELECT *
           FROM conversation_instances
          WHERE id = :id
          LIMIT 1
          FOR UPDATE`,
        {
          replacements: { id: hintedInstanceId },
          transaction
        }
      );
      instance = rows[0] || null;
      if (!instance) {
        throw new Error(`conversation instance not found: ${hintedInstanceId}`);
      }
      effectiveResolution = {
        createdNewInstance: Boolean(activeResolutionHint?.createdNewInstance),
        rolloverReason: activeResolutionHint?.rolloverReason || null,
        previousInstanceNo: activeResolutionHint?.previousInstanceNo ?? null
      };
    } else {
      const activeResolution = await resolveActiveInstance(container, request, policy, transaction);
      instance = activeResolution.instance;
      effectiveResolution = mergeActiveResolution(activeResolution, activeResolutionHint);
    }

    const userMsg = normalizeMessagePayload(request);

    await persistLoopTrace({
      instanceId: instance.id,
      request,
      loopTrace,
      contextEnvelope,
      assistantResponse,
      errorRuntime,
      transaction,
      taskId: persistTaskId
    });
    await applyTurnTokenUsage(instance.id, loopTrace, transaction);

    const history = await loadHistory(instance.id, policy.historyTurns, transaction);
    const instanceNotice = buildInstanceNotice(effectiveResolution, policy, language);
    const systemMessages = buildSystemMessages({ assistantResponse, instanceNotice, language });
    await persistSystemMessageEvents(
      instance.id,
      request,
      systemMessages,
      transaction,
      persistTaskId,
      assistantResponse
    );
    const promptBlocks = toPromptBlocks({
      policy,
      history,
      request,
      orchestratorResult: lastOrchestratorResult
    });

    return {
      ok: true,
      trace_id: request.traceId,
      request_id: request.requestId,
      idempotency_key: idempotencyKey,
      container: {
        id: container.id,
        channel_type: container.channel_type,
        user_id: container.user_id,
        conversation_id: container.conversation_id,
        container_key: container.container_key
      },
      instance: {
        id: instance.id,
        instance_no: instance.instance_no,
        status: instance.status,
        created_new: Boolean(effectiveResolution.createdNewInstance),
        rollover_reason: effectiveResolution.rolloverReason || null,
        notice: instanceNotice,
        previous_instance_no: effectiveResolution.previousInstanceNo,
        turn_count: Number(instance.turn_count || 0),
        token_count: Number(instance.token_count || 0),
        version: Number(instance.version || 0) + 1
      },
      session: {
        conversationId: String(container.conversation_id || ''),
        instanceId: Number(instance.id)
      },
      assistant_mode: String(assistantResponse?.mode || '').trim() || 'llm_response',
      delivery_hint: String(asPlainObject(assistantResponse?.debugMeta).deliveryHint || '').trim() || null,
      system_messages: systemMessages,
      current_input: userMsg,
      text: String(assistantResponse?.text || '').trim(),
      attachments: Array.isArray(assistantResponse?.attachments) ? assistantResponse.attachments : [],
      toolTraces: Array.isArray(assistantResponse?.toolTraces)
        ? assistantResponse.toolTraces
        : projectToolTracesFromLoopTrace(loopTrace),
      history,
      context_envelope: contextEnvelope ? {
        currentQuery: String(contextEnvelope?.currentQuery || ''),
        currentInput: {
          messageId: String(contextEnvelope?.currentInput?.messageId || '').trim() || null,
          attachments: Array.isArray(contextEnvelope?.currentInput?.attachments) ? contextEnvelope.currentInput.attachments : [],
          assetIds: Array.isArray(contextEnvelope?.currentInput?.assetIds) ? contextEnvelope.currentInput.assetIds : []
        },
        historySummary: asPlainObject(contextEnvelope.historySummary),
        historyContext: {
          messages: Array.isArray(contextEnvelope?.historyContext?.messages)
            ? contextEnvelope.historyContext.messages
            : []
        },
        instance: {
          notice: instanceNotice
        },
        contextVersion: Number(contextEnvelope.contextVersion || 2)
      } : null,
      orchestrator: lastOrchestratorResult,
      llm_raw: {
        orchestrator_extraction: sanitizePersistedPayload(asPlainObject(lastOrchestratorResult).llmRaw) || null,
        tool_execution: sanitizePersistedPayload(
          asPlainObject(assistantResponse?.debugMeta).toolExecution?.llmRaw
            || asPlainObject(assistantResponse?.debugMeta).smartSearch?.llmRaw
        )
          || null
      },
      prompt_blocks: promptBlocks,
      policy
    };
  });
}

module.exports = {
  buildContainerKey,
  buildIdempotencyKey,
  buildMessageId,
  buildContextEnvelope,
  resolveConversationTarget,
  persistUserMessageAtTurn,
  prepareConversationContext,
  processConversationRequest,
  persistSystemMessage
};
