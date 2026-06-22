const { buildMessageInputFromDingtalk } = require('./buildMessageInputFromDingtalk');

function buildDingtalkUserVisibleText(result) {
  const text = String(result?.text || '').trim();
  if (text) return text;
  return '已收到消息';
}

function normalizeAttachments(input) {
  if (!Array.isArray(input)) return [];
  return input.filter((a) => a && typeof a === 'object').map((a) => ({
    type: String(a.type || '').trim().toLowerCase(),
    url: String(a.url || '').trim(),
    name: String(a.name || '').trim() || undefined,
    fileId: String(a.fileId || a.id || '').trim() || undefined
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

  await outbound.send({
    msgtype: 'text',
    text: {
      content: buildDingtalkUserVisibleText(result)
    }
  });

  const attachments = normalizeAttachments(result?.attachments);
  for (const attachment of attachments) {
    const body = buildAttachmentBody(attachment);
    if (!body) continue;
    await outbound.send(body);
  }
}

async function renderError({ error, outbound }) {
  if (!outbound || typeof outbound.send !== 'function') return;
  await outbound.send({
    msgtype: 'text',
    text: {
      content: `处理失败: ${String(error?.message || error)}`
    }
  });
}

module.exports = {
  parseInbound,
  renderOutbound,
  renderError,
  buildDingtalkUserVisibleText
};
