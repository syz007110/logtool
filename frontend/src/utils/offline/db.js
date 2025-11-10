const DB_NAME = 'logtool_offline'
const DB_VERSION = 2

export const OFFLINE_STORES = {
  ERROR_CODE_TABLE: 'error_code_table',
  RECENT_SEARCHES: 'recent_searches',
  META: 'offline_meta'
}

let dbPromise = null

export function resetOfflineDb () {
  if (dbPromise) {
    dbPromise.then((db) => db.close()).catch(() => {})
    dbPromise = null
  }
}

export function getOfflineDb () {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB is not supported'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      ensureStores(db)
    }
    request.onsuccess = () => {
      const db = request.result
      ensureStores(db)
      resolve(db)
    }
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

function ensureStores (db) {
  if (!db.objectStoreNames.contains(OFFLINE_STORES.ERROR_CODE_TABLE)) {
    const store = db.createObjectStore(OFFLINE_STORES.ERROR_CODE_TABLE, { keyPath: 'codeKey' })
    store.createIndex('updatedAt', 'updatedAt')
  }
  if (!db.objectStoreNames.contains(OFFLINE_STORES.RECENT_SEARCHES)) {
    const store = db.createObjectStore(OFFLINE_STORES.RECENT_SEARCHES, { keyPath: 'keyword' })
    store.createIndex('updatedAt', 'updatedAt')
  }
  if (!db.objectStoreNames.contains(OFFLINE_STORES.META)) {
    db.createObjectStore(OFFLINE_STORES.META, { keyPath: 'key' })
  }
}
