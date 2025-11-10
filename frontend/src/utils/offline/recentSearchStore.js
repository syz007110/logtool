import { getOfflineDb, OFFLINE_STORES } from './db'

const DEFAULT_LIMIT = 5

function readFromLocalStorage (limit = DEFAULT_LIMIT) {
  try {
    const saved = JSON.parse(localStorage.getItem('errorCodeRecentSearches') || '[]')
    if (Array.isArray(saved)) {
      return saved.slice(0, limit)
    }
  } catch (_) {}
  return []
}

function writeToLocalStorage (items) {
  try {
    localStorage.setItem('errorCodeRecentSearches', JSON.stringify(items))
  } catch (_) {}
}

async function readRecentSearchesFromDb (db, limit) {
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORES.RECENT_SEARCHES, 'readonly')
    const store = tx.objectStore(OFFLINE_STORES.RECENT_SEARCHES)
    if (!store.indexNames.contains('updatedAt')) {
      resolve([])
      return
    }
    const index = store.index('updatedAt')
    const results = []
    index.openCursor(null, 'prev').onsuccess = (event) => {
      const cursor = event.target.result
      if (cursor && results.length < limit) {
        results.push(cursor.value.keyword)
        cursor.continue()
      } else {
        resolve(results)
      }
    }
    tx.onerror = () => reject(tx.error)
  })
}

async function trimRecentSearches (db, limit) {
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORES.RECENT_SEARCHES, 'readwrite')
    const store = tx.objectStore(OFFLINE_STORES.RECENT_SEARCHES)
    if (!store.indexNames.contains('updatedAt')) {
      resolve()
      return
    }
    const index = store.index('updatedAt')
    let count = 0
    index.openCursor(null, 'prev').onsuccess = (event) => {
      const cursor = event.target.result
      if (!cursor) {
        resolve()
        return
      }
      count += 1
      if (count > limit) {
        store.delete(cursor.primaryKey)
      }
      cursor.continue()
    }
    tx.onerror = () => reject(tx.error)
  })
}

export async function fetchRecentSearches (limit = DEFAULT_LIMIT) {
  try {
    const db = await getOfflineDb()
    const items = await readRecentSearchesFromDb(db, limit)
    if (items.length) {
      writeToLocalStorage(items)
      return items
    }
    const fallback = readFromLocalStorage(limit)
    if (fallback.length) {
      await Promise.all(fallback.map((keyword) => storeRecentSearch(keyword, limit)))
    }
    return fallback
  } catch (_) {
    return readFromLocalStorage(limit)
  }
}

export async function storeRecentSearch (keyword, limit = DEFAULT_LIMIT) {
  if (!keyword) {
    return fetchRecentSearches(limit)
  }
  const normalized = String(keyword).trim()
  if (!normalized) {
    return fetchRecentSearches(limit)
  }
  try {
    const db = await getOfflineDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_STORES.RECENT_SEARCHES, 'readwrite')
      const store = tx.objectStore(OFFLINE_STORES.RECENT_SEARCHES)
      store.put({ keyword: normalized, updatedAt: Date.now() })
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    await trimRecentSearches(db, limit)
    const result = await readRecentSearchesFromDb(db, limit)
    writeToLocalStorage(result)
    return result
  } catch (_) {
    const current = readFromLocalStorage(limit)
    const filtered = current.filter((item) => item !== normalized)
    filtered.unshift(normalized)
    const trimmed = filtered.slice(0, limit)
    writeToLocalStorage(trimmed)
    return trimmed
  }
}
