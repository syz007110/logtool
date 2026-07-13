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

function normalizeAgentResult (raw) {
  const result = raw && typeof raw === 'object' ? raw : {}
  return {
    text: String(result.text || '').trim(),
    toolTraces: Array.isArray(result.toolTraces) ? result.toolTraces : [],
    attachments: Array.isArray(result.attachments) ? result.attachments : [],
    session: result.session && typeof result.session === 'object' ? result.session : null,
    instance: result.instance && typeof result.instance === 'object' ? result.instance : null,
    raw: result
  }
}

/**
 * Agent multi-turn chat for Smart Search entry.
 * @param {{ initialProviderId?: string, getCurrentUserId?: () => string }} options
 */
export function useAgentSmartChat (options = {}) {
  const conversationId = ref('')
  const llmProviderId = ref(String(options.initialProviderId || '').trim())
  const sending = ref(false)

  function rememberConversationId (sessionOrId) {
    const id = typeof sessionOrId === 'string'
      ? String(sessionOrId || '').trim()
      : String(sessionOrId?.conversationId || '').trim()
    if (id) conversationId.value = id
  }

  function newConversation () {
    conversationId.value = ''
  }

  async function sendText (text, { attachments = [] } = {}) {
    const trimmed = String(text || '').trim()
    const readyAttachments = Array.isArray(attachments)
      ? attachments.filter((item) => item && item.status === 'ready')
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
        type: item.type || 'file',
        fileId: item.id,
        url: item.url,
        name: item.name,
        size: item.size,
        mimeType: item.mimeType,
        objectKey: item.objectKey,
        storage: item.storage
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
          type: readyAttachments.length > 0 ? (readyAttachments[0]?.type || 'file') : 'text',
          text: trimmed,
          attachments: payloadAttachments,
          sentAt
        },
        channel,
        context,
        llmProviderId: providerId || undefined
      }

      const res = await api.agent.execute(payload)
      const mode = String(res?.data?.mode || '').trim().toLowerCase()
      const taskId = String(res?.data?.taskId || '').trim()

      if (mode === 'accepted') {
        if (!taskId) throw new Error('agent taskId missing')
        rememberConversationId(res?.data?.session)
        const wsPayload = await waitForAgentTaskViaWebSocket(taskId, {
          getCurrentUserId: options.getCurrentUserId
        })
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
        rememberConversationId(result.session || wsPayload?.conversationId)
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
      rememberConversationId(result.session || res?.data?.session)
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
    const cid = String(id || '').trim()
    if (!cid) {
      const err = new Error('conversationId required')
      err.code = 'INVALID_ARGUMENT'
      throw err
    }
    conversationId.value = cid
    const res = await api.agent.getConversationMessages(cid)
    const rows = Array.isArray(res?.data?.messages) ? res.data.messages : []
    return rows.map((row) => {
      const role = String(row.role || '').trim()
      if (role === 'user') {
        return {
          role: 'user',
          content: String(row.content || row.text || ''),
          createdAt: row.createdAt,
          payload: null
        }
      }
      const agentLike = {
        text: String(row.content || row.text || ''),
        toolTraces: Array.isArray(row.toolTraces) ? row.toolTraces : []
      }
      return {
        role: 'assistant',
        content: agentLike.text,
        createdAt: row.createdAt,
        payload: buildAssistantPayloadFromAgentResult(agentLike)
      }
    })
  }

  return {
    conversationId,
    llmProviderId,
    sending,
    newConversation,
    rememberConversationId,
    sendText,
    listConversations,
    loadConversation,
    generateAgentMessageUlid
  }
}

export default useAgentSmartChat
