/**
 * 监控配置管理
 * 支持多目录和参数配置
 */

const path = require('path');

// 默认配置
const defaultConfig = {
  // 监控目录配置
  monitorDirectories: [
    "E:/microport/logtest"
  ],
  
  // 设备编号验证规则（与现有系统完全一致）
  deviceIdValidation: {
    regex: /^[0-9A-Za-z]+-[0-9A-Za-z]+$/,
    examples: ['4371-01', 'ABC-12', '123-XY', 'ABC-DEF', '1234-56', 'A1-B2', 'XYZ-999']
  },
  
  // SystemInfo文件配置
  systemInfoConfig: {
    fileName: 'systeminfo.txt',
    supportedEncodings: ['utf8', 'gbk', 'gb2312', 'latin1'],
    macAddressRegex: /([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})/g,
    searchDepth: 3 // 递归搜索深度
  },
  
  // 自动上传配置
  autoUploadConfig: {
    enabled: process.env.AUTO_UPLOAD_ENABLED === 'true' || true,
    scanInterval: parseInt(process.env.AUTO_UPLOAD_SCAN_INTERVAL) || 5000, // 从环境变量读取
    maxRetryAttempts: parseInt(process.env.AUTO_UPLOAD_MAX_RETRY) || 3,
    supportedFileExtensions: ['.medbot'],
    maxFileSize: parseInt(process.env.AUTO_UPLOAD_MAX_FILE_SIZE) || (200 * 1024 * 1024), // 从环境变量读取
    batchSize: parseInt(process.env.AUTO_UPLOAD_BATCH_SIZE) || 10 // 从环境变量读取
  },
  
  // 监控服务配置
  monitorService: {
    enabled: process.env.MONITOR_ENABLED === 'true' || false, // 从环境变量读取
    watchOptions: {
      ignored: /(^|[\/\\])\../, // 忽略隐藏文件
      persistent: true,
      ignoreInitial: process.env.MONITOR_IGNORE_INITIAL === 'true' || false, // 从环境变量读取
      depth: parseInt(process.env.MONITOR_DEPTH) || 3, // 从环境变量读取
      awaitWriteFinish: {
        stabilityThreshold: parseInt(process.env.MONITOR_STABILITY_THRESHOLD) || 2000,
        pollInterval: parseInt(process.env.MONITOR_POLL_INTERVAL) || 100
      }
    },
    logLevel: process.env.MONITOR_LOG_LEVEL || 'info' // 从环境变量读取
  },
  
  // 错误处理配置
  errorHandling: {
    maxRetries: 3,
    retryDelay: 5000, // 5秒
    skipOnError: true, // 遇到错误时跳过，继续处理其他文件
    logErrors: true
  }
};

// 当前配置
let currentConfig = { ...defaultConfig };

/**
 * 获取当前配置
 * @returns {Object} - 当前配置对象
 */
function getConfig() {
  return { ...currentConfig };
}

/**
 * 更新配置
 * @param {Object} newConfig - 新配置对象
 * @returns {Object} - 更新后的配置
 */
function updateConfig(newConfig) {
  currentConfig = { ...currentConfig, ...newConfig };
  return getConfig();
}

/**
 * 重置配置为默认值
 * @returns {Object} - 默认配置
 */
function resetConfig() {
  currentConfig = { ...defaultConfig };
  return getConfig();
}

/**
 * 验证配置
 * @param {Object} config - 要验证的配置
 * @returns {Object} - 验证结果
 */
function validateConfig(config) {
  const errors = [];
  const warnings = [];

  // 验证监控目录
  if (!config.monitorDirectories || !Array.isArray(config.monitorDirectories)) {
    errors.push('monitorDirectories 必须是数组');
  } else if (config.monitorDirectories.length === 0) {
    warnings.push('未配置监控目录，监控服务将无法启动');
  } else {
    // 检查目录是否存在
    const fs = require('fs');
    for (const dir of config.monitorDirectories) {
      if (!fs.existsSync(dir)) {
        warnings.push(`监控目录不存在: ${dir}`);
      }
    }
  }

  // 验证设备编号正则表达式
  if (!config.deviceIdValidation || !config.deviceIdValidation.regex) {
    errors.push('deviceIdValidation.regex 是必需的');
  }

  // 验证自动上传配置
  if (config.autoUploadConfig) {
    if (config.autoUploadConfig.scanInterval && config.autoUploadConfig.scanInterval < 1000) {
      warnings.push('扫描间隔过短可能导致性能问题');
    }
    
    if (config.autoUploadConfig.maxFileSize && config.autoUploadConfig.maxFileSize > 500 * 1024 * 1024) {
      warnings.push('最大文件大小过大可能导致内存问题');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * 获取监控目录列表
 * @returns {Array} - 监控目录列表
 */
function getMonitorDirectories() {
  return [...currentConfig.monitorDirectories];
}

/**
 * 添加监控目录
 * @param {string} directory - 目录路径
 * @returns {boolean} - 是否添加成功
 */
function addMonitorDirectory(directory) {
  if (!directory || typeof directory !== 'string') {
    return false;
  }

  const fs = require('fs');
  if (!fs.existsSync(directory)) {
    return false;
  }

  if (!currentConfig.monitorDirectories.includes(directory)) {
    currentConfig.monitorDirectories.push(directory);
    return true;
  }

  return false;
}

/**
 * 移除监控目录
 * @param {string} directory - 目录路径
 * @returns {boolean} - 是否移除成功
 */
function removeMonitorDirectory(directory) {
  const index = currentConfig.monitorDirectories.indexOf(directory);
  if (index > -1) {
    currentConfig.monitorDirectories.splice(index, 1);
    return true;
  }
  return false;
}

/**
 * 启用/禁用监控服务
 * @param {boolean} enabled - 是否启用
 */
function setMonitorEnabled(enabled) {
  currentConfig.monitorService.enabled = enabled;
}

/**
 * 检查监控服务是否启用
 * @returns {boolean} - 是否启用
 */
function isMonitorEnabled() {
  return currentConfig.monitorService.enabled;
}

/**
 * 获取设备编号验证正则表达式
 * @returns {RegExp} - 正则表达式
 */
function getDeviceIdRegex() {
  return currentConfig.deviceIdValidation.regex;
}

/**
 * 获取支持的设备编号格式示例
 * @returns {Array} - 格式示例
 */
function getDeviceIdExamples() {
  return [...currentConfig.deviceIdValidation.examples];
}

/**
 * 获取SystemInfo配置
 * @returns {Object} - SystemInfo配置
 */
function getSystemInfoConfig() {
  return { ...currentConfig.systemInfoConfig };
}

/**
 * 获取自动上传配置
 * @returns {Object} - 自动上传配置
 */
function getAutoUploadConfig() {
  return { ...currentConfig.autoUploadConfig };
}

/**
 * 获取监控服务配置
 * @returns {Object} - 监控服务配置
 */
function getMonitorServiceConfig() {
  return { ...currentConfig.monitorService };
}

/**
 * 获取错误处理配置
 * @returns {Object} - 错误处理配置
 */
function getErrorHandlingConfig() {
  return { ...currentConfig.errorHandling };
}

/**
 * 从环境变量加载配置
 */
function loadFromEnv() {
  const config = {};

  // 从环境变量加载监控目录
  if (process.env.MONITOR_DIRECTORIES) {
    try {
      config.monitorDirectories = JSON.parse(process.env.MONITOR_DIRECTORIES);
    } catch (error) {
      console.warn('解析环境变量 MONITOR_DIRECTORIES 失败:', error.message);
    }
  }

  // 从环境变量加载其他配置
  if (process.env.MONITOR_ENABLED) {
    config.monitorService = {
      ...config.monitorService,
      enabled: process.env.MONITOR_ENABLED === 'true'
    };
  }

  // 处理 MONITOR_IGNORE_INITIAL 环境变量
  if (process.env.MONITOR_IGNORE_INITIAL !== undefined) {
    config.monitorService = {
      ...config.monitorService,
      watchOptions: {
        ...config.monitorService?.watchOptions,
        ignoreInitial: process.env.MONITOR_IGNORE_INITIAL === 'true'
      }
    };
  }

  // 处理其他监控配置
  if (process.env.MONITOR_DEPTH) {
    config.monitorService = {
      ...config.monitorService,
      watchOptions: {
        ...config.monitorService?.watchOptions,
        depth: parseInt(process.env.MONITOR_DEPTH) || 3
      }
    };
  }

  if (process.env.MONITOR_STABILITY_THRESHOLD) {
    config.monitorService = {
      ...config.monitorService,
      watchOptions: {
        ...config.monitorService?.watchOptions,
        awaitWriteFinish: {
          ...config.monitorService?.watchOptions?.awaitWriteFinish,
          stabilityThreshold: parseInt(process.env.MONITOR_STABILITY_THRESHOLD) || 2000
        }
      }
    };
  }

  if (process.env.MONITOR_POLL_INTERVAL) {
    config.monitorService = {
      ...config.monitorService,
      watchOptions: {
        ...config.monitorService?.watchOptions,
        awaitWriteFinish: {
          ...config.monitorService?.watchOptions?.awaitWriteFinish,
          pollInterval: parseInt(process.env.MONITOR_POLL_INTERVAL) || 100
        }
      }
    };
  }

  if (process.env.MONITOR_LOG_LEVEL) {
    config.monitorService = {
      ...config.monitorService,
      logLevel: process.env.MONITOR_LOG_LEVEL
    };
  }

  if (process.env.MONITOR_SCAN_INTERVAL) {
    config.autoUploadConfig = {
      ...config.autoUploadConfig,
      scanInterval: parseInt(process.env.MONITOR_SCAN_INTERVAL) || 5000
    };
  }

  if (Object.keys(config).length > 0) {
    updateConfig(config);
    console.log('从环境变量加载监控配置');
    console.log('- MONITOR_IGNORE_INITIAL:', process.env.MONITOR_IGNORE_INITIAL);
    console.log('- 最终 ignoreInitial 值:', config.monitorService?.watchOptions?.ignoreInitial);
  }
}

// 启动时从环境变量加载配置
loadFromEnv();

module.exports = {
  getConfig,
  updateConfig,
  resetConfig,
  validateConfig,
  getMonitorDirectories,
  addMonitorDirectory,
  removeMonitorDirectory,
  setMonitorEnabled,
  isMonitorEnabled,
  getDeviceIdRegex,
  getDeviceIdExamples,
  getSystemInfoConfig,
  getAutoUploadConfig,
  getMonitorServiceConfig,
  getErrorHandlingConfig,
  loadFromEnv
};
