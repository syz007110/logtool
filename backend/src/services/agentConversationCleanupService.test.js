const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  getCleanupConfig,
  buildRetentionCutoff
} = require('./agentConversationCleanupService');

describe('agent conversation cleanup config', () => {
  it('uses defaults when env is missing', () => {
    const oldValues = {
      disabled: process.env.AGENT_CONVERSATION_CLEANUP_DISABLED,
      dryRun: process.env.AGENT_CONVERSATION_CLEANUP_DRY_RUN,
      intervalMin: process.env.AGENT_CONVERSATION_CLEANUP_INTERVAL_MIN,
      startupDelaySec: process.env.AGENT_CONVERSATION_CLEANUP_STARTUP_DELAY_SEC,
      retentionDays: process.env.AGENT_CONVERSATION_RETENTION_DAYS,
      batchSize: process.env.AGENT_CONVERSATION_CLEANUP_BATCH_SIZE
    };
    delete process.env.AGENT_CONVERSATION_CLEANUP_DISABLED;
    delete process.env.AGENT_CONVERSATION_CLEANUP_DRY_RUN;
    delete process.env.AGENT_CONVERSATION_CLEANUP_INTERVAL_MIN;
    delete process.env.AGENT_CONVERSATION_CLEANUP_STARTUP_DELAY_SEC;
    delete process.env.AGENT_CONVERSATION_RETENTION_DAYS;
    delete process.env.AGENT_CONVERSATION_CLEANUP_BATCH_SIZE;

    const config = getCleanupConfig();
    assert.equal(config.disabled, false);
    assert.equal(config.dryRun, false);
    assert.equal(config.intervalMin, 60);
    assert.equal(config.startupDelaySec, 60);
    assert.equal(config.retentionDays, 15);
    assert.equal(config.batchSize, 100);

    Object.entries(oldValues).forEach(([key, value]) => {
      const envKey = ({
        disabled: 'AGENT_CONVERSATION_CLEANUP_DISABLED',
        dryRun: 'AGENT_CONVERSATION_CLEANUP_DRY_RUN',
        intervalMin: 'AGENT_CONVERSATION_CLEANUP_INTERVAL_MIN',
        startupDelaySec: 'AGENT_CONVERSATION_CLEANUP_STARTUP_DELAY_SEC',
        retentionDays: 'AGENT_CONVERSATION_RETENTION_DAYS',
        batchSize: 'AGENT_CONVERSATION_CLEANUP_BATCH_SIZE'
      })[key];
      if (value === undefined) delete process.env[envKey];
      else process.env[envKey] = value;
    });
  });

  it('builds retention cutoff from configured days', () => {
    const now = new Date('2026-07-20T00:00:00.000Z');
    const cutoff = buildRetentionCutoff(15, now);
    assert.equal(cutoff.toISOString(), '2026-07-05T00:00:00.000Z');
  });
});
