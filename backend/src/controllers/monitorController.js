/**
 * 监控API控制器
 * 提供配置和状态管理接口
 */

const { 
  getConfig, 
  updateConfig, 
  resetConfig, 
  validateConfig,
  getMonitorDirectories,
  addMonitorDirectory,
  removeMonitorDirectory,
  setMonitorEnabled,
  isMonitorEnabled,
  getDeviceIdExamples,
  getSystemInfoConfig,
  getAutoUploadConfig,
  getMonitorServiceConfig,
  getErrorHandlingConfig
} = require('../config/monitorConfig');

const { logOperation } = require('../utils/operationLogger');

// 监控服务实例（单例）
let directoryMonitor = null;
let autoUploadProcessor = null;

/**
 * 设置监控服务实例
 * @param {Object} monitor - 目录监控服务实例
 * @param {Object} processor - 自动上传处理器实例
 */
function setMonitorServices(monitor, processor) {
  directoryMonitor = monitor;
  autoUploadProcessor = processor;
}

/**
 * 获取监控配置
 */
const getMonitorConfig = async (req, res) => {
  try {
    const config = getConfig();
    
    // 隐藏敏感信息
    const safeConfig = {
      ...config,
      monitorDirectories: config.monitorDirectories,
      deviceIdValidation: config.deviceIdValidation,
      systemInfoConfig: config.systemInfoConfig,
      autoUploadConfig: config.autoUploadConfig,
      monitorService: {
        ...config.monitorService,
        enabled: isMonitorEnabled()
      },
      errorHandling: config.errorHandling
    };

    res.json({
      success: true,
      data: safeConfig
    });
  } catch (error) {
    console.error('获取监控配置失败:', error);
    res.status(500).json({
      success: false,
      message: '获取监控配置失败',
      error: error.message
    });
  }
};

/**
 * 更新监控配置
 */
const updateMonitorConfig = async (req, res) => {
  try {
    const { config } = req.body;
    
    if (!config) {
      return res.status(400).json({
        success: false,
        message: '配置数据不能为空'
      });
    }

    // 验证配置
    const validation = validateConfig(config);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: '配置验证失败',
        errors: validation.errors,
        warnings: validation.warnings
      });
    }

    // 更新配置
    const updatedConfig = updateConfig(config);
    
    // 记录操作日志
    try {
      await logOperation({
        operation: '更新监控配置',
        description: '更新目录监控配置',
        user_id: req.user?.id,
        username: req.user?.username,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        details: {
          monitorDirectories: config.monitorDirectories?.length || 0,
          autoUploadEnabled: config.autoUploadConfig?.enabled,
          scanInterval: config.autoUploadConfig?.scanInterval
        }
      });
    } catch (logErr) {
      console.warn('记录操作日志失败（更新监控配置）:', logErr.message);
    }

    res.json({
      success: true,
      message: '监控配置更新成功',
      data: updatedConfig,
      warnings: validation.warnings
    });
  } catch (error) {
    console.error('更新监控配置失败:', error);
    res.status(500).json({
      success: false,
      message: '更新监控配置失败',
      error: error.message
    });
  }
};

/**
 * 重置监控配置
 */
const resetMonitorConfig = async (req, res) => {
  try {
    const defaultConfig = resetConfig();
    
    // 记录操作日志
    try {
      await logOperation({
        operation: '重置监控配置',
        description: '重置目录监控配置为默认值',
        user_id: req.user?.id,
        username: req.user?.username,
        ip: req.ip,
        user_agent: req.headers['user-agent']
      });
    } catch (logErr) {
      console.warn('记录操作日志失败（重置监控配置）:', logErr.message);
    }

    res.json({
      success: true,
      message: '监控配置已重置为默认值',
      data: defaultConfig
    });
  } catch (error) {
    console.error('重置监控配置失败:', error);
    res.status(500).json({
      success: false,
      message: '重置监控配置失败',
      error: error.message
    });
  }
};

/**
 * 获取监控状态
 */
const getMonitorStatus = async (req, res) => {
  try {
    const config = getConfig();
    let monitorStatus = null;
    let processorStatus = null;

    if (directoryMonitor) {
      monitorStatus = directoryMonitor.getStatus();
    }

    if (autoUploadProcessor) {
      processorStatus = autoUploadProcessor.getProcessingStatus();
    }

    const status = {
      config: {
        monitorDirectories: config.monitorDirectories,
        autoUploadEnabled: config.autoUploadConfig.enabled,
        monitorEnabled: isMonitorEnabled(),
        scanInterval: config.autoUploadConfig.scanInterval
      },
      monitor: monitorStatus,
      processor: processorStatus,
      timestamp: new Date()
    };

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('获取监控状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取监控状态失败',
      error: error.message
    });
  }
};

/**
 * 启动监控服务
 */
const startMonitor = async (req, res) => {
  try {
    if (!directoryMonitor) {
      return res.status(400).json({
        success: false,
        message: '监控服务未初始化'
      });
    }

    if (directoryMonitor.isRunning) {
      return res.status(400).json({
        success: false,
        message: '监控服务已在运行中'
      });
    }

    await directoryMonitor.start();
    setMonitorEnabled(true);

    // 记录操作日志
    try {
      await logOperation({
        operation: '启动监控服务',
        description: '启动目录监控服务',
        user_id: req.user?.id,
        username: req.user?.username,
        ip: req.ip,
        user_agent: req.headers['user-agent']
      });
    } catch (logErr) {
      console.warn('记录操作日志失败（启动监控服务）:', logErr.message);
    }

    res.json({
      success: true,
      message: '监控服务已启动'
    });
  } catch (error) {
    console.error('启动监控服务失败:', error);
    res.status(500).json({
      success: false,
      message: '启动监控服务失败',
      error: error.message
    });
  }
};

/**
 * 停止监控服务
 */
const stopMonitor = async (req, res) => {
  try {
    if (!directoryMonitor) {
      return res.status(400).json({
        success: false,
        message: '监控服务未初始化'
      });
    }

    if (!directoryMonitor.isRunning) {
      return res.status(400).json({
        success: false,
        message: '监控服务未运行'
      });
    }

    await directoryMonitor.stop();
    setMonitorEnabled(false);

    // 记录操作日志
    try {
      await logOperation({
        operation: '停止监控服务',
        description: '停止目录监控服务',
        user_id: req.user?.id,
        username: req.user?.username,
        ip: req.ip,
        user_agent: req.headers['user-agent']
      });
    } catch (logErr) {
      console.warn('记录操作日志失败（停止监控服务）:', logErr.message);
    }

    res.json({
      success: true,
      message: '监控服务已停止'
    });
  } catch (error) {
    console.error('停止监控服务失败:', error);
    res.status(500).json({
      success: false,
      message: '停止监控服务失败',
      error: error.message
    });
  }
};

/**
 * 添加监控目录
 */
const addMonitorDirectoryHandler = async (req, res) => {
  try {
    const { directory } = req.body;
    
    if (!directory) {
      return res.status(400).json({
        success: false,
        message: '目录路径不能为空'
      });
    }

    const success = addMonitorDirectory(directory);
    if (!success) {
      return res.status(400).json({
        success: false,
        message: '添加监控目录失败，目录可能不存在或已存在'
      });
    }

    // 记录操作日志
    try {
      await logOperation({
        operation: '添加监控目录',
        description: `添加监控目录: ${directory}`,
        user_id: req.user?.id,
        username: req.user?.username,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        details: { directory }
      });
    } catch (logErr) {
      console.warn('记录操作日志失败（添加监控目录）:', logErr.message);
    }

    res.json({
      success: true,
      message: '监控目录添加成功',
      data: { directory }
    });
  } catch (error) {
    console.error('添加监控目录失败:', error);
    res.status(500).json({
      success: false,
      message: '添加监控目录失败',
      error: error.message
    });
  }
};

/**
 * 移除监控目录
 */
const removeMonitorDirectoryHandler = async (req, res) => {
  try {
    const { directory } = req.body;
    
    if (!directory) {
      return res.status(400).json({
        success: false,
        message: '目录路径不能为空'
      });
    }

    const success = removeMonitorDirectory(directory);
    if (!success) {
      return res.status(400).json({
        success: false,
        message: '移除监控目录失败，目录可能不存在'
      });
    }

    // 记录操作日志
    try {
      await logOperation({
        operation: '移除监控目录',
        description: `移除监控目录: ${directory}`,
        user_id: req.user?.id,
        username: req.user?.username,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        details: { directory }
      });
    } catch (logErr) {
      console.warn('记录操作日志失败（移除监控目录）:', logErr.message);
    }

    res.json({
      success: true,
      message: '监控目录移除成功',
      data: { directory }
    });
  } catch (error) {
    console.error('移除监控目录失败:', error);
    res.status(500).json({
      success: false,
      message: '移除监控目录失败',
      error: error.message
    });
  }
};

/**
 * 获取支持的设备编号格式
 */
const getDeviceIdFormats = async (req, res) => {
  try {
    const examples = getDeviceIdExamples();
    const config = getSystemInfoConfig();
    
    res.json({
      success: true,
      data: {
        examples,
        regex: config.macAddressRegex.toString(),
        supportedEncodings: config.supportedEncodings
      }
    });
  } catch (error) {
    console.error('获取设备编号格式失败:', error);
    res.status(500).json({
      success: false,
      message: '获取设备编号格式失败',
      error: error.message
    });
  }
};

/**
 * 清理已处理的文件记录
 */
const clearProcessedFiles = async (req, res) => {
  try {
    if (!autoUploadProcessor) {
      return res.status(400).json({
        success: false,
        message: '自动上传处理器未初始化'
      });
    }

    autoUploadProcessor.clearCompletedFiles();

    // 记录操作日志
    try {
      await logOperation({
        operation: '清理已处理文件',
        description: '清理已完成的文件记录',
        user_id: req.user?.id,
        username: req.user?.username,
        ip: req.ip,
        user_agent: req.headers['user-agent']
      });
    } catch (logErr) {
      console.warn('记录操作日志失败（清理已处理文件）:', logErr.message);
    }

    res.json({
      success: true,
      message: '已清理已完成的文件记录'
    });
  } catch (error) {
    console.error('清理已处理文件失败:', error);
    res.status(500).json({
      success: false,
      message: '清理已处理文件失败',
      error: error.message
    });
  }
};

/**
 * 重试失败的文件
 */
const retryFailedFiles = async (req, res) => {
  try {
    if (!autoUploadProcessor) {
      return res.status(400).json({
        success: false,
        message: '自动上传处理器未初始化'
      });
    }

    const results = await autoUploadProcessor.retryAllFailedFiles();

    // 记录操作日志
    try {
      await logOperation({
        operation: '重试失败文件',
        description: `重试 ${results.total} 个失败的文件`,
        user_id: req.user?.id,
        username: req.user?.username,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        details: results
      });
    } catch (logErr) {
      console.warn('记录操作日志失败（重试失败文件）:', logErr.message);
    }

    res.json({
      success: true,
      message: '重试操作完成',
      data: results
    });
  } catch (error) {
    console.error('重试失败文件失败:', error);
    res.status(500).json({
      success: false,
      message: '重试失败文件失败',
      error: error.message
    });
  }
};

module.exports = {
  setMonitorServices,
  getMonitorConfig,
  updateMonitorConfig,
  resetMonitorConfig,
  getMonitorStatus,
  startMonitor,
  stopMonitor,
  addMonitorDirectory: addMonitorDirectoryHandler,
  removeMonitorDirectory: removeMonitorDirectoryHandler,
  getDeviceIdFormats,
  clearProcessedFiles,
  retryFailedFiles
};
