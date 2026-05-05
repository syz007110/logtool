const { postgresqlSequelize } = require('../../config/postgresql');
const { buildConversationMessageInput } = require('./conversationMessageMapper');
const { createMessageService } = require('./messageService');

const messageService = createMessageService();

function nowTs() {
  return new Date();
}

function buildContainerKey(request) {
  const channel = String(request?.channel?.type || '').trim().toLowerCase();
  const userId = String(request?.user?.id || '').trim();
  const conversationId = String(request?.channel?.conversationId || '').trim();
  return `${channel}:${userId}:${conversationId}`;
}

function buildIdempotencyKey(request) {
  const channel = String(request?.channel?.type || '').trim().toLowerCase();
  const userId = String(request?.user?.id || '').trim();
  const conversationId = String(request?.channel?.conversationId || '').trim();
  const messageId = String(request?.message?.id || '').trim();
  return `${channel}:${userId}:${conversationId}:${messageId}`;
}

function estimateTokens(input) {
  const text = String(input || '');
  // lightweight estimate: ~4 chars per token
  return Math.max(1, Math.ceil(text.length / 4));
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
    const recentTurns = Array.isArray(contextEnvelope.recentTurns) ? contextEnvelope.recentTurns : [];
    const recentTurnsPreview = recentTurns.slice(-2).map((turn) => ({
      role: String(turn?.role || ''),
      text: truncateText(turn?.text, 80)
    }));
    console.log('[session-context] envelope', {
      traceId: String(request?.traceId || ''),
      requestId: String(request?.requestId || ''),
      currentQuery: truncateText(contextEnvelope.currentQuery, 120),
      resolvedQuery: truncateText(contextEnvelope.resolvedQuery, 160),
      historySummary: truncateJson(contextEnvelope.historySummary, 200),
      recentTurnsCount: recentTurns.length,
      recentTurnsPreview,
      sessionState: contextEnvelope.sessionState || {},
      contextVersion: Number(contextEnvelope.contextVersion || 1)
    });
  } catch (error) {
    console.warn('[session-context] debug log failed:', error?.message || error);
  }
}

function getPolicy() {
  return {
    maxTurns: Number.parseInt(process.env.SESSION_MAX_TURNS || '20', 10) || 20,
    idleTimeoutMinutes: Number.parseInt(process.env.SESSION_IDLE_TIMEOUT_MINUTES || '30', 10) || 30,
    maxTokens: Number.parseInt(process.env.SESSION_MAX_TOKENS || '6000', 10) || 6000,
    historyTurns: Number.parseInt(process.env.SESSION_CONTEXT_HISTORY_TURNS || '5', 10) || 5
  };
}

function shouldForceNew(request) {
  const txt = String(request?.message?.text || '').trim().toLowerCase();
  return txt === '/new';
}

function getRolloverReason(instance, request, policy) {
  if (!instance) return 'no_active_instance';
  if (shouldForceNew(request)) return 'force_new_command';
  if (Number(instance.turn_count || 0) >= policy.maxTurns) return 'max_turns';

  const sentAt = Number(request?.message?.sentAt || Date.now());
  const lastAt = instance.last_message_at ? new Date(instance.last_message_at).getTime() : null;
  if (lastAt && sentAt - lastAt > policy.idleTimeoutMinutes * 60 * 1000) return 'idle_timeout';

  const est = estimateTokens(request?.message?.text || '');
  if (Number(instance.token_count || 0) + est > policy.maxTokens) return 'max_tokens';
  return null;
}

function normalizeMessagePayload(request) {
  return {
    id: request?.message?.id,
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

function normalizeHistoryText(row) {
  const direct = String(row?.content || '').trim();
  if (direct) return direct;
  const payload = asPlainObject(row?.payload);
  return String(payload?.text || '').trim();
}

function extractLastUserQuery(history) {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const row = history[i];
    if (String(row?.role || '') !== 'user') continue;
    const text = normalizeHistoryText(row);
    if (text) return text;
  }
  return '';
}

function extractFaultCode(text) {
  const source = String(text || '').trim();
  if (!source) return '';
  const codeMatch = source.match(/\b(?:0x)?[0-9a-f]{5,6}\b/i);
  if (!codeMatch) return '';
  const normalized = String(codeMatch[0]).toUpperCase();
  return normalized.startsWith('0X') ? normalized : `0X${normalized}`;
}

function createDefaultFilters() {
  return [
    { errorCode: '' },
    { device: '' },
    { Phenomenon: '' },
    { Concept: '' }
  ];
}

function normalizeFilters(filtersInput) {
  const out = createDefaultFilters();
  const mergeItem = (key, value) => {
    const idx = out.findIndex((it) => Object.prototype.hasOwnProperty.call(it, key));
    if (idx < 0) return;
    out[idx][key] = String(value || '').trim();
  };
  if (Array.isArray(filtersInput)) {
    for (const item of filtersInput) {
      const src = asPlainObject(item);
      if (Object.prototype.hasOwnProperty.call(src, 'errorCode')) mergeItem('errorCode', src.errorCode);
      if (Object.prototype.hasOwnProperty.call(src, 'device')) mergeItem('device', src.device);
      if (Object.prototype.hasOwnProperty.call(src, 'Phenomenon')) mergeItem('Phenomenon', src.Phenomenon);
      if (Object.prototype.hasOwnProperty.call(src, 'Concept')) mergeItem('Concept', src.Concept);
    }
    return out;
  }
  const srcObj = asPlainObject(filtersInput);
  if (Object.keys(srcObj).length > 0) {
    mergeItem('errorCode', srcObj.errorCode);
    mergeItem('device', srcObj.device || srcObj.Device);
    mergeItem('Phenomenon', srcObj.Phenomenon || srcObj.phenomenon);
    mergeItem('Concept', srcObj.Concept || srcObj.concept);
  }
  return out;
}

function normalizeSessionState(input = {}) {
  const src = asPlainObject(input);
  const filters = normalizeFilters(src.filters);
  const pendingSlot = src.pendingSlot == null ? null : String(src.pendingSlot).trim() || null;
  return { filters, pendingSlot };
}

function getFilterValue(filters, key) {
  const list = Array.isArray(filters) ? filters : [];
  for (const item of list) {
    const obj = asPlainObject(item);
    if (Object.prototype.hasOwnProperty.call(obj, key)) return String(obj[key] || '').trim();
  }
  return '';
}

function setFilterValue(filters, key, value) {
  const list = Array.isArray(filters) ? filters : [];
  const idx = list.findIndex((item) => Object.prototype.hasOwnProperty.call(asPlainObject(item), key));
  const nextValue = String(value || '').trim();
  if (idx >= 0) {
    list[idx] = { [key]: nextValue };
  } else {
    list.push({ [key]: nextValue });
  }
  return list;
}

function mapRecentTurnRole(row) {
  const role = String(row?.role || '').trim().toLowerCase();
  const messageType = String(row?.message_type || '').trim().toLowerCase();
  const payload = asPlainObject(row?.payload);
  if (role === 'user') return 'user';
  if (role === 'assistant' && messageType === 'json' && payload?.intent) return 'intent';
  if (role === 'assistant') return 'assistant';
  if (role === 'tool') return 'intent';
  return '';
}

function mapRecentTurnText(row) {
  const mappedRole = mapRecentTurnRole(row);
  if (mappedRole === 'intent') return JSON.stringify(asPlainObject(row?.payload));
  return normalizeHistoryText(row);
}

function groupHistoryRounds(history) {
  const rounds = [];
  let current = null;
  for (const row of Array.isArray(history) ? history : []) {
    const role = String(row?.role || '').trim().toLowerCase();
    if (role === 'user') {
      if (current && current.length > 0) rounds.push(current);
      current = [row];
      continue;
    }
    if (!current) continue;
    current.push(row);
  }
  if (current && current.length > 0) rounds.push(current);
  return rounds;
}

function buildRecentTurns(history, maxTurns = 2) {
  const rounds = groupHistoryRounds(history);
  if (!rounds.length) return [];
  const picked = rounds.slice(-Math.max(1, maxTurns)).reverse();
  const out = [];
  for (let i = 0; i < picked.length; i += 1) {
    const turnDistance = i + 1;
    const roundRows = picked[i];
    for (const row of roundRows) {
      const mappedRole = mapRecentTurnRole(row);
      if (!mappedRole) continue;
      const text = mapRecentTurnText(row);
      if (!text) continue;
      out.push({
        role: mappedRole,
        text,
        turn: turnDistance
      });
    }
  }
  return out;
}

function buildHistorySummary(history, recentTurns) {
  const lastRound = (Array.isArray(recentTurns) ? recentTurns : []).filter((t) => Number(t.turn) === 1);
  const assistantTurn = [...lastRound].reverse().find((t) => t.role === 'assistant');
  let lastIntent = null;
  let lastTool = null;
  const historyRows = Array.isArray(history) ? history : [];
  for (let i = historyRows.length - 1; i >= 0; i -= 1) {
    const row = historyRows[i];
    const role = String(row?.role || '').trim().toLowerCase();
    const messageType = String(row?.message_type || '').trim().toLowerCase();
    const payload = asPlainObject(row?.payload);
    const isIntentLike = role === 'tool'
      || (role === 'assistant' && messageType === 'json' && payload?.intent);
    if (!isIntentLike) continue;
    const intent = String(payload?.intent || '').trim();
    const slots = asPlainObject(payload?.slots);
    const smartSearchIntent = asPlainObject(slots?.smartSearchIntent);
    const subIntent = String(smartSearchIntent?.intent || '').trim();
    const toolName = String(payload?.toolCall?.toolName || '').trim();
    if (!lastIntent) lastIntent = subIntent || intent || null;
    if (toolName) {
      lastTool = toolName;
    }
    if (lastIntent && lastTool) break;
  }

  const briefRaw = String(assistantTurn?.text || '').trim();
  const lastResultBrief = briefRaw ? truncateText(briefRaw, 120) : null;
  return { lastIntent, lastTool, lastResultBrief };
}

function buildHistoryContextSummary(history, recentTurns) {
  const list = Array.isArray(recentTurns) ? recentTurns : [];
  const lastUser = [...list].reverse().find((t) => t.role === 'user');
  const lastAssistant = [...list].reverse().find((t) => t.role === 'assistant');
  const userText = String(lastUser?.text || '').trim();
  const assistantText = String(lastAssistant?.text || '').trim();
  if (!userText && !assistantText) return '';
  if (userText && assistantText) {
    return `上一轮用户提到“${truncateText(userText, 50)}”，系统回复“${truncateText(assistantText, 80)}”。`;
  }
  if (userText) return `上一轮用户提到“${truncateText(userText, 80)}”。`;
  return `系统上一轮回复“${truncateText(assistantText, 80)}”。`;
}

function buildCurrentInput(request) {
  const attachments = Array.isArray(request?.message?.attachments) ? request.message.attachments : [];
  const fileIds = Array.from(new Set(
    attachments
      .map((a) => String(a?.fileId || a?.id || '').trim())
      .filter(Boolean)
  ));
  return {
    messageId: String(request?.message?.id || '').trim() || null,
    rawText: String(request?.message?.text || '').trim(),
    attachments,
    fileIds
  };
}

function extractComponentFromText(text) {
  const source = String(text || '').trim();
  if (!source) return null;
  const known = ['模拟器', '患者平台', '医生控制台', '图像平台', '工具臂', '调整臂', '主控制臂', '器械'];
  for (const key of known) {
    if (source.includes(key)) return key;
  }
  return null;
}

function buildConfirmedSlots({ request, sessionState }) {
  const filters = Array.isArray(sessionState?.filters) ? sessionState.filters : [];
  const readFilter = (key) => {
    for (const item of filters) {
      const obj = asPlainObject(item);
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = String(obj[key] || '').trim();
        return value || null;
      }
    }
    return null;
  };
  const currentQuery = String(request?.message?.text || '').trim();
  const extractedFaultCode = extractFaultCode(currentQuery) || null;
  const currentAttachments = Array.isArray(request?.message?.attachments) ? request.message.attachments : [];
  const fileIdSet = new Set();
  const pushFileIdsFrom = (attachments) => {
    for (const item of Array.isArray(attachments) ? attachments : []) {
      const id = String(item?.fileId || item?.id || '').trim();
      if (id) fileIdSet.add(id);
    }
  };
  pushFileIdsFrom(currentAttachments);
  const historyRows = Array.isArray(request?.__historyRows) ? request.__historyRows : [];
  for (const row of historyRows) {
    pushFileIdsFrom(row?.attachments);
    pushFileIdsFrom(asPlainObject(row?.payload)?.attachments);
  }
  const fileIds = Array.from(fileIdSet);
  return {
    errorCode: extractedFaultCode || readFilter('errorCode'),
    device: readFilter('device'),
    phenomenon: readFilter('Phenomenon'),
    concept: readFilter('Concept'),
    component: extractComponentFromText(currentQuery),
    fileIds
  };
}

function buildContextEnvelope({ request, history, sessionState }) {
  const currentQuery = String(request?.message?.text || '').trim();
  const recentTurns = buildRecentTurns(history, 2);
  const mergedSessionState = normalizeSessionState(sessionState);
  const historyUserQuery = extractLastUserQuery(history);
  const currentFaultCode = extractFaultCode(currentQuery);
  const historyFaultCode = extractFaultCode(historyUserQuery);
  if (currentFaultCode) {
    mergedSessionState.filters = setFilterValue(mergedSessionState.filters, 'errorCode', currentFaultCode);
  } else if (!getFilterValue(mergedSessionState.filters, 'errorCode') && historyFaultCode) {
    mergedSessionState.filters = setFilterValue(mergedSessionState.filters, 'errorCode', historyFaultCode);
  }

  return {
    currentInput: buildCurrentInput(request),
    confirmedSlots: buildConfirmedSlots({
      request: { ...request, __historyRows: history },
      sessionState: mergedSessionState
    }),
    historySummary: buildHistorySummary(history, recentTurns),
    historyContext: {
      summary: buildHistoryContextSummary(history, recentTurns),
      recentTurns: recentTurns.map((t) => ({
        role: t.role,
        text: t.text
      }))
    },
    sessionState: mergedSessionState,
    contextVersion: 1
  };
}

const MESSAGE_ID_MAX_LENGTH = 128;

function buildMessageId(request, suffix) {
  const base = String(request?.message?.id || request?.requestId || '').trim() || `msg_${Date.now()}`;
  const normalizedSuffix = String(suffix || '').trim();
  if (!normalizedSuffix) return base.slice(0, MESSAGE_ID_MAX_LENGTH);

  const delimiter = ':';
  const suffixLength = normalizedSuffix.length + delimiter.length;
  const baseMaxLength = Math.max(1, MESSAGE_ID_MAX_LENGTH - suffixLength);
  return `${base.slice(0, baseMaxLength)}${delimiter}${normalizedSuffix}`.slice(0, MESSAGE_ID_MAX_LENGTH);
}

function toPromptBlocks({ policy, history, request, intentResult }) {
  const blocks = [];
  blocks.push({
    block_type: 'system',
    order: 1,
    content: {
      safety: 'no_fabrication',
      mode: 'structured_only'
    }
  });
  blocks.push({
    block_type: 'developer',
    order: 2,
    content: {
      orchestration: 'intent_first',
      llm_enabled: false
    }
  });
  blocks.push({
    block_type: 'session_meta',
    order: 3,
    content: {
      lang: 'zh',
      intent: intentResult?.intent || null
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
      intent: intentResult
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

async function loadHistory(instanceId, turns, transaction) {
  const limit = Math.max(1, Number(turns || 5) * 2);
  const [rows] = await postgresqlSequelize.query(
    `SELECT message_id, role, message_type, content, payload, attachments, created_at
       FROM conversation_messages
      WHERE instance_id = :instanceId
      ORDER BY created_at DESC, id DESC
      LIMIT :limit`,
    {
      replacements: { instanceId, limit },
      transaction
    }
  );
  return rows.reverse();
}

async function prepareConversationContext(request, options = {}) {
  const policy = getPolicy();
  const persistUserMessage = Boolean(options?.persistUserMessage);
  const hintedInstanceId = Number(options?.instanceId || 0);
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
      activeResolution = {
        instance,
        createdNewInstance: Boolean(options?.activeResolutionHint?.createdNewInstance),
        rolloverReason: options?.activeResolutionHint?.rolloverReason || null,
        previousInstanceNo: options?.activeResolutionHint?.previousInstanceNo ?? Number(instance.instance_no || 0)
      };
    } else {
      activeResolution = await resolveActiveInstance(container, request, policy, transaction);
      instance = activeResolution.instance;
    }
    const idempotencyKey = buildIdempotencyKey(request);
    let userMessageInsert = null;
    if (persistUserMessage) {
      userMessageInsert = await messageService.saveUser({
        instanceId: instance.id,
        request,
        idempotencyKey,
        transaction
      });
      await bumpInstanceStats(instance.id, request, userMessageInsert.inserted, transaction);
    }
    const history = await loadHistory(instance.id, policy.historyTurns, transaction);
    const metadata = asPlainObject(instance?.metadata);
    const sessionState = normalizeSessionState(metadata?.session_state);
    const contextEnvelope = buildContextEnvelope({ request, history, sessionState, policy });
    logContextEnvelopeDebug(request, contextEnvelope);
    return {
      container,
      instance,
      activeResolution,
      history,
      policy,
      contextEnvelope,
      idempotencyKey,
      userMessageInsert
    };
  });
}

async function resolveConversationTarget(request) {
  const policy = getPolicy();
  return postgresqlSequelize.transaction(async (transaction) => {
    const container = await ensureContainer(request, transaction);
    const activeResolution = await resolveActiveInstance(container, request, policy, transaction);
    return {
      container,
      instance: activeResolution.instance,
      activeResolution,
      idempotencyKey: buildIdempotencyKey(request),
      policy
    };
  });
}

function buildNextSessionState(prevStateInput, contextEnvelope, intentResult) {
  const prevState = normalizeSessionState(prevStateInput);
  const nextState = normalizeSessionState(contextEnvelope?.sessionState);
  const mergedFilters = normalizeFilters(prevState.filters);
  const nextFilters = normalizeFilters(nextState.filters);
  for (const item of nextFilters) {
    const obj = asPlainObject(item);
    if (Object.prototype.hasOwnProperty.call(obj, 'errorCode') && obj.errorCode) {
      setFilterValue(mergedFilters, 'errorCode', obj.errorCode);
    }
    if (Object.prototype.hasOwnProperty.call(obj, 'device') && obj.device) {
      setFilterValue(mergedFilters, 'device', obj.device);
    }
    if (Object.prototype.hasOwnProperty.call(obj, 'Phenomenon') && obj.Phenomenon) {
      setFilterValue(mergedFilters, 'Phenomenon', obj.Phenomenon);
    }
    if (Object.prototype.hasOwnProperty.call(obj, 'Concept') && obj.Concept) {
      setFilterValue(mergedFilters, 'Concept', obj.Concept);
    }
  }
  nextState.filters = mergedFilters;

  const slots = asPlainObject(intentResult?.slots);
  const slotFilters = asPlainObject(slots.filters);
  if (slots.faultCode) {
    const normalized = String(slots.faultCode).trim().toUpperCase();
    setFilterValue(nextState.filters, 'errorCode', normalized.startsWith('0X') ? normalized : `0X${normalized}`);
  }
  if (slotFilters.errorCode) {
    const normalized = String(slotFilters.errorCode).trim().toUpperCase();
    setFilterValue(nextState.filters, 'errorCode', normalized.startsWith('0X') ? normalized : `0X${normalized}`);
  }
  if (slots.device) {
    setFilterValue(nextState.filters, 'device', slots.device);
  }
  if (slotFilters.device) {
    setFilterValue(nextState.filters, 'device', slotFilters.device);
  }
  if (slots.phenomenon || slots.Phenomenon) {
    setFilterValue(nextState.filters, 'Phenomenon', slots.phenomenon || slots.Phenomenon);
  }
  if (slotFilters.Phenomenon || slotFilters.phenomenon) {
    setFilterValue(nextState.filters, 'Phenomenon', slotFilters.Phenomenon || slotFilters.phenomenon);
  }
  if (slots.concept || slots.Concept) {
    setFilterValue(nextState.filters, 'Concept', slots.concept || slots.Concept);
  }
  if (slotFilters.Concept || slotFilters.concept) {
    setFilterValue(nextState.filters, 'Concept', slotFilters.Concept || slotFilters.concept);
  }
  if (Object.prototype.hasOwnProperty.call(slots, 'pendingSlot')) {
    nextState.pendingSlot = slots.pendingSlot == null ? null : String(slots.pendingSlot).trim() || null;
  }
  return normalizeSessionState(nextState);
}

async function persistSessionState(instanceId, sessionState, transaction) {
  await postgresqlSequelize.query(
    `UPDATE conversation_instances
        SET metadata = jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{session_state}',
              CAST(:sessionState AS jsonb),
              true
            ),
            version = version + 1,
            updated_at = NOW()
      WHERE id = :id`,
    {
      replacements: {
        id: instanceId,
        sessionState: JSON.stringify(normalizeSessionState(sessionState))
      },
      transaction
    }
  );
}

async function bumpInstanceStats(instanceId, request, inserted, transaction) {
  if (!inserted) return;
  const tokenDelta = estimateTokens(request?.message?.text || '');
  await postgresqlSequelize.query(
    `UPDATE conversation_instances
        SET turn_count = turn_count + :turnDelta,
            token_count = token_count + :tokenDelta,
            last_message_at = TO_TIMESTAMP(:sentAt / 1000.0),
            version = version + 1,
            updated_at = NOW()
      WHERE id = :id`,
    {
      replacements: {
        id: instanceId,
        turnDelta: 1,
        tokenDelta,
        sentAt: Number(request?.message?.sentAt || Date.now())
      },
      transaction
    }
  );
}

async function persistIntentEvent(instanceId, request, intentResult, contextEnvelope, transaction) {
  const suffix = 'intent';
  const key = `${buildIdempotencyKey(request)}:${suffix}`;
  const messageId = buildMessageId(request, suffix);
  const requestId = String(request?.requestId || '').trim() || undefined;
  const traceId = String(request?.traceId || '').trim() || undefined;
  const payload = {
    ...asPlainObject(intentResult),
    context: {
      currentInput: asPlainObject(contextEnvelope?.currentInput)
    }
  };
  const messageInput = buildConversationMessageInput({
    instanceId,
    messageId,
    requestId,
    traceId,
    taskId: undefined,
    role: 'assistant',
    explicitMessageType: 'json',
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

async function persistAssistantResponseEvent(instanceId, request, intentResult, assistantResponse, transaction) {
  const suffix = 'assistant_structured';
  const key = `${buildIdempotencyKey(request)}:${suffix}`;
  const text = String(assistantResponse?.text || '').trim() || `intent=${String(intentResult?.intent || 'unknown')}`;
  const attachments = Array.isArray(assistantResponse?.attachments) ? assistantResponse.attachments : [];
  const messageInput = buildConversationMessageInput({
    instanceId,
    messageId: buildMessageId(request, suffix),
    requestId: String(request?.requestId || '').trim() || undefined,
    traceId: String(request?.traceId || '').trim() || undefined,
    taskId: undefined,
    role: 'assistant',
    explicitMessageType: attachments.length > 0 ? 'mixed' : 'text',
    content: text,
    payload: {
      mode: 'llm_response',
      intent: intentResult,
      response: asPlainObject(assistantResponse)
    },
    attachments,
    idempotencyKey: key
  });
  return messageService.saveRaw({
    conversationMessageInput: messageInput,
    transaction
  });
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

async function processConversationRequest({ request, intentResult, contextEnvelope, activeResolutionHint, assistantResponse }) {
  const policy = getPolicy();
  const idempotencyKey = buildIdempotencyKey(request);

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
    await persistIntentEvent(instance.id, request, intentResult, contextEnvelope, transaction);
    await persistAssistantResponseEvent(instance.id, request, intentResult, assistantResponse, transaction);
    const nextSessionState = buildNextSessionState(instance?.metadata?.session_state, contextEnvelope, intentResult);
    await persistSessionState(instance.id, nextSessionState, transaction);

    const history = await loadHistory(instance.id, policy.historyTurns, transaction);
    const promptBlocks = toPromptBlocks({ policy, history, request, intentResult });

    return {
      ok: true,
      mode: 'sync',
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
        previous_instance_no: effectiveResolution.previousInstanceNo,
        turn_count: Number(instance.turn_count || 0),
        token_count: Number(instance.token_count || 0),
        version: Number(instance.version || 0) + 1
      },
      current_input: userMsg,
      text: String(assistantResponse?.text || '').trim(),
      attachments: Array.isArray(assistantResponse?.attachments) ? assistantResponse.attachments : [],
      history,
      context_envelope: contextEnvelope ? {
        currentInput: {
          messageId: String(contextEnvelope?.currentInput?.messageId || '').trim() || null,
          rawText: String(contextEnvelope?.currentInput?.rawText || ''),
          attachments: Array.isArray(contextEnvelope?.currentInput?.attachments) ? contextEnvelope.currentInput.attachments : [],
          fileIds: Array.isArray(contextEnvelope?.currentInput?.fileIds) ? contextEnvelope.currentInput.fileIds : []
        },
        confirmedSlots: asPlainObject(contextEnvelope.confirmedSlots),
        historySummary: asPlainObject(contextEnvelope.historySummary),
        historyContext: {
          summary: String(contextEnvelope?.historyContext?.summary || ''),
          recentTurns: Array.isArray(contextEnvelope?.historyContext?.recentTurns)
            ? contextEnvelope.historyContext.recentTurns
            : []
        },
        contextVersion: Number(contextEnvelope.contextVersion || 1)
      } : null,
      intent: intentResult,
      llm_raw: {
        intent_extraction: asPlainObject(intentResult?.slots).llmRaw || null,
        intent_execution: asPlainObject(assistantResponse?.debugMeta).intentExecution?.llmRaw
          || asPlainObject(assistantResponse?.debugMeta).smartSearch?.llmRaw
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
  buildContextEnvelope,
  resolveConversationTarget,
  prepareConversationContext,
  processConversationRequest
};
