import { ref } from 'vue'
import api from '@/api'
import websocketClient from '@/services/websocketClient'
import { buildAssistantPayloadFromAgentResult } from '@/utils/mapErrorCodeToolToSourceCards'

const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function encodeBase32 (value, length) {
  let num = BigInt(value)
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out = ULID_ALPHABET[Number(num % 32n)] + out
    num /= 32n
  }
  return out
}

export function generateAgentMessageUlid (timestampMs = Date.now()) {
  const ts = BigInt(Number(timestampMs) || Date.now())
  const timePart = encodeBase32(ts, 10)
  const randomBytes = new Uint8Array(10)
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(randomBytes)
  } else {
    for (let i = 0; i < randomBytes.length; i += 1) {
      randomBytes[i] = Math.floor(Math.random() * 256)
    }
  }
  let rand = 0n
  for (const b of randomBytes) {
    rand = (rand << 8n) | BigInt(b)
  }
  return `${timePart}${encodeBase32(rand, 16)}`
}

function sleep (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function waitForAgentTaskViaWebSocket (taskId, { getCurrentUserId, timeoutMs = 300000 } = {}) {
  return new Promise((resolve, reject) => {
    const normalizedTaskId = String(taskId || '').trim()
    if (!normalizedTaskId) {
      reject(new Error('taskId missing'))
      return
    }
    const timer = setTimeout(() => {
      websocketClient.off('agentTaskStatusChange', onUpdate)
      reject(new Error('等待 Agent 任务结果超时'))
    }, timeoutMs)
    const onUpdate = (payload) => {
      if (String(payload?.taskId || '').trim() !== normalizedTaskId) return
      const status = String(payload?.status || '').trim().toLowerCase()
      if (status !== 'completed' && status !== 'failed') return
      const userId = String(payload?.userId || '').trim()
      const currentUserId = String(typeof getCurrentUserId === 'function' ? getCurrentUserId() : '').trim()
      if (currentUserId && userId && currentUserId !== userId) return
      clearTimeout(timer)
      websocketClient.off('agentTaskStatusChange', onUpdate)
      resolve(payload)
    }
    websocketClient.on('agentTaskStatusChange', onUpdate)
  })
}

async function pollAgentTaskUntilDone (taskId, { timeoutMs = 300000, intervalMs = 1500, shouldStop } = {}) {
  const normalizedTaskId = String(taskId || '').trim()
  if (!normalizedTaskId) throw new Error('taskId missing')
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (typeof shouldStop === 'function' && shouldStop()) return null
    const taskRes = await api.agent.getTask(normalizedTaskId)
    const task = taskRes?.data?.task || taskRes?.data || {}
    const status = String(task.status || taskRes?.data?.status || '').trim().toLowerCase()
    if (status === 'completed' || status === 'failed') {
      return {
        taskId: normalizedTaskId,
        status,
        result: task.result || task.response || {},
        error: task.error || null,
        conversationId: task.conversationId || task.result?.session?.conversationId
      }
    }
    await sleep(intervalMs)
  }
  throw new Error('等待 Agent 任务结果超时')
}

function normalizeAgentResult (raw) {
  const result = raw && typeof raw === 'object' ? raw : {}
  const text = String(result.text || '').trim()
  const instance = result.instance && typeof result.instance === 'object' ? result.instance : null
  const systemMessages = Array.isArray(result.systemMessages)
    ? result.systemMessages
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        kind: String(item.kind || '').trim() || 'system',
        title: String(item.title || '').trim() || '系统提示',
        text: String(item.text || '').trim(),
        presentation: String(item.presentation || '').trim() || 'banner'
      }))
      .filter((item) => item.text)
    : []
  return {
    text,
    toolTraces: Array.isArray(result.toolTraces) ? result.toolTraces : [],
    attachments: Array.isArray(result.attachments) ? result.attachments : [],
    systemMessages,
    assistantMode: String(result.assistantMode || '').trim() || 'llm_response',
    session: result.session && typeof result.session === 'object' ? result.session : null,
    instance,
    raw: result
  }
}

/**
 * Agent multi-turn chat for Smart Search entry.
 * @param {{ initialProviderId?: string, getCurrentUserId?: () => string }} options
 */
export function useAgentSmartChat (options = {}) {
  const conversationId = ref('')
  const instanceId = ref(null)
  const forceNewInstance = ref(false)
  const llmProviderId = ref(String(options.initialProviderId || '').trim())
  const sending = ref(false)

  function rememberSession (sessionOrId) {
    const cid = typeof sessionOrId === 'string'
      ? String(sessionOrId || '').trim()
      : String(sessionOrId?.conversationId || '').trim()
    const iid = Number(
      typeof sessionOrId === 'object' && sessionOrId
        ? sessionOrId.instanceId
        : 0
    )
    if (cid) conversationId.value = cid
    if (Number.isFinite(iid) && iid > 0) {
      instanceId.value = iid
      forceNewInstance.value = false
    }
  }

  function newConversation () {
    instanceId.value = null
    forceNewInstance.value = true
  }

  async function sendText (text, { attachments = [] } = {}) {
    const trimmed = String(text || '').trim()
    const readyAttachments = Array.isArray(attachments)
      ? attachments.filter((item) => item && item.status === 'available')
      : []
    if (!trimmed && readyAttachments.length === 0) {
      const err = new Error('text or attachment required')
      err.code = 'EMPTY_MESSAGE'
      throw err
    }

    sending.value = true
    try {
      websocketClient.connect()
      const sentAt = Date.now()
      const messageId = generateAgentMessageUlid(sentAt)
      const payloadAttachments = readyAttachments.map((item) => ({
        assetId: item.assetId,
        type: item.type || 'file',
        storage: item.storage,
        objectKey: item.objectKey,
        bucket: item.bucket ?? null,
        originalName: item.originalName,
        storedName: item.storedName,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        sha256: item.sha256,
        uploaderId: item.uploaderId,
        source: item.source,
        previewUrl: item.previewUrl,
        url: item.url,
        width: item.width ?? null,
        height: item.height ?? null,
        status: item.status
      }))
      const channel = {
        type: 'web',
        conversationType: 'single'
      }
      if (conversationId.value) {
        channel.conversationId = conversationId.value
      }
      const context = {}
      const providerId = String(llmProviderId.value || '').trim()
      if (providerId) context.llmProviderId = providerId

      const payload = {
        message: {
          externalMessageId: messageId,
          type: readyAttachments.length > 0 ? 'text+attachment' : 'text',
          text: trimmed,
          attachments: payloadAttachments,
          sentAt
        },
        channel,
        session: (() => {
          const session = {}
          if (forceNewInstance.value === true) session.forceNewInstance = true
          return Object.keys(session).length > 0 ? session : undefined
        })(),
        context,
        llmProviderId: providerId || undefined
      }

      const res = await api.agent.execute(payload)
      const mode = String(res?.data?.mode || '').trim().toLowerCase()
      const taskId = String(res?.data?.taskId || '').trim()

        if (mode === 'accepted') {
        if (!taskId) throw new Error('agent taskId missing')
        rememberSession(res?.data?.session)
        let done = false
        const markDone = () => { done = true }
        let settled
        try {
          const wsWait = waitForAgentTaskViaWebSocket(taskId, {
            getCurrentUserId: options.getCurrentUserId
          }).then((wsPayload) => {
            markDone()
            return { source: 'ws', wsPayload }
          })
          const pollWait = pollAgentTaskUntilDone(taskId, {
            shouldStop: () => done
          }).then((pollPayload) => {
            if (!pollPayload) return wsWait
            markDone()
            return { source: 'poll', pollPayload }
          })
          settled = await Promise.race([wsWait, pollWait])
        } catch (err) {
          // Last chance: short poll if WS listener raced / both paths failed transiently.
          const pollPayload = await pollAgentTaskUntilDone(taskId, { timeoutMs: 8000, intervalMs: 500 })
          if (!pollPayload) throw err
          settled = { source: 'poll', pollPayload }
        }

        if (settled.source === 'ws') {
          const wsPayload = settled.wsPayload
          const asyncStatus = String(wsPayload?.status || '').trim().toLowerCase()
          if (asyncStatus === 'failed') {
            throw new Error(String(wsPayload?.error?.message || '任务失败'))
          }
          let result = normalizeAgentResult(wsPayload?.result || {})
          if (!result.text && !result.toolTraces.length) {
            const taskRes = await api.agent.getTask(taskId)
            const task = taskRes?.data?.task || taskRes?.data || {}
            result = normalizeAgentResult(task.result || task.response || {})
          }
          rememberSession(result.session || wsPayload?.conversationId)
          forceNewInstance.value = false
          return {
            ...result,
            mode: 'completed',
            taskId,
            payload: buildAssistantPayloadFromAgentResult(result)
          }
        }

        const pollPayload = settled.pollPayload
        if (String(pollPayload.status || '').toLowerCase() === 'failed') {
          throw new Error(String(pollPayload?.error?.message || '任务失败'))
        }
        const result = normalizeAgentResult(pollPayload.result || {})
        rememberSession(result.session || pollPayload.conversationId)
        forceNewInstance.value = false
        return {
          ...result,
          mode: 'completed',
          taskId,
          payload: buildAssistantPayloadFromAgentResult(result)
        }
      }

      const finalResponse = res?.data?.response
      if (mode !== 'completed' || !finalResponse) {
        throw new Error('agent response missing')
      }
      const result = normalizeAgentResult(finalResponse)
      rememberSession(result.session || res?.data?.session)
      forceNewInstance.value = false
      return {
        ...result,
        mode: 'completed',
        taskId: taskId || undefined,
        payload: buildAssistantPayloadFromAgentResult(result)
      }
    } finally {
      sending.value = false
    }
  }

  async function listConversations (params) {
    const res = await api.agent.listConversations(params)
    return Array.isArray(res?.data?.conversations) ? res.data.conversations : []
  }

  async function loadConversation (id) {
    const iid = Number(id || 0)
    if (!Number.isFinite(iid) || iid <= 0) {
      const err = new Error('instanceId required')
      err.code = 'INVALID_ARGUMENT'
      throw err
    }
    const res = await api.agent.getConversationMessages(iid)
    const rows = Array.isArray(res?.data?.messages) ? res.data.messages : []
    const instance = res?.data?.instance && typeof res.data.instance === 'object'
      ? res.data.instance
      : null
    rememberSession({
      conversationId: res?.data?.conversationId,
      instanceId: res?.data?.instanceId || iid
    })
    return {
      instance,
      messages: rows.map((row) => {
      const role = String(row.role || '').trim()
      if (role === 'user') {
        return {
          role: 'user',
          content: String(row.content || row.text || ''),
          createdAt: row.createdAt,
          payload: null,
          attachments: Array.isArray(row.attachments) ? row.attachments : []
        }
      }
      const agentLike = {
        text: String(row.content || row.text || ''),
        toolTraces: Array.isArray(row.toolTraces) ? row.toolTraces : [],
        attachments: Array.isArray(row.attachments) ? row.attachments : []
      }
      return {
        role: 'assistant',
        content: agentLike.text,
        createdAt: row.createdAt,
        payload: buildAssistantPayloadFromAgentResult(agentLike),
        attachments: agentLike.attachments
      }
      })
    }
  }

  async function deleteConversation (id) {
    const iid = Number(id || 0)
    if (!Number.isFinite(iid) || iid <= 0) {
      const err = new Error('instanceId required')
      err.code = 'INVALID_ARGUMENT'
      throw err
    }
    await api.agent.deleteConversation(iid)
    if (instanceId.value === iid) {
      instanceId.value = null
      forceNewInstance.value = false
    }
  }

  return {
    conversationId,
    instanceId,
    forceNewInstance,
    llmProviderId,
    sending,
    newConversation,
    rememberSession,
    sendText,
    listConversations,
    loadConversation,
    deleteConversation,
    generateAgentMessageUlid
  }
}

export default useAgentSmartChat
