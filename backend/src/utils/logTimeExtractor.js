/**
 * 日志时间提取工具
 * 从日志文件名或内容中提取时间信息
 */

/**
 * 从日志文件名提取时间
 * 格式：YYYYMMDDhh_log.medbot 或 YYYYMMDDhhmm_log.medbot
 * @param {string} fileName - 日志文件名
 * @returns {Date|null} 提取的时间，失败返回null
 */
function extractTimeFromFileName(fileName) {
  if (!fileName || typeof fileName !== 'string') {
    return null;
  }

  try {
    // 匹配格式：YYYYMMDDhh_log.medbot 或 YYYYMMDDhhmm_log.medbot
    const match = fileName.match(/^(\d{10,12})_log\.medbot$/i);
    if (!match) {
      return null;
    }

    const timeStr = match[1];
    let year, month, day, hour, minute = 0;

    if (timeStr.length === 10) {
      // YYYYMMDDhh 格式
      year = parseInt(timeStr.substring(0, 4), 10);
      month = parseInt(timeStr.substring(4, 6), 10) - 1; // 月份从0开始
      day = parseInt(timeStr.substring(6, 8), 10);
      hour = parseInt(timeStr.substring(8, 10), 10);
    } else if (timeStr.length === 12) {
      // YYYYMMDDhhmm 格式
      year = parseInt(timeStr.substring(0, 4), 10);
      month = parseInt(timeStr.substring(4, 6), 10) - 1;
      day = parseInt(timeStr.substring(6, 8), 10);
      hour = parseInt(timeStr.substring(8, 10), 10);
      minute = parseInt(timeStr.substring(10, 12), 10);
    } else {
      return null;
    }

    // 验证日期有效性
    const date = new Date(year, month, day, hour, minute);
    if (date.getFullYear() !== year || 
        date.getMonth() !== month || 
        date.getDate() !== day) {
      return null;
    }

    return date;
  } catch (error) {
    console.warn('从文件名提取时间失败:', error.message);
    return null;
  }
}

/**
 * 从日志内容提取第一条日志的时间
 * 需要先解密第一行才能提取时间
 * @param {string} content - 日志文件内容
 * @param {string} key - 解密密钥（可选，如果提供则尝试解密）
 * @returns {Date|null} 提取的时间，失败返回null
 */
function extractTimeFromLogContent(content, key = null) {
  if (!content || typeof content !== 'string') {
    return null;
  }

  try {
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) {
      return null;
    }

    // 如果提供了密钥，尝试解密第一行
    if (key) {
      try {
        const { translatePerLine } = require('./decryptUtils');
        const entry = translatePerLine(lines[0], key);
        if (entry && entry.timestamp) {
          return new Date(entry.timestamp);
        }
      } catch (error) {
        // 解密失败，尝试其他方法
        console.warn('解密第一行失败，尝试其他方法:', error.message);
      }
    }

    // 如果解密失败或没有提供密钥，尝试从原始行中提取时间戳
    // 格式可能是：时间戳 错误码 参数...
    const parts = lines[0].trim().split(/\s+/);
    if (parts.length > 0) {
      // 尝试解析第一个部分为时间戳
      const timestamp = parseInt(parts[0], 10);
      if (!isNaN(timestamp) && timestamp > 0) {
        const date = new Date(timestamp);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    return null;
  } catch (error) {
    console.warn('从日志内容提取时间失败:', error.message);
    return null;
  }
}

/**
 * 从日志文件名或内容提取时间（优先文件名）
 * @param {string} fileName - 日志文件名
 * @param {string} content - 日志文件内容（可选）
 * @param {string} key - 解密密钥（可选，用于解密内容）
 * @returns {Date|null} 提取的时间，失败返回null
 */
function extractLogTime(fileName, content = null, key = null) {
  // 优先从文件名提取
  const timeFromFileName = extractTimeFromFileName(fileName);
  if (timeFromFileName) {
    return timeFromFileName;
  }

  // 如果文件名提取失败，尝试从内容提取
  if (content) {
    return extractTimeFromLogContent(content, key);
  }

  return null;
}

module.exports = {
  extractTimeFromFileName,
  extractTimeFromLogContent,
  extractLogTime
};

