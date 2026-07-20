const { postgresqlSequelize } = require('../config/postgresql');
const { logOperation } = require('../utils/operationLogger');
const { purgeConversationInstances } = require('./agentConversationPurgeService');

const CLEANUP_LOCK_KEY = 842061;

function parseIntOr(value, fallback) {
  const num = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(num) ? num : fallback;
}

function boolEnvTrue(name) {
  return String(process.env[name] || '').trim().toLowerCase() === 'true';
}

function getCleanupConfig() {
  return {
    disabled: boolEnvTrue('AGENT_CONVERSATION_CLEANUP_DISABLED'),
    dryRun: boolEnvTrue('AGENT_CONVERSATION_CLEANUP_DRY_RUN'),
    intervalMin: Math.max(1, parseIntOr(process.env.AGENT_CONVERSATION_CLEANUP_INTERVAL_MIN, 60)),
    startupDelaySec: Math.max(1, parseIntOr(process.env.AGENT_CONVERSATION_CLEANUP_STARTUP_DELAY_SEC, 60)),
    retentionDays: Math.max(1, parseIntOr(process.env.AGENT_CONVERSATION_RETENTION_DAYS, 15)),
    batchSize: Math.max(1, parseIntOr(process.env.AGENT_CONVERSATION_CLEANUP_BATCH_SIZE, 100))
  };
}

function buildRetentionCutoff(retentionDays, now = new Date()) {
  return new Date(now.getTime() - Math.max(1, Number(retentionDays || 15)) * 24 * 60 * 60 * 1000);
}

async function tryAcquireCleanupLock(transaction = null) {
  const [rows] = await postgresqlSequelize.query(
    'SELECT pg_try_advisory_lock(:lockKey) AS locked',
    {
      replacements: { lockKey: CLEANUP_LOCK_KEY },
      transaction
    }
  );
  return rows?.[0]?.locked === true;
}

async function releaseCleanupLock(transaction = null) {
  try {
    await postgresqlSequelize.query(
      'SELECT pg_advisory_unlock(:lockKey)',
      {
        replacements: { lockKey: CLEANUP_LOCK_KEY },
        transaction
      }
    );
  } catch (_) {}
}

async function listExpiredInstanceIds({ retentionDays, batchSize }) {
  const cutoff = buildRetentionCutoff(retentionDays);
  const [rows] = await postgresqlSequelize.query(
    `SELECT ci.id,
            ci.container_id,
            ci.instance_no,
            ci.created_at,
            ci.last_message_at,
            cc.user_id,
            cc.conversation_id
       FROM conversation_instances ci
       JOIN conversation_containers cc ON cc.id = ci.container_id
      WHERE COALESCE(ci.last_message_at, ci.created_at) < :cutoff
      ORDER BY COALESCE(ci.last_message_at, ci.created_at) ASC, ci.id ASC
      LIMIT :batchSize`,
    {
      replacements: {
        cutoff,
        batchSize
      }
    }
  );
  return Array.isArray(rows) ? rows : [];
}

async function runOnce(customLog = console.log) {
  const config = getCleanupConfig();
  const log = typeof customLog === 'function' ? customLog : console.log;
  if (config.disabled) {
    return {
      ok: true,
      skipped: true,
      reason: 'disabled'
    };
  }

  const locked = await tryAcquireCleanupLock();
  if (!locked) {
    log('[agent-conversation-cleaner] skipped: another worker is running');
    return {
      ok: true,
      skipped: true,
      reason: 'locked'
    };
  }

  try {
    const expiredInstances = await listExpiredInstanceIds(config);
    if (expiredInstances.length === 0) {
      return {
        ok: true,
        dryRun: config.dryRun,
        retentionDays: config.retentionDays,
        batchSize: config.batchSize,
        instanceCount: 0,
        deletedMessages: 0,
        deletedInstances: 0,
        deletedAssets: 0,
        skippedAssets: 0
      };
    }

    const purgeResult = await purgeConversationInstances({
      instanceIds: expiredInstances.map((item) => item.id),
      dryRun: config.dryRun,
      reason: 'retention_cleanup'
    });

    const summary = {
      ok: true,
      dryRun: config.dryRun,
      retentionDays: config.retentionDays,
      batchSize: config.batchSize,
      instanceCount: expiredInstances.length,
      deletedMessages: purgeResult.deletedMessages,
      deletedInstances: purgeResult.deletedInstances,
      deletedAssets: purgeResult.deletedAssets,
      skippedAssets: purgeResult.skippedAssets,
      assetDeleteErrors: Array.isArray(purgeResult.assetDeleteErrors) ? purgeResult.assetDeleteErrors : [],
      instanceIds: expiredInstances.map((item) => item.id)
    };

    log(`[agent-conversation-cleaner] batch complete: instances=${summary.instanceCount}, deletedMessages=${summary.deletedMessages}, deletedInstances=${summary.deletedInstances}, deletedAssets=${summary.deletedAssets}, skippedAssets=${summary.skippedAssets}, dryRun=${summary.dryRun}`);

    try {
      await logOperation({
        operation: 'agent_conversation_cleanup',
        description: summary.dryRun ? 'Agent会话清理演练执行完成' : 'Agent会话清理执行完成',
        user_id: null,
        username: 'system',
        status: 'success',
        ip: '',
        user_agent: 'agent-conversation-cleaner',
        details: {
          retentionDays: summary.retentionDays,
          batchSize: summary.batchSize,
          instanceCount: summary.instanceCount,
          deletedMessages: summary.deletedMessages,
          deletedInstances: summary.deletedInstances,
          deletedAssets: summary.deletedAssets,
          skippedAssets: summary.skippedAssets,
          dryRun: summary.dryRun,
          assetDeleteErrors: summary.assetDeleteErrors
        }
      });
    } catch (error) {
      log(`[agent-conversation-cleaner] audit log failed: ${error?.message || error}`);
    }

    return summary;
  } catch (error) {
    log(`[agent-conversation-cleaner] cleanup failed: ${error?.message || error}`);
    try {
      await logOperation({
        operation: 'agent_conversation_cleanup',
        description: 'Agent会话清理执行失败',
        user_id: null,
        username: 'system',
        status: 'failed',
        ip: '',
        user_agent: 'agent-conversation-cleaner',
        details: {
          message: String(error?.message || error)
        }
      });
    } catch (_) {}
    throw error;
  } finally {
    await releaseCleanupLock();
  }
}

function startAgentConversationCleanupJob() {
  const config = getCleanupConfig();
  if (config.disabled) return { stop: () => {}, runOnce: () => Promise.resolve({ ok: true, skipped: true, reason: 'disabled' }) };

  let running = false;
  const log = (msg) => console.log(msg);

  const guardedRunOnce = async () => {
    if (running) return { ok: true, skipped: true, reason: 'running' };
    running = true;
    try {
      return await runOnce(log);
    } finally {
      running = false;
    }
  };

  const bootTimer = setTimeout(() => {
    guardedRunOnce().catch(() => {});
  }, config.startupDelaySec * 1000);

  const timer = setInterval(() => {
    guardedRunOnce().catch(() => {});
  }, config.intervalMin * 60 * 1000);
  timer.unref?.();

  log(`[agent-conversation-cleaner] started: intervalMin=${config.intervalMin}, retentionDays=${config.retentionDays}, batchSize=${config.batchSize}, dryRun=${config.dryRun}`);

  return {
    stop: () => {
      clearTimeout(bootTimer);
      clearInterval(timer);
    },
    runOnce: guardedRunOnce
  };
}

module.exports = {
  getCleanupConfig,
  buildRetentionCutoff,
  runOnce,
  startAgentConversationCleanupJob
};
