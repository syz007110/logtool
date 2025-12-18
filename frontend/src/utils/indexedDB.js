// IndexedDB工具类，用于处理大数据存储
class IndexedDBManager {
  constructor() {
    this.dbName = 'LogToolDB'
    this.dbVersion = 1
    this.storeName = 'logEntries'
    this.db = null
  }

  // 初始化数据库
  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion)

      request.onerror = () => {
        console.error('IndexedDB打开失败:', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        console.log('IndexedDB初始化成功')
        resolve(this.db)
      }

      request.onupgradeneeded = (event) => {
        const db = event.target.result
        
        // 创建对象存储
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true })
          store.createIndex('timestamp', 'timestamp', { unique: false })
          store.createIndex('logId', 'logId', { unique: false })
          console.log('IndexedDB对象存储创建成功')
        }
      }
    })
  }

  // 存储日志条目数据
  async storeLogEntries(data, logId = null) {
    if (!this.db) {
      await this.initDB()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)

      // 生成唯一ID
      const dataId = `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      const logData = {
        id: dataId,
        logId: logId,
        data: data,
        timestamp: new Date().toISOString(),
        count: data.length
      }

      const request = store.add(logData)

      request.onsuccess = () => {
        console.log('数据存储到IndexedDB成功:', dataId, '条记录:', data.length)
        resolve(dataId)
      }

      request.onerror = () => {
        console.error('数据存储到IndexedDB失败:', request.error)
        reject(request.error)
      }
    })
  }

  // 获取日志条目数据
  async getLogEntries(dataId) {
    if (!this.db) {
      await this.initDB()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.get(dataId)

      request.onsuccess = () => {
        if (request.result) {
          console.log('从IndexedDB获取数据成功:', request.result.count, '条记录')
          resolve(request.result.data)
        } else {
          console.warn('IndexedDB中未找到数据:', dataId)
          resolve([])
        }
      }

      request.onerror = () => {
        console.error('从IndexedDB获取数据失败:', request.error)
        reject(request.error)
      }
    })
  }

  // 删除数据
  async deleteLogEntries(dataId) {
    if (!this.db) {
      await this.initDB()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const request = store.delete(dataId)

      request.onsuccess = () => {
        console.log('从IndexedDB删除数据成功:', dataId)
        resolve()
      }

      request.onerror = () => {
        console.error('从IndexedDB删除数据失败:', request.error)
        reject(request.error)
      }
    })
  }

  // 清理旧数据
  async cleanupOldData(maxAge = 24 * 60 * 60 * 1000) { // 默认24小时
    if (!this.db) {
      await this.initDB()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const request = store.getAll()

      request.onsuccess = () => {
        const now = new Date().getTime()
        const cutoff = now - maxAge
        let deletedCount = 0

        request.result.forEach(item => {
          const itemTime = new Date(item.timestamp).getTime()
          if (itemTime < cutoff) {
            store.delete(item.id)
            deletedCount++
          }
        })

        console.log('清理IndexedDB旧数据完成，删除了', deletedCount, '条记录')
        resolve(deletedCount)
      }

      request.onerror = () => {
        console.error('清理IndexedDB旧数据失败:', request.error)
        reject(request.error)
      }
    })
  }
}

// 创建单例实例
const indexedDBManager = new IndexedDBManager()

export default indexedDBManager 