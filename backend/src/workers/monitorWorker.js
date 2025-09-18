/**
 * 监控工作进程
 * 独立进程运行监控服务
 */

const DirectoryMonitor = require('../services/directoryMonitor');
const AutoUploadProcessor = require('../services/autoUploadProcessor');
const { getConfig, isMonitorEnabled } = require('../config/monitorConfig');

class MonitorWorker {
  constructor() {
    this.directoryMonitor = null;
    this.autoUploadProcessor = null;
    this.logProcessingQueue = null;
    this.isRunning = false;
    this.config = getConfig();
  }

  /**
   * 设置日志处理队列
   * @param {Object} queue - Bull队列实例
   */
  setLogProcessingQueue(queue) {
    this.logProcessingQueue = queue;
  }

  /**
   * 初始化监控服务
   */
  async initialize() {
    try {
      console.log('初始化监控工作进程...');

      // 检查配置
      if (!this.config.monitorDirectories || this.config.monitorDirectories.length === 0) {
        console.warn('未配置监控目录，监控服务无法启动');
        return false;
      }

      // 创建自动上传处理器
      this.autoUploadProcessor = new AutoUploadProcessor();
      if (this.logProcessingQueue) {
        this.autoUploadProcessor.setLogProcessingQueue(this.logProcessingQueue);
      }

      // 创建目录监控服务
      this.directoryMonitor = new DirectoryMonitor();
      this.directoryMonitor.setAutoUploadProcessor(this.autoUploadProcessor);

      console.log('监控工作进程初始化完成');
      return true;
    } catch (error) {
      console.error('初始化监控工作进程失败:', error);
      return false;
    }
  }

  /**
   * 启动监控服务
   */
  async start() {
    try {
      if (this.isRunning) {
        console.log('监控服务已在运行中');
        return true;
      }

      if (!this.directoryMonitor || !this.autoUploadProcessor) {
        console.error('监控服务未初始化');
        return false;
      }

      if (!isMonitorEnabled()) {
        console.log('监控服务未启用，跳过启动');
        return false;
      }

      console.log('启动监控服务...');
      await this.directoryMonitor.start();
      this.isRunning = true;
      console.log('监控服务已启动');

      return true;
    } catch (error) {
      console.error('启动监控服务失败:', error);
      return false;
    }
  }

  /**
   * 停止监控服务
   */
  async stop() {
    try {
      if (!this.isRunning) {
        console.log('监控服务未运行');
        return true;
      }

      console.log('停止监控服务...');
      
      if (this.directoryMonitor) {
        await this.directoryMonitor.stop();
      }

      this.isRunning = false;
      console.log('监控服务已停止');

      return true;
    } catch (error) {
      console.error('停止监控服务失败:', error);
      return false;
    }
  }

  /**
   * 重启监控服务
   */
  async restart() {
    try {
      console.log('重启监控服务...');
      await this.stop();
      await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒
      await this.start();
      console.log('监控服务重启完成');
      return true;
    } catch (error) {
      console.error('重启监控服务失败:', error);
      return false;
    }
  }

  /**
   * 获取监控状态
   * @returns {Object} - 监控状态信息
   */
  getStatus() {
    const status = {
      isRunning: this.isRunning,
      isInitialized: !!(this.directoryMonitor && this.autoUploadProcessor),
      config: {
        monitorDirectories: this.config.monitorDirectories,
        autoUploadEnabled: this.config.autoUploadConfig.enabled,
        monitorEnabled: isMonitorEnabled()
      },
      timestamp: new Date()
    };

    if (this.directoryMonitor) {
      status.monitor = this.directoryMonitor.getStatus();
    }

    if (this.autoUploadProcessor) {
      status.processor = this.autoUploadProcessor.getProcessingStatus();
    }

    return status;
  }

  /**
   * 获取处理统计信息
   * @returns {Object} - 处理统计信息
   */
  getProcessingStats() {
    if (!this.autoUploadProcessor) {
      return null;
    }

    return this.autoUploadProcessor.getProcessingStatus();
  }

  /**
   * 清理已完成的文件记录
   */
  clearCompletedFiles() {
    if (this.autoUploadProcessor) {
      this.autoUploadProcessor.clearCompletedFiles();
    }
  }

  /**
   * 清理所有文件记录
   */
  clearAllFiles() {
    if (this.autoUploadProcessor) {
      this.autoUploadProcessor.clearAllFiles();
    }
  }

  /**
   * 获取失败的文件列表
   * @returns {Array} - 失败的文件信息
   */
  getFailedFiles() {
    if (!this.autoUploadProcessor) {
      return [];
    }

    return this.autoUploadProcessor.getFailedFiles();
  }

  /**
   * 重试失败的文件
   * @returns {Promise<Object>} - 重试结果
   */
  async retryFailedFiles() {
    if (!this.autoUploadProcessor) {
      return {
        success: false,
        message: '自动上传处理器未初始化'
      };
    }

    return await this.autoUploadProcessor.retryAllFailedFiles();
  }

  /**
   * 健康检查
   * @returns {Object} - 健康状态
   */
  healthCheck() {
    const health = {
      status: 'healthy',
      timestamp: new Date(),
      services: {
        directoryMonitor: !!this.directoryMonitor,
        autoUploadProcessor: !!this.autoUploadProcessor,
        logProcessingQueue: !!this.logProcessingQueue
      },
      isRunning: this.isRunning,
      isEnabled: isMonitorEnabled()
    };

    // 检查关键服务状态
    if (!this.directoryMonitor || !this.autoUploadProcessor) {
      health.status = 'unhealthy';
      health.message = '关键服务未初始化';
    }

    if (this.isRunning && !isMonitorEnabled()) {
      health.status = 'warning';
      health.message = '监控服务运行中但配置未启用';
    }

    return health;
  }

  /**
   * 优雅关闭
   */
  async gracefulShutdown() {
    try {
      console.log('开始优雅关闭监控工作进程...');
      
      if (this.isRunning) {
        await this.stop();
      }

      // 清理资源
      this.directoryMonitor = null;
      this.autoUploadProcessor = null;
      this.logProcessingQueue = null;

      console.log('监控工作进程已优雅关闭');
    } catch (error) {
      console.error('优雅关闭监控工作进程失败:', error);
    }
  }
}

module.exports = MonitorWorker;
