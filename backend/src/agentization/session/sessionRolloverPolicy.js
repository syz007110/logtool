const { getAgentFixedT } = require('../utils/agentI18n');

function estimateTokens(input) {
  const text = String(input || '');
  return Math.max(1, Math.ceil(text.length / 4));
}

function shouldForceNew(request) {
  if (request?.session?.forceNewInstance === true) return true;
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
  if (Number(instance.token_count || 0) >= policy.maxTokens) return 'max_tokens';
  if (Number(instance.token_count || 0) + est > policy.maxTokens) return 'max_tokens';
  return null;
}

function buildInactiveInstanceNotice(reason, policy = {}, language = 'zh') {
  const t = getAgentFixedT(language);
  const normalized = String(reason || '').trim().toLowerCase();
  if (normalized === 'archived') {
    return t('shared.agent.session.inactive.archived');
  }
  if (normalized === 'max_tokens') {
    return t('shared.agent.session.inactive.maxTokens', { maxTokens: Number(policy.maxTokens || 6000) });
  }
  if (normalized === 'max_turns') {
    return t('shared.agent.session.inactive.maxTurns', { maxTurns: Number(policy.maxTurns || 20) });
  }
  if (normalized === 'idle_timeout') {
    return t('shared.agent.session.inactive.idleTimeout', {
      idleTimeoutMinutes: Number(policy.idleTimeoutMinutes || 30)
    });
  }
  return t('shared.agent.session.inactive.archived');
}

function buildInstanceNotice(effectiveResolution, policy = {}, language = 'zh') {
  if (!effectiveResolution?.createdNewInstance) return null;
  const t = getAgentFixedT(language);
  const reason = String(effectiveResolution?.rolloverReason || '').trim().toLowerCase();
  if (!reason || reason === 'no_active_instance') return null;

  if (reason === 'max_tokens') {
    return t('shared.agent.session.rollover.maxTokens', { maxTokens: Number(policy.maxTokens || 6000) });
  }
  if (reason === 'max_turns') {
    return t('shared.agent.session.rollover.maxTurns', { maxTurns: Number(policy.maxTurns || 20) });
  }
  if (reason === 'idle_timeout') {
    return t('shared.agent.session.rollover.idleTimeout', {
      idleTimeoutMinutes: Number(policy.idleTimeoutMinutes || 30)
    });
  }
  if (reason === 'force_new_command') {
    return t('shared.agent.session.rollover.forceNewCommand');
  }
  return t('shared.agent.session.rollover.default');
}

module.exports = {
  buildInactiveInstanceNotice,
  buildInstanceNotice,
  getRolloverReason,
  shouldForceNew
};
