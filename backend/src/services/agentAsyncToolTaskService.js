const Redis = require('ioredis');
const { redisConfig, conversationMessageQueue, asyncToolGovernanceQueue } = require('../config/queue');
const Log = require('../models/log');
const { persistAsyncToolFinalResult } = require('../agentization/session/asyncToolFinalResultPersistenceService');
const websocketService = require('./websocketService');
const { projectQueueResultToMessageDelta } = require('../agentization/types/messageDeltaProjection');
const { projectQueueResultToMessageOutput } = require('../agentization/types/messageOutputProjection');
const { createAgentTaskPersistenceStore } = require('../agentization/taskGateway/stores/agentTaskPersistenceStore');
const { parseRequestSnapshot } = require('../agentization/taskGateway/agentTaskSnapshot');
const { deliverAgentTaskOutcome } = require('../agentization/delivery/agentTaskDeliveryService');

const TASK_KEY_PREFIX = 'agent:async-tool-task:';
const TASK_FINALIZE_LOCK_PREFIX = 'agent:async-tool-task-finalize:';
const TASK_TTL_SECONDS = Math.max(3600, Number.parseInt(process.env.AGENT_ASYNC_TOOL_TASK_TTL_SECONDS || '604800', 10) || 604800);
const DEFAULT_BATCH_TIMEOUT_MS = Math.max(60000, Number.parseInt(process.env.AGENT_ASYNC_TOOL_DEFAULT_BATCH_TIMEOUT_MS || '1800000', 10) || 1800000);

let redisClient = null;
const agentTaskStore = createAgentTaskPersistenceStore();

function getRedisClient() {
  if (redisClient) return redisClient;
  redisClient = new Redis({
    host: redisConfig.host,
    port: Number(redisConfig.port || 6379),
    password: redisConfig.password || undefined,
    db: Number(redisConfig.db || 0),
    lazyConnect: false
  });
  return redisClient;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeTaskType(value) {
  return normalizeText(value).toLowerCase();
}

function buildTaskKey(taskId) {
  return `${TASK_KEY_PREFIX}${normalizeText(taskId)}`;
}

function buildFinalizeLockKey(taskId) {
  return `${TASK_FINALIZE_LOCK_PREFIX}${normalizeText(taskId)}`;
}

function buildTimeoutJobId(taskId) {
  return `async-tool-timeout:${normalizeText(taskId)}`;
}

function parseJsonObject(rawValue, fallback) {
  const raw = normalizeText(rawValue);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch (_) {}
  return fallback;
}

function normalizePositiveInt(value, fallback) {
  const num = Number.parseInt(String(value ?? ''), 10);
  if (Number.isFinite(num) && num > 0) return num;
  return fallback;
}

function mapRawLogStatus(rawStatus) {
  const text = normalizeText(rawStatus).toLowerCase();
  if (text === 'parsed') return 'completed';
  if (text === 'file_error') return 'file_error';
  if (text === 'decrypt_failed') return 'decrypt_failed';
  if (text === 'parse_failed') return 'parse_failed';
  if (text === 'processing_failed' || text === 'failed' || text === 'upload_failed' || text === 'queue_failed') {
    return 'processing_failed';
  }
  return 'processing_failed';
}

function buildLogUploadFinalSummary(results = []) {
  const totalCount = results.length;
  const successCount = results.filter((item) => item.uploadStatus === 'completed').length;
  const failedCount = totalCount - successCount;
  if (totalCount < 1) {
    return '日志上传处理完成，但未产生可用结果。';
  }
  if (failedCount < 1) {
    return `${totalCount} 个日志文件已完成上传并解析。`;
  }
  return `日志上传处理完成，成功 ${successCount} 个，失败 ${failedCount} 个。`;
}

function asAsyncToolEventPayload({ toolName, phase, text, data = null }) {
  return {
    kind: 'async_tool',
    toolName: normalizeText(toolName),
    phase: normalizeText(phase),
    text: normalizeText(text),
    data: data && typeof data === 'object' && !Array.isArray(data) ? data : null
  };
}

function buildAsyncContinuationText(taskType) {
  if (normalizeTaskType(taskType) === 'log_upload') {
    return '异步日志上传任务已完成。请基于最新工具结果继续回复用户，不要再次发起日志上传任务。';
  }
  return '异步工具任务已完成。请基于最新工具结果继续回复用户，不要重复发起同一后台任务。';
}

function buildAsyncTimeoutSummary(taskType) {
  if (normalizeTaskType(taskType) === 'log_upload') {
    return '日志上传任务处理超时，后台未能在规定时间内完成。';
  }
  return '异步工具任务处理超时，后台未能在规定时间内完成。';
}

async function loadLogUploadResult(ref = {}) {
  const logId = Number(ref.logId || 0);
  const row = logId > 0
    ? await Log.findByPk(logId, {
        attributes: ['id', 'status', 'remark']
      })
    : null;
  const rawStatus = normalizeText(row?.status) || 'processing_failed';
  return {
    originalName: normalizeText(ref.originalName),
    uploadStatus: mapRawLogStatus(rawStatus),
    rawLogStatus: rawStatus || null,
    message: normalizeText(row?.remark) || null
  };
}

const TASK_DEFINITIONS = Object.freeze({
  log_upload: {
    defaultToolName: 'start_log_upload',
    loadResult: loadLogUploadResult,
    buildArgumentsPayload(payload) {
      return {
        phase: 'completed',
        taskType: payload.taskType
      };
    },
    buildFinalToolResult(payload, results = []) {
      const totalCount = results.length;
      const successCount = results.filter((item) => item.uploadStatus === 'completed').length;
      const failedCount = totalCount - successCount;
      return {
        status: 'success',
        text: buildLogUploadFinalSummary(results),
        data: {
          phase: 'completed',
          taskType: payload.taskType,
          uploaded: true,
          deviceId: normalizeText(payload?.meta?.deviceId).toUpperCase() || null,
          totalCount,
          successCount,
          failedCount,
          results
        },
        error: null
      };
    },
    buildCompletionEvent(payload, toolResult) {
      return asAsyncToolEventPayload({
        toolName: payload?.toolName || 'start_log_upload',
        phase: 'completed',
        text: toolResult?.text || '',
        data: toolResult?.data && typeof toolResult.data === 'object'
          ? {
              taskType: toolResult.data.taskType || 'log_upload',
              uploaded: toolResult.data.uploaded === true,
              deviceId: toolResult.data.deviceId || null,
              totalCount: Number(toolResult.data.totalCount || 0) || 0,
              successCount: Number(toolResult.data.successCount || 0) || 0,
              failedCount: Number(toolResult.data.failedCount || 0) || 0
            }
          : null
      });
    },
    buildContinuationRequest(payload) {
      const taskId = normalizeText(payload?.taskId) || 'unknown';
      const traceId = normalizeText(payload?.traceId) || `async_tool_cont_${taskId}`;
      const requestId = normalizeText(payload?.requestId) || `${traceId}_request`;
      return {
        traceId,
        requestId,
        user: {
          id: payload?.userId || ''
        },
        channel: {
          type: normalizeText(payload?.meta?.channelType) || 'web',
          conversationId: payload?.conversationId || ''
        },
        session: {
          instanceId: Number(payload?.instanceId || 0) || null
        },
        message: {
          type: 'text',
          text: buildAsyncContinuationText(payload?.taskType),
          attachments: [],
          externalMessageId: `async_tool_cont_${taskId}`,
          sentAt: Date.now()
        },
        context: {
          lang: normalizeText(payload?.meta?.lang) || 'zh-CN',
          llmProviderId: normalizeText(payload?.meta?.llmProviderId) || undefined,
          disallowDeferredTools: true,
          asyncContinuation: true
        }
      };
    },
    buildTimeoutToolResult(payload) {
      return {
        status: 'failed',
        text: '',
        data: null,
        error: {
          code: 'ASYNC_TOOL_TASK_TIMEOUT',
          message: buildAsyncTimeoutSummary(payload?.taskType)
        }
      };
    },
    buildTimeoutAssistantContent(payload) {
      return buildAsyncTimeoutSummary(payload?.taskType);
    },
    buildTimeoutCompletionEvent(payload) {
      return asAsyncToolEventPayload({
        toolName: payload?.toolName || 'start_log_upload',
        phase: 'timeout',
        text: buildAsyncTimeoutSummary(payload?.taskType),
        data: {
          taskType: payload?.taskType || 'log_upload',
          timedOut: true,
          deviceId: normalizeText(payload?.meta?.deviceId).toUpperCase() || null
        }
      });
    }
  }
});

function resolveTaskDefinition(taskType) {
  const normalizedTaskType = normalizeTaskType(taskType);
  const definition = TASK_DEFINITIONS[normalizedTaskType];
  if (!definition) {
    throw new Error(`unsupported async tool task type: ${taskType}`);
  }
  return {
    taskType: normalizedTaskType,
    ...definition
  };
}

async function createAgentAsyncToolTask({
  taskId,
  parentTaskId,
  taskType,
  toolName,
  instanceId,
  conversationId,
  userId,
  requestId,
  traceId,
  totalCount,
  batchTimeoutMs,
  meta = {}
}) {
  const normalizedTaskId = normalizeText(taskId);
  if (!normalizedTaskId) throw new Error('taskId is required');

  const definition = resolveTaskDefinition(taskType);
  const normalizedToolName = normalizeText(toolName) || definition.defaultToolName;
  const normalizedTotalCount = Number(totalCount || 0);
  const normalizedBatchTimeoutMs = normalizePositiveInt(batchTimeoutMs, DEFAULT_BATCH_TIMEOUT_MS);
  if (!Number.isFinite(normalizedTotalCount) || normalizedTotalCount <= 0) {
    throw new Error('totalCount must be greater than 0');
  }

  const payload = {
    taskId: normalizedTaskId,
    parentTaskId: normalizeText(parentTaskId) || null,
    taskType: definition.taskType,
    toolName: normalizedToolName,
    instanceId: Number(instanceId || 0) || null,
    conversationId: normalizeText(conversationId) || null,
    userId: normalizeText(userId) || null,
    requestId: normalizeText(requestId) || null,
    traceId: normalizeText(traceId) || null,
    totalCount: normalizedTotalCount,
    batchTimeoutMs: normalizedBatchTimeoutMs,
    meta: meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {},
    results: {},
    submittedAt: new Date().toISOString(),
    finalizedAt: null,
    timeoutAt: new Date(Date.now() + normalizedBatchTimeoutMs).toISOString()
  };

  const client = getRedisClient();
  await client.set(buildTaskKey(normalizedTaskId), JSON.stringify(payload), 'EX', TASK_TTL_SECONDS);
  await asyncToolGovernanceQueue.add(
    'timeout-check',
    {
      taskId: normalizedTaskId
    },
    {
      jobId: buildTimeoutJobId(normalizedTaskId),
      delay: normalizedBatchTimeoutMs
    }
  );
  return payload;
}

async function readAgentAsyncToolTask(taskId) {
  const normalizedTaskId = normalizeText(taskId);
  if (!normalizedTaskId) return null;
  const client = getRedisClient();
  const raw = await client.get(buildTaskKey(normalizedTaskId));
  if (!raw) return null;
  return parseJsonObject(raw, null);
}

async function pushAsyncToolTaskEvent(payload, status, eventPayload = null, error = null) {
  const taskId = normalizeText(payload?.taskId);
  const userId = normalizeText(payload?.userId);
  if (!taskId || !userId) return false;

  await websocketService.pushAgentTaskStatus(taskId, normalizeText(status) || 'submitted', userId, {
    traceId: normalizeText(payload?.traceId),
    requestId: normalizeText(payload?.requestId),
    conversationId: normalizeText(payload?.conversationId),
    instanceId: Number(payload?.instanceId || 0) || null,
    result: eventPayload && typeof eventPayload === 'object' ? eventPayload : null,
    error: error && typeof error === 'object'
      ? {
          code: normalizeText(error.code) || 'ASYNC_TOOL_EVENT_FAILED',
          message: normalizeText(error.message) || 'async tool event failed'
        }
      : null
  });
  return true;
}

async function deliverPlatformContinuationOutcome(payload, continuationResult, error = null) {
  const parentTaskId = normalizeText(payload?.parentTaskId);
  if (!parentTaskId) return false;

  const taskRow = await agentTaskStore.getTask(parentTaskId);
  if (!taskRow) return false;

  const requestSnapshot = parseRequestSnapshot(taskRow);
  const channelType = normalizeText(requestSnapshot?.channel?.type).toLowerCase();
  if (!channelType || channelType === 'web') return false;

  const projectedResult = error
    ? null
    : projectQueueResultToMessageOutput(continuationResult && typeof continuationResult === 'object' ? continuationResult : {});

  await deliverAgentTaskOutcome({
    request: requestSnapshot,
    taskId: parentTaskId,
    taskRow,
    status: error ? 'failed' : 'completed',
    result: projectedResult,
    error
  });
  return true;
}

async function enqueueAsyncToolContinuation(payload, toolResult) {
  const definition = resolveTaskDefinition(payload?.taskType);
  if (typeof definition.buildContinuationRequest !== 'function') return null;

  const instanceId = Number(payload?.instanceId || 0);
  if (!Number.isFinite(instanceId) || instanceId <= 0) {
    throw new Error('async tool continuation requires instanceId');
  }

  const request = definition.buildContinuationRequest(payload, toolResult);
  const continuationJobId = `async-tool-continuation:${normalizeText(payload?.taskId)}:${Date.now()}`;
  const job = await conversationMessageQueue.add(
    'process-conversation',
    {
      request,
      routing: {
        container: {
          id: 0,
          container_key: ''
        },
        instance: {
          id: instanceId
        },
        activeResolution: {
          createdNewInstance: false,
          rolloverReason: null,
          previousInstanceNo: null,
          instance: {
            id: instanceId
          }
        },
        task: {
          id: ''
        }
      }
    },
    {
      jobId: continuationJobId
    }
  );
  return job.finished();
}

async function markTaskFinalized(payload, patch = {}) {
  const client = getRedisClient();
  const nextPayload = {
    ...payload,
    ...patch,
    finalizedAt: patch.finalizedAt || new Date().toISOString()
  };
  await client.set(buildTaskKey(payload.taskId), JSON.stringify(nextPayload), 'EX', TASK_TTL_SECONDS);
  return nextPayload;
}

async function persistFinalResult(payload) {
  const taskId = normalizeText(payload?.taskId);
  const instanceId = Number(payload?.instanceId || 0);
  if (!taskId || !Number.isFinite(instanceId) || instanceId <= 0) return false;

  const definition = resolveTaskDefinition(payload?.taskType);
  const results = Object.values(payload?.results && typeof payload.results === 'object' ? payload.results : {});
  const toolResult = definition.buildFinalToolResult(payload, results);
  const syntheticRequest = {
    requestId: payload?.requestId || `async_tool_task_${taskId}`,
    traceId: payload?.traceId || `async_tool_task_${taskId}`,
    channel: {
      type: 'web',
      conversationId: payload?.conversationId || ''
    },
    user: {
      id: payload?.userId || ''
    },
    message: {
      externalMessageId: `async_tool_task_${taskId}`
    }
  };

  await persistAsyncToolFinalResult({
    instanceId,
    request: syntheticRequest,
    taskId,
    toolName: payload?.toolName || definition.defaultToolName,
    argumentsPayload: definition.buildArgumentsPayload(payload, results),
    toolResult
  });
  const continuationResult = await enqueueAsyncToolContinuation(payload, toolResult);
  const messageDelta = projectQueueResultToMessageDelta(continuationResult);
  if (messageDelta && Array.isArray(messageDelta.messages) && messageDelta.messages.length > 0) {
    await websocketService.pushConversationMessageDelta({
      taskId,
      userId: payload?.userId || '',
      traceId: payload?.traceId || '',
      requestId: payload?.requestId || '',
      conversationId: payload?.conversationId || '',
      instanceId,
      delta: messageDelta,
      messages: messageDelta.messages
    });
  }
  await deliverPlatformContinuationOutcome(payload, continuationResult, null);
  if (typeof definition.buildCompletionEvent === 'function') {
    await pushAsyncToolTaskEvent(
      payload,
      'completed',
      definition.buildCompletionEvent(payload, toolResult),
      null
    );
  }
  return true;
}

async function persistTimeoutResult(payload) {
  const taskId = normalizeText(payload?.taskId);
  const instanceId = Number(payload?.instanceId || 0);
  if (!taskId || !Number.isFinite(instanceId) || instanceId <= 0) return false;

  const definition = resolveTaskDefinition(payload?.taskType);
  const toolResult = typeof definition.buildTimeoutToolResult === 'function'
    ? definition.buildTimeoutToolResult(payload)
    : {
        status: 'failed',
        text: '',
        data: null,
        error: {
          code: 'ASYNC_TOOL_TASK_TIMEOUT',
          message: buildAsyncTimeoutSummary(payload?.taskType)
        }
      };
  const assistantContent = typeof definition.buildTimeoutAssistantContent === 'function'
    ? definition.buildTimeoutAssistantContent(payload, toolResult)
    : buildAsyncTimeoutSummary(payload?.taskType);
  const syntheticRequest = {
    requestId: payload?.requestId || `async_tool_task_${taskId}_timeout`,
    traceId: payload?.traceId || `async_tool_task_${taskId}_timeout`,
    channel: {
      type: normalizeText(payload?.meta?.channelType) || 'web',
      conversationId: payload?.conversationId || ''
    },
    user: {
      id: payload?.userId || ''
    },
    message: {
      externalMessageId: `async_tool_task_${taskId}_timeout`
    }
  };

  await persistAsyncToolFinalResult({
    instanceId,
    request: syntheticRequest,
    taskId,
    toolName: payload?.toolName || definition.defaultToolName,
    argumentsPayload: {
      phase: 'timeout',
      taskType: payload?.taskType || definition.taskType
    },
    toolResult
  });
  const continuationResult = await enqueueAsyncToolContinuation(payload, toolResult);
  const messageDelta = projectQueueResultToMessageDelta(continuationResult);
  if (messageDelta && Array.isArray(messageDelta.messages) && messageDelta.messages.length > 0) {
    await websocketService.pushConversationMessageDelta({
      taskId,
      userId: payload?.userId || '',
      traceId: payload?.traceId || '',
      requestId: payload?.requestId || '',
      conversationId: payload?.conversationId || '',
      instanceId,
      delta: messageDelta,
      messages: messageDelta.messages
    });
  }
  const timeoutError = {
    code: 'ASYNC_TOOL_TASK_TIMEOUT',
    message: assistantContent
  };
  await deliverPlatformContinuationOutcome(payload, continuationResult, timeoutError);
  const eventPayload = typeof definition.buildTimeoutCompletionEvent === 'function'
    ? definition.buildTimeoutCompletionEvent(payload, toolResult)
    : asAsyncToolEventPayload({
        toolName: payload?.toolName || definition.defaultToolName,
        phase: 'timeout',
        text: assistantContent,
        data: {
          taskType: payload?.taskType || definition.taskType,
          timedOut: true
        }
      });
  await pushAsyncToolTaskEvent(payload, 'failed', eventPayload, {
    code: timeoutError.code,
    message: timeoutError.message
  });
  return true;
}

async function recordAgentAsyncToolTaskResult({
  taskId,
  resultKey,
  resultRef = {}
}) {
  const normalizedTaskId = normalizeText(taskId);
  const normalizedResultKey = normalizeText(resultKey);
  if (!normalizedTaskId || !normalizedResultKey) return false;

  const client = getRedisClient();
  const key = buildTaskKey(normalizedTaskId);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await client.watch(key);
    const current = await client.get(key);
    if (!current) {
      await client.unwatch();
      return false;
    }
    const payload = parseJsonObject(current, null);
    if (!payload) {
      await client.unwatch();
      return false;
    }
    if (payload.finalizedAt) {
      await client.unwatch();
      return false;
    }

    const definition = resolveTaskDefinition(payload.taskType);
    const nextResults = payload.results && typeof payload.results === 'object' ? { ...payload.results } : {};
    nextResults[normalizedResultKey] = await definition.loadResult(resultRef, payload);

    const nextPayload = {
      ...payload,
      results: nextResults
    };

    const execResult = await client.multi()
      .set(key, JSON.stringify(nextPayload), 'EX', TASK_TTL_SECONDS)
      .exec();
    if (!execResult) {
      continue;
    }

    const completedCount = Object.keys(nextResults).length;
    if (completedCount >= Number(payload.totalCount || 0)) {
      const lockKey = buildFinalizeLockKey(normalizedTaskId);
      const lock = await client.set(lockKey, '1', 'NX', 'EX', 600);
      if (lock === 'OK') {
        try {
          await persistFinalResult(nextPayload);
          await markTaskFinalized(nextPayload);
        } catch (error) {
          await pushAsyncToolTaskEvent(nextPayload, 'failed', null, {
            code: normalizeText(error?.code) || 'ASYNC_TOOL_FINALIZE_FAILED',
            message: normalizeText(error?.message) || 'async tool finalize failed'
          });
          throw error;
        }
      }
    }
    return true;
  }

  return false;
}

async function handleAsyncToolTaskTimeout(taskId) {
  const normalizedTaskId = normalizeText(taskId);
  if (!normalizedTaskId) return false;
  const payload = await readAgentAsyncToolTask(normalizedTaskId);
  if (!payload || payload.finalizedAt) return false;

  const timeoutAtMs = Date.parse(payload.timeoutAt || '');
  if (Number.isFinite(timeoutAtMs) && timeoutAtMs > Date.now()) {
    return false;
  }

  const client = getRedisClient();
  const lock = await client.set(buildFinalizeLockKey(normalizedTaskId), '1', 'NX', 'EX', 600);
  if (lock !== 'OK') return false;

  try {
    const latestPayload = await readAgentAsyncToolTask(normalizedTaskId);
    if (!latestPayload || latestPayload.finalizedAt) return false;
    await persistTimeoutResult(latestPayload);
    await markTaskFinalized(latestPayload);
    return true;
  } catch (error) {
    await pushAsyncToolTaskEvent(payload, 'failed', null, {
      code: normalizeText(error?.code) || 'ASYNC_TOOL_TIMEOUT_FINALIZE_FAILED',
      message: normalizeText(error?.message) || 'async tool timeout finalize failed'
    });
    throw error;
  }
}

module.exports = {
  createAgentAsyncToolTask,
  readAgentAsyncToolTask,
  recordAgentAsyncToolTaskResult,
  pushAsyncToolTaskEvent,
  handleAsyncToolTaskTimeout
};
