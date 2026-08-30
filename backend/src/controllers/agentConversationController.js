const {
  listConversationsForUser,
  listMessagesForConversation,
  ensureConversationInstanceForUser,
  deleteConversationInstanceForUser
} = require('../agentization/session/agentConversationQueryService');
const { persistPreOrchestratorToolEvent } = require('../agentization/session/preOrchestratorToolEventService');
const { generateUlid } = require('../utils/idGenerators');

async function listAgentConversations(req, res) {
  try {
    const list = await listConversationsForUser(req.user?.id, {
      limit: req.query?.limit,
      language: req.language || req.headers?.['accept-language']
    });
    return res.json({ ok: true, conversations: list });
  } catch (err) {
    console.error('[agent-conversations] list failed', err);
    return res.status(500).json({ ok: false, message: err.message || 'list failed' });
  }
}

async function listAgentConversationMessages(req, res) {
  try {
    const session = await listMessagesForConversation(
      req.user?.id,
      req.params.instanceId,
      { language: req.language || req.headers?.['accept-language'] }
    );
    return res.json({
      ok: true,
      conversationId: session.conversationId,
      instanceId: session.instanceId,
      instance: session.instance,
      messages: session.messages
    });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ ok: false, message: 'conversation not found' });
    }
    if (err.code === 'INVALID_ARGUMENT') {
      return res.status(400).json({ ok: false, message: err.message || 'invalid argument' });
    }
    console.error('[agent-conversations] messages failed', err);
    return res.status(500).json({ ok: false, message: err.message || 'messages failed' });
  }
}

async function deleteAgentConversation(req, res) {
  try {
    const result = await deleteConversationInstanceForUser(
      req.user?.id,
      req.params.instanceId
    );
    return res.json(result);
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ ok: false, message: 'conversation not found' });
    }
    if (err.code === 'INVALID_ARGUMENT') {
      return res.status(400).json({ ok: false, message: err.message || 'invalid argument' });
    }
    console.error('[agent-conversations] delete failed', err);
    return res.status(500).json({ ok: false, message: err.message || 'delete failed' });
  }
}

async function markAgentLogUploadCompleted(req, res) {
  try {
    const instanceId = Number(req.params.instanceId || 0);
    if (!Number.isFinite(instanceId) || instanceId <= 0) {
      return res.status(400).json({ ok: false, message: 'instanceId is required' });
    }

    const uploadedCount = Math.max(0, Number.parseInt(req.body?.uploadedCount, 10) || 0);
    const deviceId = String(req.body?.deviceId || '').trim() || null;
    const files = Array.isArray(req.body?.files)
      ? req.body.files
          .map((file) => ({
            attachmentAssetId: String(file?.attachmentAssetId || '').trim() || null,
            originalName: String(file?.originalName || '').trim() || null
          }))
          .filter((file) => file.attachmentAssetId || file.originalName)
      : [];

    const session = await ensureConversationInstanceForUser(req.user?.id, instanceId);
    const assistantText = uploadedCount > 0
      ? `已提交 ${uploadedCount} 个日志文件，正在解析。`
      : '日志上传已提交，正在解析。';
    const syntheticMessageId = `web_log_upload_complete_${generateUlid()}`;
    const syntheticRequest = {
      requestId: String(req.headers['x-request-id'] || '').trim() || syntheticMessageId,
      traceId: String(req.headers['x-trace-id'] || '').trim() || syntheticMessageId,
      channel: {
        type: 'web',
        conversationId: session.conversationId
      },
      user: {
        id: String(req.user?.id || '').trim()
      },
      message: {
        externalMessageId: syntheticMessageId
      }
    };

    await persistPreOrchestratorToolEvent({
      instanceId: session.id,
      request: syntheticRequest,
      taskId: null,
      toolName: 'start_log_upload',
      argumentsPayload: {
        completionSource: 'web_upload_panel',
        uploadedCount,
        deviceId,
        files
      },
      toolResult: {
        status: 'success',
        text: assistantText,
        data: {
          uploaded: true,
          uploadedCount,
          queued: true,
          deviceId,
          files
        },
        error: null
      },
      assistantContent: assistantText
    });

    return res.json({
      ok: true,
      clearedAttachmentStatus: true
    });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ ok: false, message: 'conversation not found' });
    }
    if (err.code === 'INVALID_ARGUMENT') {
      return res.status(400).json({ ok: false, message: err.message || 'invalid argument' });
    }
    console.error('[agent-conversations] mark log upload completed failed', err);
    return res.status(500).json({ ok: false, message: err.message || 'mark log upload completed failed' });
  }
}

module.exports = {
  listAgentConversations,
  listAgentConversationMessages,
  deleteAgentConversation,
  markAgentLogUploadCompleted
};
