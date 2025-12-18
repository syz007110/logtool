/**
 * 修复后的时间格式化工具
 * 处理UTC时间到本地时间的转换，确保所有页面显示一致
 */

// 服务器时区偏移量（分钟）
let serverOffsetMinutes = null

/**
 * 加载服务器时区信息
 */
export const loadServerTimezone = async () => {
  try {
    const resp = await fetch('/api/timezone')
    const json = await resp.json()
    if (typeof json.offsetMinutes === 'number') {
      serverOffsetMinutes = json.offsetMinutes
    }
  } catch (error) {
    console.warn('加载服务器时区信息失败:', error)
    serverOffsetMinutes = null
  }
}

/**
 * 统一的时间格式化函数
 * 将UTC时间转换为服务器时区时间显示
 * @param {string|Date|number} timestamp - 时间戳
 * @param {boolean} useServerTimezone - 是否使用服务器时区转换，默认为true
 * @param {boolean} isUtcTime - 输入时间是否为UTC时间，默认为true（数据库时间）
 * @returns {string} 格式化后的时间字符串
 */
export const formatTime = (timestamp, useServerTimezone = true, isUtcTime = true) => {
  if (!timestamp) return '-'

  // 如果明确指定为本地时间且是本地时间格式，直接返回
  if (!isUtcTime && typeof timestamp === 'string' && /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(timestamp)) {
    return timestamp
  }

  let date

  // 处理不同的时间格式
  if (typeof timestamp === 'string') {
    // 如果是UTC格式 YYYY-MM-DD HH:mm:ss，需要添加UTC标识符
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(timestamp)) {
      // 这是数据库中的UTC格式，需要添加Z标识符
      const utcTimeStr = timestamp.replace(' ', 'T') + 'Z'
      date = new Date(utcTimeStr)
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(timestamp)) {
      // 如果是ISO格式的UTC时间 YYYY-MM-DDTHH:mm:ss.fffZ
      date = new Date(timestamp)
    } else {
      date = new Date(timestamp)
    }
  } else {
    date = new Date(timestamp)
  }

  if (isNaN(date.getTime())) return '-'

  // 如果启用服务器时区转换
  if (useServerTimezone) {
    if (serverOffsetMinutes !== null) {
      // 以服务端时区为准：将UTC时间转换为服务器时区时间
      const localOffset = -date.getTimezoneOffset()
      const delta = (serverOffsetMinutes - localOffset) * 60 * 1000
      date.setTime(date.getTime() + delta)
    }
    // 注意：JavaScript的Date对象会自动处理时区转换
    // 如果输入是UTC时间，Date对象会自动转换为本地时间显示
    // 我们不需要手动加减8小时
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  const result = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`

  return result
}

/**
 * 格式化短时间（只显示时分）
 * @param {string|Date|number} timestamp - 时间戳
 * @param {boolean} useServerTimezone - 是否使用服务器时区转换，默认为true
 * @param {boolean} isUtcTime - 输入时间是否为UTC时间，默认为true（数据库时间）
 * @returns {string} 格式化后的时间字符串
 */
export const formatTimeShort = (timestamp, useServerTimezone = true, isUtcTime = true) => {
  if (!timestamp) return '-'

  const date = new Date(timestamp)
  if (isNaN(date.getTime())) return '-'

  // 如果启用服务器时区转换
  if (useServerTimezone) {
    if (serverOffsetMinutes !== null) {
      const localOffset = -date.getTimezoneOffset()
      const delta = (serverOffsetMinutes - localOffset) * 60 * 1000
      date.setTime(date.getTime() + delta)
    }
    // 注意：JavaScript的Date对象会自动处理时区转换
    // 如果输入是UTC时间，Date对象会自动转换为本地时间显示
    // 我们不需要手动加减8小时
  }

  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${hours}:${minutes}`
}

/**
 * 格式化手术时间范围
 * @param {Object} surgery - 手术对象
 * @param {boolean} useServerTimezone - 是否使用服务器时区转换，默认为true
 * @returns {string} 格式化后的时间范围字符串
 */
export const formatSurgeryTime = (surgery, useServerTimezone = false) => {
  if (!surgery.surgery_start_time || !surgery.surgery_end_time) {
    return '手术时间未确定'
  }

  const start = formatTime(surgery.surgery_start_time, useServerTimezone, false) // 原始时间，无时区
  const end = formatTime(surgery.surgery_end_time, useServerTimezone, false) // 原始时间，无时区

  return `${start} ~ ${end}`
}

/**
 * 获取服务器时区信息
 * @returns {Object|null} 服务器时区信息
 */
export const getServerTimezone = () => {
  return serverOffsetMinutes !== null ? { offsetMinutes: serverOffsetMinutes } : null
}

/**
 * 格式化系统时间（用于显示创建时间、更新时间等）
 * 使用24小时制，格式：YYYY-MM-DD HH:mm:ss
 * @param {string|Date|number} timestamp - 时间戳
 * @returns {string} 格式化后的时间字符串
 */
export const formatSystemTime = (timestamp) => {
  if (!timestamp) return '-'

  const date = new Date(timestamp)
  if (isNaN(date.getTime())) return '-'

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

/**
 * 检查是否已加载服务器时区信息
 * @returns {boolean} 是否已加载
 */
export const isServerTimezoneLoaded = () => {
  return serverOffsetMinutes !== null
}
