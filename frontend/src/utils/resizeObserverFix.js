// ResizeObserver 错误处理工具
// 用于解决 Element Plus 和 Vue 3 中的 ResizeObserver 错误

// 错误消息模式
const RESIZE_OBSERVER_ERROR_PATTERNS = [
  'ResizeObserver loop completed with undelivered notifications',
  'ResizeObserver loop limit exceeded',
  'ResizeObserver loop'
]

// 检查是否是 ResizeObserver 错误
const isResizeObserverError = (error) => {
  if (!error) return false

  const message = typeof error === 'string' ? error : error.message || ''
  return RESIZE_OBSERVER_ERROR_PATTERNS.some(pattern => message.includes(pattern))
}

// 抑制 ResizeObserver 错误
export const suppressResizeObserverErrors = () => {
  // 保存原始方法
  const originalError = console.error
  const originalWarn = console.warn
  const originalLog = console.log

  // 重写 console.error
  console.error = (...args) => {
    if (args.some(arg => isResizeObserverError(arg))) {
      return
    }
    originalError.apply(console, args)
  }

  // 重写 console.warn
  console.warn = (...args) => {
    if (args.some(arg => isResizeObserverError(arg))) {
      return
    }
    originalWarn.apply(console, args)
  }

  // 重写 console.log
  console.log = (...args) => {
    if (args.some(arg => isResizeObserverError(arg))) {
      return
    }
    originalLog.apply(console, args)
  }

  // 处理全局错误事件
  const handleGlobalError = (event) => {
    if (isResizeObserverError(event.error) || isResizeObserverError(event.message)) {
      event.preventDefault()
      return false
    }
  }

  // 处理未捕获的 Promise 错误
  const handleUnhandledRejection = (event) => {
    if (isResizeObserverError(event.reason)) {
      event.preventDefault()
      return false
    }
  }

  // 添加事件监听器
  window.addEventListener('error', handleGlobalError)
  window.addEventListener('unhandledrejection', handleUnhandledRejection)

  // 处理 webpack-dev-server 的错误
  if (process.env.NODE_ENV === 'development') {
    // 覆盖 webpack-dev-server 的错误处理
    if (window.handleError) {
      const originalHandleError = window.handleError
      window.handleError = (error) => {
        if (isResizeObserverError(error)) {
          return
        }
        return originalHandleError(error)
      }
    }

    // 尝试禁用 webpack-dev-server 的错误显示
    if (window.__webpack_dev_server_client__) {
      const client = window.__webpack_dev_server_client__
      if (client && client.overlay) {
        try {
          client.overlay = {
            ...client.overlay,
            errors: false,
            warnings: false
          }
        } catch (e) {
          // 忽略配置错误
        }
      }
    }
  }

  // 返回清理函数
  return () => {
    console.error = originalError
    console.warn = originalWarn
    console.log = originalLog
    window.removeEventListener('error', handleGlobalError)
    window.removeEventListener('unhandledrejection', handleUnhandledRejection)
  }
}

// 创建安全的 ResizeObserver
export const createSafeResizeObserver = (callback) => {
  if (!window.ResizeObserver) {
    return null
  }

  return new window.ResizeObserver((entries, observer) => {
    try {
      callback(entries, observer)
    } catch (error) {
      if (isResizeObserverError(error)) {
        // 忽略 ResizeObserver 错误
        return
      }
      // 重新抛出其他错误
      throw error
    }
  })
}

// 防抖函数
export const debounce = (func, wait) => {
  let timeout
  return function executedFunction (...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

// 节流函数
export const throttle = (func, limit) => {
  let inThrottle
  return function executedFunction (...args) {
    if (!inThrottle) {
      func.apply(this, args)
      inThrottle = true
      setTimeout(() => inThrottle = false, limit)
    }
  }
}

// 安全的 nextTick
export const safeNextTick = (callback) => {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (callback) {
          callback()
        }
        resolve()
      })
    })
  })
}

// 初始化 ResizeObserver 错误处理
export const initResizeObserverFix = () => {
  // 立即应用错误抑制
  const cleanup = suppressResizeObserverErrors()

  // 在页面卸载时清理
  window.addEventListener('beforeunload', cleanup)

  return cleanup
}

// 默认导出
export default {
  suppressResizeObserverErrors,
  createSafeResizeObserver,
  debounce,
  throttle,
  safeNextTick,
  initResizeObserverFix,
  isResizeObserverError
}
