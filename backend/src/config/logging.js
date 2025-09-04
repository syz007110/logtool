/**
 * 日志配置管理
 * 统一管理系统的日志级别和输出格式
 */

const LOG_LEVELS = {
  ERROR: 0,    // 错误 - 总是输出
  WARN: 1,     // 警告 - 总是输出
  INFO: 2,     // 信息 - 生产环境可选
  DEBUG: 3,    // 调试 - 仅开发环境
  VERBOSE: 4   // 详细 - 仅开发环境
};

class LogManager {
  constructor() {
    this.level = this.getLogLevel();
    this.isDevelopment = process.env.NODE_ENV === 'development';
  }

  /**
   * 获取日志级别
   */
  getLogLevel() {
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    if (envLevel && LOG_LEVELS.hasOwnProperty(envLevel)) {
      return LOG_LEVELS[envLevel];
    }
    
    // 默认级别：生产环境为INFO，开发环境为DEBUG
    return this.isDevelopment ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO;
  }

  /**
   * 错误日志 - 总是输出
   */
  error(message, ...args) {
    console.error(`[ERROR] ${message}`, ...args);
  }

  /**
   * 警告日志 - 总是输出
   */
  warn(message, ...args) {
    console.warn(`[WARN] ${message}`, ...args);
  }

  /**
   * 信息日志 - 根据级别决定是否输出
   */
  info(message, ...args) {
    if (this.level >= LOG_LEVELS.INFO) {
      console.log(`[INFO] ${message}`, ...args);
    }
  }

  /**
   * 调试日志 - 仅开发环境或DEBUG级别
   */
  debug(message, ...args) {
    if (this.level >= LOG_LEVELS.DEBUG) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }

  /**
   * 详细日志 - 仅开发环境或VERBOSE级别
   */
  verbose(message, ...args) {
    if (this.level >= LOG_LEVELS.VERBOSE) {
      console.log(`[VERBOSE] ${message}`, ...args);
    }
  }

  /**
   * 关键节点日志 - 总是输出，用于重要操作
   */
  milestone(message, ...args) {
    console.log(`[里程碑] ${message}`, ...args);
  }

  /**
   * 性能日志 - 用于记录关键操作的耗时
   */
  performance(operation, duration, ...args) {
    if (this.level >= LOG_LEVELS.INFO) {
      console.log(`[性能] ${operation}: ${duration}ms`, ...args);
    }
  }

  /**
   * 业务日志 - 用于记录重要的业务操作
   */
  business(operation, details, ...args) {
    if (this.level >= LOG_LEVELS.INFO) {
      console.log(`[业务] ${operation}: ${details}`, ...args);
    }
  }
}

// 创建全局日志管理器实例
const logManager = new LogManager();

module.exports = {
  logManager,
  LOG_LEVELS,
  LogManager
};
