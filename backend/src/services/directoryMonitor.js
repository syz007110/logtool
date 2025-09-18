/**
 * 目录监控服务
 * 使用chokidar监控目录变化，检测新增的.medbot文件
 */

const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const { extractDeviceIdFromPath, validateDeviceId } = require('../utils/deviceIdExtractor');
const { getConfig, getMonitorServiceConfig } = require('../config/monitorConfig');

class DirectoryMonitor {
  constructor() {
    this.config = getConfig();
    this.monitorConfig = getMonitorServiceConfig();
    
    // 调试信息：检查配置是否正确加载
    console.log('DirectoryMonitor 配置加载状态:');
    console.log('- config.monitorService:', !!this.config.monitorService);
    console.log('- monitorConfig:', !!this.monitorConfig);
    console.log('- monitorConfig.watchOptions:', !!this.monitorConfig?.watchOptions);
    console.log('- ignoreInitial:', this.monitorConfig?.watchOptions?.ignoreInitial);
    console.log('- scanInterval:', this.config.autoUploadConfig.scanInterval);
    
    this.watchers = new Map();
    this.isRunning = false;
    this.processedFiles = new Map(); // 记录处理状态和文件信息
    this.autoUploadProcessor = null;
    this.isInitialScan = true; // 标记是否为初始扫描
    this.readyWatchers = new Set(); // 跟踪已就绪的监控器
    this.scanTimer = null; // 定期扫描定时器
    this.lastScanTime = new Map(); // 记录每个目录的最后扫描时间
    this.fileSignatures = new Map(); // 记录文件签名（大小+修改时间）
  }

  /**
   * 设置自动上传处理器
   * @param {Object} processor - 自动上传处理器实例
   */
  setAutoUploadProcessor(processor) {
    this.autoUploadProcessor = processor;
  }

  /**
   * 启动目录监控
   */
  async start() {
    if (this.isRunning) {
      console.log('目录监控已在运行中');
      return;
    }

    if (!this.autoUploadProcessor) {
      throw new Error('自动上传处理器未设置');
    }

    const directories = this.config.monitorDirectories;
    if (!directories || directories.length === 0) {
      console.warn('未配置监控目录，监控服务无法启动');
      return;
    }

    console.log(`开始启动目录监控，监控目录数量: ${directories.length}`);

    // 启动定期扫描机制
    this.startPeriodicScan();

    this.isRunning = true;
    console.log('目录监控服务已启动（定期扫描模式）');
  }

  /**
   * 停止目录监控
   */
  async stop() {
    if (!this.isRunning) {
      console.log('目录监控未运行');
      return;
    }

    console.log('正在停止目录监控服务...');

    // 清理定时器
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
      console.log('已停止定期扫描定时器');
    }

    for (const [directory, watcher] of this.watchers) {
      try {
        await watcher.close();
        console.log(`已停止监控目录: ${directory}`);
      } catch (error) {
        console.error(`停止监控目录失败: ${directory}`, error);
      }
    }

    this.watchers.clear();
    this.processedFiles.clear();
    this.lastScanTime.clear();
    this.fileSignatures.clear();
    this.isRunning = false;
    console.log('目录监控服务已停止');
  }

  /**
   * 启动定期扫描机制
   */
  startPeriodicScan() {
    const scanInterval = this.config.autoUploadConfig.scanInterval || 5000;
    console.log(`启动定期扫描，间隔: ${scanInterval}ms (${scanInterval/1000}秒)`);
    
    this.scanTimer = setInterval(() => {
      this.performPeriodicScan();
    }, scanInterval);
  }

  /**
   * 执行定期扫描（只扫描新文件）
   */
  async performPeriodicScan() {
    try {
      const directories = this.config.monitorDirectories;
      const now = Date.now();
      
      for (const dir of directories) {
        // 检查目录是否存在
        if (!fs.existsSync(dir)) {
          continue;
        }
        
        // 如果是初始扫描且设置了忽略初始扫描，则跳过处理但记录文件签名
        if (this.isInitialScan) {
          const ignoreInitial = this.monitorConfig?.watchOptions?.ignoreInitial || false;
          if (ignoreInitial) {
            console.log(`忽略初始扫描，跳过目录: ${dir}`);
            // 设置初始扫描时间，但不扫描文件
            this.lastScanTime.set(dir, now);
            // 记录现有文件的签名，但不处理它们
            await this.recordExistingFileSignatures(dir);
            continue;
          }
        }
        
        // 只扫描自上次扫描以来的新文件
        await this.scanNewFilesOnly(dir, now);
      }
      
      // 如果是初始扫描，标记为完成
      if (this.isInitialScan) {
        this.isInitialScan = false;
        const ignoreInitial = this.monitorConfig?.watchOptions?.ignoreInitial || false;
        if (ignoreInitial) {
          console.log('初始扫描已跳过（忽略现有文件）');
        } else {
          console.log('初始扫描完成');
        }
      }
    } catch (error) {
      console.error('定期扫描失败:', error);
    }
  }

  /**
   * 记录现有文件的签名（不处理文件）
   * @param {string} dirPath - 目录路径
   */
  async recordExistingFileSignatures(dirPath) {
    try {
      const files = fs.readdirSync(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        
        try {
          const stat = fs.statSync(filePath);
          
          if (stat.isDirectory()) {
            // 递归记录子目录中的文件签名
            await this.recordExistingFileSignatures(filePath);
          } else if (stat.isFile() && path.extname(filePath).toLowerCase() === '.medbot') {
            // 生成文件签名但不处理文件
            const fileSignature = `${stat.size}-${stat.mtime.getTime()}`;
            this.fileSignatures.set(filePath, fileSignature);
            console.log(`记录现有文件签名: ${filePath}`);
          }
        } catch (statError) {
          // 忽略无法访问的文件
          continue;
        }
      }
    } catch (error) {
      console.error(`记录文件签名失败: ${dirPath}`, error);
    }
  }

  /**
   * 只扫描新文件（基于文件修改时间）
   * @param {string} dirPath - 目录路径
   * @param {number} currentTime - 当前时间戳
   */
  async scanNewFilesOnly(dirPath, currentTime) {
    try {
      // 获取上次扫描时间
      const lastScanTime = this.lastScanTime.get(dirPath) || 0;
      const scanInterval = this.config.autoUploadConfig.scanInterval || 5000;
      
      // 计算时间窗口：从上上次扫描到上次扫描
      const timeWindow = lastScanTime - scanInterval;
      
      const files = fs.readdirSync(dirPath);
      let newFileCount = 0;
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        
        try {
          const stat = fs.statSync(filePath);
          
          if (stat.isDirectory()) {
            // 递归扫描子目录
            await this.scanNewFilesOnly(filePath, currentTime);
          } else if (stat.isFile() && path.extname(filePath).toLowerCase() === '.medbot') {
            // 生成文件签名（大小 + 修改时间）
            const fileSignature = `${stat.size}-${stat.mtime.getTime()}`;
            const lastSignature = this.fileSignatures.get(filePath);
            
            // 检查文件是否发生变化
            const isFileChanged = lastSignature !== fileSignature;
            const isNewFile = !lastSignature; // 从未见过的文件
            
            if (isNewFile || isFileChanged) {
              newFileCount++;
              // 更新文件签名
              this.fileSignatures.set(filePath, fileSignature);
              
              if (isNewFile) {
                console.log(`发现新文件: ${filePath}`);
              } else {
                console.log(`检测到文件变化: ${filePath} (大小: ${stat.size}, 修改时间: ${stat.mtime.toISOString()})`);
              }
              
              await this.handleMedbotFile(filePath);
            }
          }
        } catch (statError) {
          // 忽略无法访问的文件（可能已被删除）
          continue;
        }
      }
      
      // 更新最后扫描时间
      this.lastScanTime.set(dirPath, currentTime);
      
      if (newFileCount > 0) {
        console.log(`目录 ${dirPath} 发现 ${newFileCount} 个新文件`);
      }
    } catch (error) {
      console.error(`扫描新文件失败: ${dirPath}`, error);
    }
  }

  /**
   * 递归扫描目录中的所有.medbot文件（保留备用）
   * @param {string} dirPath - 目录路径
   */
  async scanDirectoryRecursively(dirPath) {
    try {
      const files = fs.readdirSync(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          // 递归扫描子目录
          await this.scanDirectoryRecursively(filePath);
        } else if (stat.isFile() && path.extname(filePath).toLowerCase() === '.medbot') {
          // 处理.medbot文件
          await this.handleMedbotFile(filePath);
        }
      }
    } catch (error) {
      console.error(`扫描目录失败: ${dirPath}`, error);
    }
  }

  /**
   * 处理.medbot文件
   * @param {string} filePath - 文件路径
   */
  async handleMedbotFile(filePath) {
    try {
      // 检查文件是否正在处理中
      if (this.processedFiles.has(filePath)) {
        const status = this.processedFiles.get(filePath);
        if (status.status === 'processing') {
          console.log(`文件正在处理中，跳过: ${filePath}`);
          return;
        }
      }

      // 从文件路径中提取设备编号
      const deviceId = extractDeviceIdFromPath(filePath);
      
      if (deviceId && validateDeviceId(deviceId)) {
        console.log(`定期扫描发现.medbot文件: ${filePath}, 设备编号: ${deviceId}`);
        await this.processMedbotFile(filePath, deviceId);
      } else {
        console.warn(`无法从文件路径提取有效设备编号: ${filePath}`);
      }
    } catch (error) {
      console.error(`处理.medbot文件失败: ${filePath}`, error);
    }
  }

  /**
   * 监控单个目录（保留原有方法，但现在不使用）
   * @param {string} directoryPath - 目录路径
   */
  async watchDirectory(directoryPath) {
    try {
      if (!fs.existsSync(directoryPath)) {
        console.warn(`监控目录不存在: ${directoryPath}`);
        return;
      }

      console.log(`开始监控目录: ${directoryPath}`);

      // 确保监控配置存在，如果不存在则使用默认配置
      const watchOptions = this.monitorConfig?.watchOptions || {
        ignored: /(^|[\/\\])\../,
        persistent: true,
        ignoreInitial: false,
        depth: 3,
        awaitWriteFinish: {
          stabilityThreshold: 2000,
          pollInterval: 100
        }
      };
      
      const watcher = chokidar.watch(directoryPath, watchOptions);

      watcher
        .on('addDir', (dirPath) => this.handleNewDirectory(dirPath))
        .on('add', (filePath) => this.handleNewFile(filePath))
        .on('change', (filePath) => this.handleFileChange(filePath))
        .on('error', (error) => this.handleError(error, directoryPath))
        .on('ready', () => {
          console.log(`目录监控就绪: ${directoryPath}`);
          this.readyWatchers.add(directoryPath);
          // 所有监控器就绪后，标记初始扫描完成
          if (this.readyWatchers.size === this.watchers.size) {
            const ignoreInitial = this.monitorConfig?.watchOptions?.ignoreInitial || false;
            if (ignoreInitial) {
              console.log('所有目录监控器已就绪，初始扫描已跳过（忽略现有文件）');
            } else {
              console.log('所有目录监控器已就绪，初始扫描完成');
            }
            this.isInitialScan = false;
          }
        });

      this.watchers.set(directoryPath, watcher);
    } catch (error) {
      console.error(`启动目录监控失败: ${directoryPath}`, error);
    }
  }

  /**
   * 处理新增目录
   * @param {string} dirPath - 目录路径
   */
  async handleNewDirectory(dirPath) {
    try {
      console.log(`检测到新增目录: ${dirPath}`);
      
      // 从目录路径中提取设备编号
      const deviceId = extractDeviceIdFromPath(dirPath);
      
      if (deviceId) {
        console.log(`从目录路径提取到设备编号: ${deviceId}`);
        
        // 验证设备编号格式
        if (validateDeviceId(deviceId)) {
          // 检查是否忽略初始扫描
          const ignoreInitial = this.monitorConfig?.watchOptions?.ignoreInitial || false;
          if (ignoreInitial && this.isInitialScan) {
            console.log(`忽略初始扫描，跳过目录: ${dirPath}`);
          } else {
            // 扫描目录中的.medbot文件
            await this.scanDirectoryForMedbotFiles(dirPath, deviceId);
          }
        } else {
          console.warn(`设备编号格式无效: ${deviceId}`);
        }
      } else {
        console.log(`目录路径中未找到有效的设备编号: ${dirPath}`);
      }
    } catch (error) {
      console.error(`处理新增目录失败: ${dirPath}`, error);
    }
  }

  /**
   * 处理新增文件
   * @param {string} filePath - 文件路径
   */
  async handleNewFile(filePath) {
    // 实时监控已禁用，使用定期扫描模式
    // 这个方法保留但不执行任何操作
    console.log(`实时监控检测到文件变化（定期扫描模式）: ${filePath}`);
  }

  /**
   * 处理文件变化
   * @param {string} filePath - 文件路径
   */
  async handleFileChange(filePath) {
    try {
      // 只处理.medbot文件的变化
      if (path.extname(filePath).toLowerCase() === '.medbot') {
        console.log(`检测到.medbot文件变化: ${filePath}`);
        
        // 从文件路径中提取设备编号
        const deviceId = extractDeviceIdFromPath(filePath);
        
        if (deviceId && validateDeviceId(deviceId)) {
          await this.processMedbotFile(filePath, deviceId);
        }
      }
    } catch (error) {
      console.error(`处理文件变化失败: ${filePath}`, error);
    }
  }

  /**
   * 处理错误
   * @param {Error} error - 错误对象
   * @param {string} directoryPath - 目录路径
   */
  handleError(error, directoryPath) {
    console.error(`监控目录错误: ${directoryPath}`, error);
    
    // 根据错误处理配置决定是否继续
    const errorConfig = this.config.errorHandling;
    if (errorConfig.logErrors) {
      console.error(`监控错误详情: ${error.message}`);
    }
  }

  /**
   * 扫描目录中的.medbot文件
   * @param {string} dirPath - 目录路径
   * @param {string} deviceId - 设备编号
   */
  async scanDirectoryForMedbotFiles(dirPath, deviceId) {
    try {
      const files = fs.readdirSync(dirPath);
      const medbotFiles = files.filter(file => 
        path.extname(file).toLowerCase() === '.medbot'
      );
      
      if (medbotFiles.length > 0) {
        console.log(`在目录 ${dirPath} 中找到 ${medbotFiles.length} 个.medbot文件`);
        
        for (const file of medbotFiles) {
          const filePath = path.join(dirPath, file);
          await this.processMedbotFile(filePath, deviceId);
        }
      } else {
        console.log(`目录 ${dirPath} 中未找到.medbot文件`);
      }
    } catch (error) {
      console.error(`扫描目录失败: ${dirPath}`, error);
    }
  }

  /**
   * 处理.medbot文件
   * @param {string} filePath - 文件路径
   * @param {string} deviceId - 设备编号
   */
  async processMedbotFile(filePath, deviceId) {
    try {
      // 防止重复处理
      if (this.processedFiles.has(filePath)) {
        console.log(`文件已处理过，跳过: ${filePath}`);
        return;
      }

      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        console.warn(`文件不存在: ${filePath}`);
        return;
      }

      // 检查文件大小
      const stats = fs.statSync(filePath);
      const maxFileSize = this.config.autoUploadConfig.maxFileSize;
      if (stats.size > maxFileSize) {
        console.warn(`文件过大，跳过处理: ${filePath} (${stats.size} bytes)`);
        return;
      }

      console.log(`开始处理.medbot文件: ${filePath}, 设备编号: ${deviceId}`);
      
      // 标记文件为处理中
      this.processedFiles.set(filePath, { status: 'processing', timestamp: Date.now() });
      
      // 调用自动上传处理器
      const success = await this.autoUploadProcessor.processMedbotFile(filePath, deviceId);
      
      if (success) {
        console.log(`成功处理.medbot文件: ${filePath}`);
        // 更新状态为已完成
        this.processedFiles.set(filePath, { status: 'completed', timestamp: Date.now() });
      } else {
        console.warn(`处理.medbot文件失败: ${filePath}`);
        // 处理失败时移除标记，允许重试
        this.processedFiles.delete(filePath);
      }
    } catch (error) {
      console.error(`处理.medbot文件失败: ${filePath}`, error);
      // 处理失败时移除标记，允许重试
      this.processedFiles.delete(filePath);
    }
  }

  /**
   * 获取监控状态
   * @returns {Object} - 监控状态信息
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      monitoredDirectories: Array.from(this.watchers.keys()),
      processedFilesCount: this.processedFiles.size,
      config: {
        monitorDirectories: this.config.monitorDirectories,
        autoUploadEnabled: this.config.autoUploadConfig.enabled,
        scanInterval: this.config.autoUploadConfig.scanInterval
      }
    };
  }

  /**
   * 清理已处理的文件记录
   */
  clearProcessedFiles() {
    this.processedFiles.clear();
    console.log('已清理已处理文件记录');
  }

  /**
   * 获取已处理的文件列表
   * @returns {Array} - 已处理的文件路径列表
   */
  getProcessedFiles() {
    return Array.from(this.processedFiles);
  }
}

module.exports = DirectoryMonitor;
