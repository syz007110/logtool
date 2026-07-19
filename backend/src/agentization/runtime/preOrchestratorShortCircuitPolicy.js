const { getAgentFixedT, resolveAgentLng } = require('../utils/agentI18n');
const { evaluateAttachmentValidationPolicy } = require('./attachmentValidationPolicy');

function getDingtalkMsgtype(request) {
  return String(request?.rawPayload?.msgtype || '').trim().toLowerCase();
}

function resolveRequestLang(request) {
  return resolveAgentLng(request?.context?.lang);
}

function buildUnsupportedVideoResponse(language) {
  const t = getAgentFixedT(language);
  return {
    mode: 'direct_response',
    text: t('shared.agent.videoUnsupported'),
    attachments: [],
    toolTraces: [],
    debugMeta: {
      deterministicRule: 'dingtalk_video_unsupported',
      deliveryHint: 'system_action_card'
    }
  };
}

function buildContextShortCircuitResponse(contextShortCircuit) {
  return {
    reason: String(contextShortCircuit.reason || 'direct_response').trim() || 'direct_response',
    assistantResponse: {
      mode: 'direct_response',
      text: String(contextShortCircuit.message || '当前请求不支持直接处理。').trim(),
      attachments: [],
      toolTraces: [],
      debugMeta: {
        deterministicRule: String(contextShortCircuit.reason || 'direct_response').trim() || 'direct_response',
        deliveryHint: 'system_action_card',
        details: contextShortCircuit.details && typeof contextShortCircuit.details === 'object'
          ? { ...contextShortCircuit.details }
          : {}
      }
    }
  };
}

function buildAttachmentShortCircuitResponse(shortCircuit) {
  return {
    reason: shortCircuit.reason,
    assistantResponse: {
      mode: 'direct_response',
      text: shortCircuit.message,
      attachments: [],
      toolTraces: [],
      debugMeta: {
        deterministicRule: shortCircuit.reason,
        deliveryHint: 'system_action_card',
        details: shortCircuit.details
      }
    }
  };
}

function evaluatePreOrchestratorShortCircuit(request) {
  const language = resolveRequestLang(request);
  const contextShortCircuit = request?.context?.shortCircuit;
  if (contextShortCircuit && typeof contextShortCircuit === 'object') {
    return buildContextShortCircuitResponse(contextShortCircuit);
  }

  const attachmentShortCircuit = evaluateAttachmentValidationPolicy(
    request?.message?.attachments,
    { language }
  );
  if (attachmentShortCircuit) {
    return buildAttachmentShortCircuitResponse(attachmentShortCircuit);
  }

  const channelType = String(request?.channel?.type || '').trim().toLowerCase();
  if (channelType === 'dingtalk' && getDingtalkMsgtype(request) === 'video') {
    return {
      reason: 'dingtalk_video_unsupported',
      assistantResponse: buildUnsupportedVideoResponse(language)
    };
  }
  return null;
}

module.exports = {
  evaluatePreOrchestratorShortCircuit
};
