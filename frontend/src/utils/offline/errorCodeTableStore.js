import { getOfflineDb, OFFLINE_STORES } from './db'

const META_KEY = 'errorCodesSyncedAt'

function toNormalizedCode (input) {
  if (!input) return ''
  const raw = String(input).trim().toUpperCase()
  if (/^(?:0X)?[0-9A-F]{3}[A-E]$/.test(raw)) {
    return raw.startsWith('0X') ? raw : `0X${raw}`
  }
  if (raw.length >= 4) {
    const tail = raw.slice(-4)
    if (/^[0-9A-F]{3}[A-E]$/.test(tail)) {
      return `0X${tail}`
    }
  }
  return raw
}

function makeCodeKey (code, subsystem) {
  const normalized = toNormalizedCode(code)
  const subsystemCode = (subsystem || '').toString().trim().toUpperCase()
  return `${normalized}|${subsystemCode}`
}

function deriveFullCode (normalizedCode, subsystem) {
  if (!normalizedCode) return ''
  const suffix = normalizedCode.replace(/^0X/, '')
  return `${(subsystem || '').toString().toUpperCase()}${suffix}`
}

function toPlainRecord (record) {
  if (!record || typeof record !== 'object') return record
  const cloneFn = typeof globalThis.structuredClone === 'function' ? globalThis.structuredClone : null
  if (cloneFn) {
    try {
      return cloneFn(record)
    } catch (_) {
      // ignore structuredClone failure and fallback to JSON strategy
    }
  }
  try {
    return JSON.parse(JSON.stringify(record))
  } catch (jsonError) {
    console.warn('[errorCodeTableStore] Failed to serialize record, using shallow copy', jsonError)
    return { ...record }
  }
}

function buildSearchText (record, normalizedCode, subsystem) {
  const fields = [
    normalizedCode,
    subsystem,
    deriveFullCode(normalizedCode, subsystem),
    record.code,
    record.full_code,
    record.short_message,
    record.user_hint,
    record.operation,
    record.detail,
    record.method,
    record.tech_solution,
    record.category
  ]
  return fields
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function toStoredEntity (record) {
  const plainRecord = toPlainRecord(record) || {}
  const subsystem = (plainRecord.subsystem || '').toString().trim().toUpperCase()
  const normalizedCode = toNormalizedCode(plainRecord.code)
  const codeKey = makeCodeKey(normalizedCode, subsystem)
  return {
    codeKey,
    subsystem,
    normalizedCode,
    fullCode: deriveFullCode(normalizedCode, subsystem),
    searchText: buildSearchText(plainRecord, normalizedCode, subsystem),
    data: plainRecord,
    updatedAt: Date.now()
  }
}

export async function replaceErrorCodes (records) {
  const db = await getOfflineDb()
  await new Promise((resolve, reject) => {
    const tx = db.transaction([OFFLINE_STORES.ERROR_CODE_TABLE, OFFLINE_STORES.META], 'readwrite')
    const table = tx.objectStore(OFFLINE_STORES.ERROR_CODE_TABLE)
    table.clear()
    const entities = records.map(toStoredEntity)
    entities.forEach((entity) => table.put(entity))
    const meta = tx.objectStore(OFFLINE_STORES.META)
    meta.put({ key: META_KEY, value: Date.now() })
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}

export async function upsertErrorCodes (records) {
  if (!records || !records.length) return
  const db = await getOfflineDb()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORES.ERROR_CODE_TABLE, 'readwrite')
    const table = tx.objectStore(OFFLINE_STORES.ERROR_CODE_TABLE)
    records.map(toStoredEntity).forEach((entity) => table.put(entity))
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}

export async function getErrorCodeLocal (code, subsystem) {
  const db = await getOfflineDb()
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORES.ERROR_CODE_TABLE, 'readonly')
    const table = tx.objectStore(OFFLINE_STORES.ERROR_CODE_TABLE)
    const request = table.get(makeCodeKey(code, subsystem))
    request.onsuccess = () => resolve(request.result ? request.result.data : null)
    request.onerror = () => reject(request.error)
  })
}

export async function searchErrorCodesLocal (keyword) {
  const trimmed = (keyword || '').trim().toLowerCase()
  if (!trimmed) return []
  const db = await getOfflineDb()
  return await new Promise((resolve, reject) => {
    const results = []
    const tx = db.transaction(OFFLINE_STORES.ERROR_CODE_TABLE, 'readonly')
    const table = tx.objectStore(OFFLINE_STORES.ERROR_CODE_TABLE)
    table.openCursor().onsuccess = (event) => {
      const cursor = event.target.result
      if (!cursor) {
        resolve(results)
        return
      }
      const value = cursor.value
      if (value && value.searchText.includes(trimmed)) {
        results.push(value.data)
      }
      cursor.continue()
    }
    tx.onerror = () => reject(tx.error)
  })
}

export async function getErrorCodeCount () {
  const db = await getOfflineDb()
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORES.ERROR_CODE_TABLE, 'readonly')
    const table = tx.objectStore(OFFLINE_STORES.ERROR_CODE_TABLE)
    const request = table.count()
    request.onsuccess = () => resolve(request.result || 0)
    request.onerror = () => reject(request.error)
  })
}

export async function getErrorCodeSyncMeta () {
  const db = await getOfflineDb()
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORES.META, 'readonly')
    const store = tx.objectStore(OFFLINE_STORES.META)
    const request = store.get(META_KEY)
    request.onsuccess = () => resolve(request.result ? request.result.value : null)
    request.onerror = () => reject(request.error)
  })
}

export async function clearErrorCodes () {
  const db = await getOfflineDb()
  await new Promise((resolve, reject) => {
    const tx = db.transaction([OFFLINE_STORES.ERROR_CODE_TABLE, OFFLINE_STORES.META], 'readwrite')
    tx.objectStore(OFFLINE_STORES.ERROR_CODE_TABLE).clear()
    tx.objectStore(OFFLINE_STORES.META).delete(META_KEY)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}

export { toNormalizedCode as normalizeCachedCode }
