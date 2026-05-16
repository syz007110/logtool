const { buildAgentRequestFromDingtalk } = require('./buildAgentRequestFromDingtalk');

/** 钉钉仅展示用户可见回复，不包含 llm_raw / debugMeta / context_envelope 等 */
function buildDingtalkUserVisibleText(result) {
  const text = String(result?.text || '').trim();
  if (text) return text;
  const intent = String(result?.intent?.intent || '').trim();
  const instanceNo = Number(result?.instance?.instance_no || 0);
  if (intent && instanceNo) {
    return `已进入会话实例#${instanceNo}，识别意图：${intent}`;
  }
  if (instanceNo) return `已进入会话实例#${instanceNo}`;
  return '已收到消息';
}

function buildDingtalkWebhookResponse(result) {
  const attachments = Array.isArray(result?.attachments) ? result.attachments : [];
  if (attachments.length > 0) {
    const lines = attachments
      .map((a) => {
        const name = String(a?.name || 'attachment').trim();
        const url = String(a?.url || '').trim();
        return url ? `- [${name}](${url})` : '';
      })
      .filter(Boolean);
    if (lines.length > 0) {
      return {
        msgtype: 'markdown',
        markdown: {
          title: '处理结果',
          text: `${buildDingtalkUserVisibleText(result)}\n\n${lines.join('\n')}`
        }
      };
    }
  }
  return {
    msgtype: 'text',
    text: {
      content: buildDingtalkUserVisibleText(result)
    }
  };
}

function parseInbound(req) {
  return buildAgentRequestFromDingtalk(req);
}

function renderOutbound({ req, res, request, response }) {
  if (response.mode === 'async') {
    return res.json({
      msgtype: 'text',
      text: {
        content: `消息已受理（taskId=${response.taskId}），请稍后查询结果。`
      }
    });
  }
  return res.json(buildDingtalkWebhookResponse(response.result));
}

function renderError({ req, res, error }) {
  return res.status(400).json({
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
  buildDingtalkUserVisibleText,
  buildDingtalkWebhookResponse
};

