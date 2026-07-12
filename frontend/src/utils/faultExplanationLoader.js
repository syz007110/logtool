/**
 * 手术可视化等场景：批量加载故障码释义（去重 + 分块 + 429 退避）
 */

const BATCH_CHUNK_SIZE = 100
const MAX_429_RETRIES = 4

export function composeExplanationText (data) {
  if (!data || !data.explanation) return null
  const explanation = data.explanation
  const prefix = data.prefix
  const prefixRaw = data.prefix_raw
  if (prefix && prefixRaw && String(explanation).startsWith(prefixRaw)) {
    const body = String(explanation).slice(prefixRaw.length).replace(/^\s+/, '')
    return body ? `${prefix} ${body}` : prefix
  }
  return explanation
}

export function buildFaultExplanationDedupKey ({
  errorCode,
  param1,
  param2,
  param3,
  param4,
  subsystem,
  lang
}) {
  return [
    String(errorCode || ''),
    String(subsystem || ''),
    String(param1 ?? ''),
    String(param2 ?? ''),
    String(param3 ?? ''),
    String(param4 ?? ''),
    String(lang || '')
  ].join('|')
}

function sleep (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRateLimitedError (error) {
  return Number(error?.response?.status) === 429
}

function getRetryAfterMs (error, attempt) {
  const retryAfterSec = Number(error?.response?.data?.retryAfter || 0)
  if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
    return retryAfterSec * 1000
  }
  return Math.min(30000, 1000 * (2 ** attempt))
}

/**
 * @param {object} options
 * @param {Array} options.rows 故障行
 * @param {(row: any) => ({ rowKey, errorCode, param1, param2, param3, param4, subsystem }|null)} options.mapRow
 * @param {string} [options.lang]
 * @param {(payload: object) => Promise} options.previewBatch axios 风格，返回 { data: { results } }
 * @param {(rowKey: string, text: string) => void} options.onExplanation
 * @param {Set} [options.loadingSet] 可选：加载中 rowKey 集合（与页面 loading UI 同步）
 * @param {Set|Map} [options.existingKeys] 已有释义的 rowKey（Map 或 Set）
 * @param {(row: any) => boolean} [options.shouldSkipRow] 额外跳过条件
 */
export async function loadFaultExplanationsBatch ({
  rows,
  mapRow,
  lang,
  previewBatch,
  onExplanation,
  loadingSet,
  existingKeys,
  shouldSkipRow
}) {
  if (!Array.isArray(rows) || rows.length === 0) return

  const hasExisting = (rowKey) => {
    if (!existingKeys) return false
    if (typeof existingKeys.has === 'function') return existingKeys.has(rowKey)
    return false
  }

  /** @type {Map<string, { payload: object, rowKeys: string[] }>} */
  const groups = new Map()

  for (const row of rows) {
    if (shouldSkipRow && shouldSkipRow(row)) continue
    const mapped = mapRow(row)
    if (!mapped || !mapped.rowKey || !mapped.errorCode || mapped.errorCode === '-') continue
    if (hasExisting(mapped.rowKey)) continue
    if (loadingSet && loadingSet.has(mapped.rowKey)) continue

    const dedupKey = buildFaultExplanationDedupKey({
      errorCode: mapped.errorCode,
      param1: mapped.param1,
      param2: mapped.param2,
      param3: mapped.param3,
      param4: mapped.param4,
      subsystem: mapped.subsystem,
      lang
    })

    if (!groups.has(dedupKey)) {
      groups.set(dedupKey, {
        payload: {
          id: dedupKey,
          code: mapped.errorCode,
          subsystem: mapped.subsystem || undefined,
          param1: mapped.param1 || undefined,
          param2: mapped.param2 || undefined,
          param3: mapped.param3 || undefined,
          param4: mapped.param4 || undefined,
          lang: lang || undefined
        },
        rowKeys: []
      })
    }
    groups.get(dedupKey).rowKeys.push(mapped.rowKey)
  }

  if (groups.size === 0) return

  const allRowKeys = []
  groups.forEach((g) => {
    g.rowKeys.forEach((k) => allRowKeys.push(k))
  })
  if (loadingSet) {
    allRowKeys.forEach((k) => loadingSet.add(k))
  }

  const chunks = []
  const groupList = Array.from(groups.values())
  for (let i = 0; i < groupList.length; i += BATCH_CHUNK_SIZE) {
    chunks.push(groupList.slice(i, i + BATCH_CHUNK_SIZE))
  }

  try {
    for (const chunk of chunks) {
      const items = chunk.map((g) => g.payload)
      let attempt = 0
      while (true) {
        try {
          const resp = await previewBatch({
            items,
            lang: lang || undefined
          })
          const results = resp?.data?.results || []
          const byId = new Map(results.map((r) => [String(r.id), r]))
          chunk.forEach((g) => {
            const result = byId.get(String(g.payload.id))
            if (!result || !result.ok) return
            const text = composeExplanationText(result)
            if (!text) return
            g.rowKeys.forEach((rowKey) => onExplanation(rowKey, text))
          })
          break
        } catch (error) {
          if (isRateLimitedError(error) && attempt < MAX_429_RETRIES) {
            const waitMs = getRetryAfterMs(error, attempt)
            attempt += 1
            console.warn(`故障释义批量请求被限流，${waitMs}ms 后重试 (${attempt}/${MAX_429_RETRIES})`)
            await sleep(waitMs)
            continue
          }
          console.warn('故障释义批量加载失败:', error)
          break
        }
      }
    }
  } finally {
    if (loadingSet) {
      allRowKeys.forEach((k) => loadingSet.delete(k))
    }
  }
}
