const { buildMessageInputFromDingtalk } = require('./buildMessageInputFromDingtalk');
const { buildMarkdownMessageBody, buildSystemMarkdownText } = require('../../delivery/dingtalkOutboundService');

function buildDingtalkUserVisibleText(result) {
  return String(result?.text || '').trim();
}

function normalizeAttachments(input) {
  if (!Array.isArray(input)) return [];
  return input.filter((a) => a && typeof a === 'object').map((a) => ({
    type: String(a.type || '').trim().toLowerCase(),
    url: String(a.url || '').trim(),
    name: String(a.originalName || a.storedName || '').trim() || undefined,
    assetId: String(a.assetId || '').trim() || undefined
  }));
}

function buildAttachmentBody(attachment) {
  const name = String(attachment?.name || '').trim() || 'attachment';
  const url = String(attachment?.url || '').trim();
  if (!url) return null;
  return {
    msgtype: 'markdown',
    markdown: {
      title: '附件',
      text: `[${name}](${url})`
    }
  };
}

function parseInbound(req) {
  return buildMessageInputFromDingtalk(req);
}

const DINGTALK_ASYNC_ACK_TEXT = '正在处理您的消息，请稍候…';

function normalizeSystemMessages(result) {
  if (!Array.isArray(result?.systemMessages)) return [];
  return result.systemMessages
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      title: String(item.title || '').trim() || '系统提示',
      text: String(item.text || '').trim(),
      presentation: String(item.presentation || '').trim().toLowerCase() || 'action_card'
    }))
    .filter((item) => item.text);
}

function shouldSuppressPrimaryReply(result, systemMessages) {
  if (systemMessages.length === 0) return false;
  return String(result?.assistantMode || '').trim().toLowerCase() === 'direct_response';
}

async function renderOutbound({ request, response, outbound }) {
  if (!outbound || typeof outbound.send !== 'function') {
    throw new Error('dingtalk stream outbound sink is required');
  }
  const mode = String(response?.mode || 'completed').trim().toLowerCase();
  if (mode === 'accepted') {
    await outbound.send({
      msgtype: 'text',
      text: {
        content: DINGTALK_ASYNC_ACK_TEXT
      }
    });
    return;
  }

  const result = response?.result && typeof response.result === 'object'
    ? response.result
    : {};
  const systemMessages = normalizeSystemMessages(result);
  const text = buildDingtalkUserVisibleText(result);
  const suppressPrimaryReply = shouldSuppressPrimaryReply(result, systemMessages);

  for (const message of systemMessages) {
    await outbound.send(buildMarkdownMessageBody(
      buildSystemMarkdownText(message.text, message.title),
      message.title
    ));
  }

  if (!suppressPrimaryReply && text) {
    await outbound.send(buildMarkdownMessageBody(text));
  }

  const attachments = normalizeAttachments(result?.attachments);
  for (const attachment of attachments) {
    const body = buildAttachmentBody(attachment);
    if (!body) continue;
    await outbound.send(body);
  }
}

async function renderError({ error, outbound }) {
  if (!outbound || typeof outbound.send !== 'function') return;
  if (String(error?.code || '').trim().toUpperCase() === 'INSTANCE_INACTIVE') {
    await outbound.send(buildMarkdownMessageBody(
      buildSystemMarkdownText(String(error?.message || error), '会话状态变更'),
      '会话状态变更'
    ));
    return;
  }
  await outbound.send(buildMarkdownMessageBody(`处理失败: ${String(error?.message || error)}`));
}

module.exports = {
  parseInbound,
  renderOutbound,
  renderError,
  buildDingtalkUserVisibleText
};
