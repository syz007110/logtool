const { postgresqlSequelize } = require('../../config/postgresql');
const { generateUlid } = require('../../utils/idGenerators');
const { normalizeStoredMessageType, isPipelineMessageType } = require('./conversationMessageTypes');
const { getAgentFixedT, resolveAgentLng } = require('../utils/agentI18n');

const WEB_CHANNEL_TYPE = 'web';
const DEFAULT_TITLE = '新对话';

function asPositiveInt(value, fallback) {
  const num = Number.parseInt(value, 10);
  if (Number.isInteger(num) && num > 0) return num;
  return fallback;
}

function truncateTitle(text, maxLength = 40) {
  const normalized = String(text || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return DEFAULT_TITLE;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLength - 1))}…`;
}

function parseAttachments(input) {
  if (Array.isArray(input)) return input;
  if (!input) return [];
  try {
    const parsed = typeof input === 'string' ? JSON.parse(input) : input;
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function isDialogueHistoryRow(row) {
  const role = String(row?.role || '').trim().toLowerCase();
  if (role !== 'user' && role !== 'assistant') return false;
  const messageType = normalizeStoredMessageType(row?.messageType || row?.message_type);
  return !isPipelineMessageType(messageType);
}

function getPolicy() {
  return {
    maxTurns: Number.parseInt(process.env.SESSION_MAX_TURNS || '20', 10) || 20,
    idleTimeoutMinutes: Number.parseInt(process.env.SESSION_IDLE_TIMEOUT_MINUTES || '30', 10) || 30,
    maxTokens: Number.parseInt(process.env.SESSION_MAX_TOKENS || '6000', 10) || 6000
  };
}

function getInstanceContinuationState(instance, policy = getPolicy(), language = 'zh') {
  const t = getAgentFixedT(language);
  const status = String(instance?.status || '').trim().toLowerCase();
  const turnCount = Number(instance?.turn_count || instance?.turnCount || 0);
  const tokenCount = Number(instance?.token_count || instance?.tokenCount || 0);
  const lastMessageAt = instance?.last_message_at || instance?.lastMessageAt || null;

  if (status && status !== 'active') {
    return {
      continuable: false,
      reason: 'archived',
      notice: t('shared.agent.session.inactive.archived')
    };
  }
  if (turnCount >= Number(policy.maxTurns || 20)) {
    return {
      continuable: false,
      reason: 'max_turns',
      notice: t('shared.agent.session.inactive.maxTurns', { maxTurns: Number(policy.maxTurns || 20) })
    };
  }
  if (tokenCount >= Number(policy.maxTokens || 6000)) {
    return {
      continuable: false,
      reason: 'max_tokens',
      notice: t('shared.agent.session.inactive.maxTokens', { maxTokens: Number(policy.maxTokens || 6000) })
    };
  }
  if (lastMessageAt) {
    const lastAtMs = new Date(lastMessageAt).getTime();
    if (Number.isFinite(lastAtMs)) {
      const idleMs = Number(policy.idleTimeoutMinutes || 30) * 60 * 1000;
      if (Date.now() - lastAtMs > idleMs) {
        return {
          continuable: false,
          reason: 'idle_timeout',
          notice: t('shared.agent.session.inactive.idleTimeout', {
            idleTimeoutMinutes: Number(policy.idleTimeoutMinutes || 30)
          })
        };
      }
    }
  }
  return {
    continuable: true,
    reason: null,
    notice: null
  };
}

async function ensureWebConversationContainerForUser(userId, options = {}) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    const err = new Error('userId is required');
    err.code = 'INVALID_ARGUMENT';
    throw err;
  }

  const transaction = options.transaction;
  const [existingRows] = await postgresqlSequelize.query(
    `SELECT *
       FROM conversation_containers
      WHERE channel_type = :channelType
        AND user_id = :userId
      ORDER BY created_at ASC, id ASC
      LIMIT 1
      FOR UPDATE`,
    {
      replacements: {
        channelType: WEB_CHANNEL_TYPE,
        userId: normalizedUserId
      },
      transaction
    }
  );
  if (existingRows[0]) return existingRows[0];

  const conversationId = generateUlid();
  const containerKey = `${WEB_CHANNEL_TYPE}:${normalizedUserId}:${conversationId}`;
  const [insertRows] = await postgresqlSequelize.query(
    `INSERT INTO conversation_containers (
       channel_type, user_id, conversation_id, container_key, metadata, created_at, updated_at
     ) VALUES (
       :channelType, :userId, :conversationId, :containerKey, CAST(:metadata AS jsonb), NOW(), NOW()
     )
     RETURNING *`,
    {
      replacements: {
        channelType: WEB_CHANNEL_TYPE,
        userId: normalizedUserId,
        conversationId,
        containerKey,
        metadata: JSON.stringify({ appScope: 'in_app_agent' })
      },
      transaction
    }
  );
  return insertRows[0];
}

async function resolveWebConversationIdForUser(userId) {
  return postgresqlSequelize.transaction(async (transaction) => {
    const container = await ensureWebConversationContainerForUser(userId, { transaction });
    return String(container?.conversation_id || '').trim();
  });
}

async function listConversationsForUser(userId, options = {}) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return [];

  const limit = Math.min(asPositiveInt(options.limit, 50), 200);
  const [rows] = await postgresqlSequelize.query(
    `WITH container AS (
       SELECT id, conversation_id
         FROM conversation_containers
        WHERE channel_type = :channelType
          AND user_id = :userId
        ORDER BY created_at ASC, id ASC
        LIMIT 1
     ),
     latest_dialogue AS (
       SELECT DISTINCT ON (cm.instance_id)
              cm.instance_id,
              cm.role,
              cm.content,
              cm.created_at
         FROM conversation_messages cm
         JOIN conversation_instances ci ON ci.id = cm.instance_id
         JOIN container c ON c.id = ci.container_id
        WHERE cm.role IN ('user', 'assistant')
          AND cm.message_type IN ('text', 'attachment')
        ORDER BY cm.instance_id, cm.created_at DESC, cm.id DESC
     ),
     first_user AS (
       SELECT DISTINCT ON (cm.instance_id)
              cm.instance_id,
              cm.content
         FROM conversation_messages cm
         JOIN conversation_instances ci ON ci.id = cm.instance_id
         JOIN container c ON c.id = ci.container_id
        WHERE cm.role = 'user'
          AND cm.message_type IN ('text', 'attachment')
        ORDER BY cm.instance_id, cm.created_at ASC, cm.id ASC
     )
     SELECT ci.id AS instance_id,
            ci.instance_no,
            ci.status,
            ci.turn_count,
            ci.token_count,
            ci.created_at,
            ci.updated_at,
            ci.last_message_at,
            c.conversation_id,
            fu.content AS first_user_content,
            ld.content AS latest_content,
            ld.role AS latest_role,
            ld.created_at AS latest_message_at
       FROM conversation_instances ci
       JOIN container c ON c.id = ci.container_id
       LEFT JOIN first_user fu ON fu.instance_id = ci.id
       LEFT JOIN latest_dialogue ld ON ld.instance_id = ci.id
      ORDER BY COALESCE(ci.last_message_at, ld.created_at, ci.created_at) DESC, ci.id DESC
      LIMIT :limit`,
    {
      replacements: {
        channelType: WEB_CHANNEL_TYPE,
        userId: normalizedUserId,
        limit
      }
    }
  );

  return rows.map((row) => {
    const titleSource = String(row.first_user_content || row.latest_content || '').trim();
    return {
      id: String(row.instance_id),
      instanceId: Number(row.instance_id),
      instanceNo: Number(row.instance_no || 0),
      conversationId: String(row.conversation_id || ''),
      status: String(row.status || ''),
      turnCount: Number(row.turn_count || 0),
      tokenCount: Number(row.token_count || 0),
      title: truncateTitle(titleSource),
      createdAt: row.created_at,
      updatedAt: row.last_message_at || row.latest_message_at || row.updated_at || row.created_at,
      latestMessageAt: row.latest_message_at || row.last_message_at || null,
      latestRole: row.latest_role ? String(row.latest_role) : null
    };
  });
}

async function listMessagesForConversation(userId, instanceId, options = {}) {
  const language = resolveAgentLng(options.language);
  const normalizedUserId = String(userId || '').trim();
  const normalizedInstanceId = Number(instanceId || 0);
  if (!normalizedUserId || !Number.isFinite(normalizedInstanceId) || normalizedInstanceId <= 0) {
    const err = new Error('instanceId is required');
    err.code = 'INVALID_ARGUMENT';
    throw err;
  }

  const [rows] = await postgresqlSequelize.query(
    `SELECT cm.id,
            cm.instance_id,
            cm.message_id,
            cm.role,
            cm.message_type,
            cm.content,
            cm.payload,
            cm.attachments,
            cm.created_at,
            cc.conversation_id,
            ci.instance_no,
            ci.status AS instance_status,
            ci.turn_count,
            ci.token_count,
            ci.last_message_at,
            ci.archived_at
       FROM conversation_messages cm
       JOIN conversation_instances ci ON ci.id = cm.instance_id
       JOIN conversation_containers cc ON cc.id = ci.container_id
      WHERE cm.instance_id = :instanceId
        AND cc.channel_type = :channelType
        AND cc.user_id = :userId
      ORDER BY cm.created_at ASC, cm.id ASC`,
    {
      replacements: {
        instanceId: normalizedInstanceId,
        channelType: WEB_CHANNEL_TYPE,
        userId: normalizedUserId
      }
    }
  );

  if (!rows.length) {
    const err = new Error('conversation not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const instanceMeta = rows[0] || {};
  const continuation = getInstanceContinuationState(instanceMeta, getPolicy(), language);

  return {
    conversationId: String(rows[0].conversation_id || ''),
    instanceId: normalizedInstanceId,
    instance: {
      id: normalizedInstanceId,
      instanceNo: Number(instanceMeta.instance_no || 0),
      status: String(instanceMeta.instance_status || ''),
      turnCount: Number(instanceMeta.turn_count || 0),
      tokenCount: Number(instanceMeta.token_count || 0),
      lastMessageAt: instanceMeta.last_message_at || null,
      archivedAt: instanceMeta.archived_at || null,
      continuable: continuation.continuable,
      inactiveReason: continuation.reason,
      inactiveNotice: continuation.notice
    },
    messages: rows
      .filter(isDialogueHistoryRow)
      .map((row) => {
        const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
        const responsePayload = payload.response && typeof payload.response === 'object'
          ? payload.response
          : {};
        const toolTraces = Array.isArray(responsePayload.toolTraces)
          ? responsePayload.toolTraces
          : (Array.isArray(payload.toolTraces) ? payload.toolTraces : []);
        return {
          id: String(row.message_id || row.id),
          messageId: String(row.message_id || ''),
          role: String(row.role || ''),
          messageType: normalizeStoredMessageType(row.message_type),
          content: String(row.content || ''),
          attachments: parseAttachments(row.attachments),
          createdAt: row.created_at,
          toolTraces
        };
      })
  };
}

async function deleteConversationInstanceForUser(userId, instanceId) {
  const normalizedUserId = String(userId || '').trim();
  const normalizedInstanceId = Number(instanceId || 0);
  if (!normalizedUserId || !Number.isFinite(normalizedInstanceId) || normalizedInstanceId <= 0) {
    const err = new Error('instanceId is required');
    err.code = 'INVALID_ARGUMENT';
    throw err;
  }

  return postgresqlSequelize.transaction(async (transaction) => {
    const [rows] = await postgresqlSequelize.query(
      `SELECT ci.id
         FROM conversation_instances ci
         JOIN conversation_containers cc ON cc.id = ci.container_id
        WHERE ci.id = :instanceId
          AND cc.channel_type = :channelType
          AND cc.user_id = :userId
        LIMIT 1
        FOR UPDATE`,
      {
        replacements: {
          instanceId: normalizedInstanceId,
          channelType: WEB_CHANNEL_TYPE,
          userId: normalizedUserId
        },
        transaction
      }
    );
    if (!rows[0]) {
      const err = new Error('conversation not found');
      err.code = 'NOT_FOUND';
      throw err;
    }

    await postgresqlSequelize.query(
      `DELETE FROM conversation_instances
        WHERE id = :instanceId`,
      {
        replacements: { instanceId: normalizedInstanceId },
        transaction
      }
    );
    return { ok: true, instanceId: normalizedInstanceId };
  });
}

module.exports = {
  truncateTitle,
  parseAttachments,
  isDialogueHistoryRow,
  ensureWebConversationContainerForUser,
  resolveWebConversationIdForUser,
  listConversationsForUser,
  listMessagesForConversation,
  deleteConversationInstanceForUser,
  getInstanceContinuationState
};
