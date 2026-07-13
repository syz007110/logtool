const { postgresqlSequelize } = require('../../config/postgresql');
const {
  isPipelineMessageType,
  normalizeStoredMessageType,
  DIALOGUE_MESSAGE_TYPES
} = require('./conversationMessageTypes');

function truncateTitle(text, max = 40) {
  const s = String(text || '').trim().replace(/\s+/g, ' ');
  if (!s) return '新对话';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function isDialogueHistoryRow(row) {
  const role = String(row?.role || '').trim().toLowerCase();
  if (role !== 'user' && role !== 'assistant') return false;
  const messageType = normalizeStoredMessageType(row?.messageType || row?.message_type);
  if (isPipelineMessageType(messageType)) return false;
  return DIALOGUE_MESSAGE_TYPES.includes(messageType);
}

function parsePayload(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }
  return {};
}

async function listConversationsForUser(userId, { limit = 20 } = {}) {
  const uid = String(userId || '').trim();
  if (!uid) return [];
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const [rows] = await postgresqlSequelize.query(
    `SELECT c.conversation_id AS "conversationId",
            c.updated_at AS "updatedAt",
            (
              SELECT m.content
                FROM conversation_messages m
                JOIN conversation_instances i ON i.id = m.instance_id
               WHERE i.container_id = c.id
                 AND m.role = 'user'
               ORDER BY m.created_at ASC
               LIMIT 1
            ) AS "firstUserText"
       FROM conversation_containers c
      WHERE c.user_id = :uid
        AND c.channel_type = 'web'
      ORDER BY c.updated_at DESC
      LIMIT :lim`,
    { replacements: { uid, lim } }
  );
  return (rows || []).map((r) => ({
    conversationId: String(r.conversationId || ''),
    updatedAt: r.updatedAt,
    title: truncateTitle(r.firstUserText)
  }));
}

async function listMessagesForConversation(userId, conversationId) {
  const uid = String(userId || '').trim();
  const cid = String(conversationId || '').trim();
  if (!uid || !cid) {
    const err = new Error('userId and conversationId are required');
    err.code = 'INVALID_ARGUMENT';
    throw err;
  }
  const [containers] = await postgresqlSequelize.query(
    `SELECT id FROM conversation_containers
      WHERE user_id = :uid AND conversation_id = :cid AND channel_type = 'web'
      LIMIT 1`,
    { replacements: { uid, cid } }
  );
  if (!containers?.[0]) {
    const err = new Error('conversation not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const containerId = containers[0].id;
  const [rows] = await postgresqlSequelize.query(
    `SELECT m.role, m.content, m.message_type AS "messageType", m.payload, m.created_at AS "createdAt"
       FROM conversation_messages m
       JOIN conversation_instances i ON i.id = m.instance_id
      WHERE i.container_id = :containerId
        AND m.role IN ('user', 'assistant')
      ORDER BY m.created_at ASC`,
    { replacements: { containerId } }
  );
  return (rows || [])
    .filter((r) => isDialogueHistoryRow(r))
    .map((r) => {
      const payload = parsePayload(r.payload);
      const toolTraces = Array.isArray(payload.toolTraces) ? payload.toolTraces : undefined;
      return {
        role: String(r.role || ''),
        content: String(r.content || ''),
        messageType: String(r.messageType || ''),
        createdAt: r.createdAt,
        toolTraces,
        text: String(r.content || '')
      };
    });
}

module.exports = {
  truncateTitle,
  isDialogueHistoryRow,
  listConversationsForUser,
  listMessagesForConversation
};
