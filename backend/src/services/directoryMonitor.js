/**
 * 目录监控服务
 * 使用chokidar监控目录变化，检测新增的.medbot文件
 */

const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const { extractDeviceIdFromPath, validateDeviceId } = require('../utils/deviceIdExtractor');
const { getConfig, getMonitorServiceConfig, getCompressionSupportConfig } = require('../config/monitorConfig');
const ArchiveProcessor = require('../utils/archiveProcessor');
const BatchLimiter = require('../utils/batchLimiter');

class DirectoryMonitor {
  constructor() {
    this.config = getConfig();
    this.monitorConfig = getMonitorServiceConfig();
    this.compressionConfig = getCompressionSupportConfig();
    
    // 只在调试模式下打印详细配置信息
    if (process.env.DEBUG_MONITOR_CONFIG === 'true') {
      console.log('DirectoryMonitor 配置加载状态:');
      console.log('- config.monitorService:', !!this.config.monitorService);
      console.log('- monitorConfig:', !!this.monitorConfig);
      console.log('- monitorConfig.watchOptions:', !!this.monitorConfig?.watchOptions);
      console.log('- ignoreInitial:', this.monitorConfig?.watchOptions?.ignoreInitial);
      console.log('- scanInterval:', this.config.autoUploadConfig.scanInterval);
      console.log('- compressionSupport:', !!this.compressionConfig);
      console.log('- compressionEnabled:', this.compressionConfig?.enabled);
    }
    
    this.watchers = new Map();
    this.isRunning = false;
    this.processedFiles = new Map(); // 记录处理状态和文件信息
    this.autoUploadProcessor = null;
    
    // 批处理限流器
    this.batchLimiter = new BatchLimiter({
      maxBatchSize: parseInt(process.env.BACKGROUND_BATCH_SIZE) || 1, // 默认每次只处理1个文件夹/压缩包
      maxQueueWaitingTasks: parseInt(process.env.BACKGROUND_MAX_QUEUE_WAITING_TASKS) || 50, // 队列中最多等待50个任务（仅用队列长度限制）
      batchTimeout: parseInt(process.env.BACKGROUND_BATCH_TIMEOUT) || 300000,
      checkInterval: parseInt(process.env.BACKGROUND_BATCH_CHECK_INTERVAL) || 10000
    });
    this.isInitialScan = true; // 标记是否为初始扫描
    this.readyWatchers = new Set(); // 跟踪已就绪的监控器
    this.scanTimer = null; // 定期扫描定时器
    this.lastScanTime = new Map(); // 记录每个目录的最后扫描时间
    this.fileSignatures = new Map(); // 记录文件签名（大小+修改时间）
    this.roundRobinIndex = 0; // 轮询索引：每次扫描只处理一个目录
    this.initializedDirectories = new Set(); // 已初始化（记录过初始签名或完成首次处理）的目录
    
    // 初始化压缩文件处理器，传入配置
    this.archiveProcessor = new ArchiveProcessor(this.compressionConfig);
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
    
    // 启动批处理限流器的超时检查
    this.batchLimiter.startTimeoutCheck();

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
      const directories = this.config.monitorDirectories || [];
      if (directories.length === 0) {
        return;
      }

      const now = Date.now();

      // 选择一个目录（轮询），确保目录存在
      let attempts = 0;
      let selectedDir = null;
      while (attempts < directories.length) {
        const idx = this.roundRobinIndex % directories.length;
        const dir = directories[idx];
        this.roundRobinIndex = (this.roundRobinIndex + 1) % directories.length;
        attempts++;
        if (fs.existsSync(dir)) {
          selectedDir = dir;
          break;
        }
      }

      if (!selectedDir) {
        return;
      }

      const ignoreInitial = this.monitorConfig?.watchOptions?.ignoreInitial || false;

      // 初始扫描且忽略：只记录签名，不入队
      if (this.isInitialScan && ignoreInitial && !this.initializedDirectories.has(selectedDir)) {
        console.log(`忽略初始扫描，跳过目录: ${selectedDir}`);
        this.lastScanTime.set(selectedDir, now);
        await this.recordExistingFileSignatures(selectedDir);
        this.initializedDirectories.add(selectedDir);
      } else {
        // 收集该目录的新 .medbot 文件（递归）
        const newFiles = await this.collectNewMedbotFiles(selectedDir, now);

        if (newFiles.length > 0) {
          // 计算当前可用队列空间，避免一次性入队超过限制
          const status = this.batchLimiter.getStatus();
          const maxWaiting = status?.config?.maxQueueWaitingTasks ?? 50;
          const pending = status?.pendingTasks ?? 0;
          const availableSlots = Math.max(0, maxWaiting - pending);
          const filesToEnqueue = newFiles.slice(0, availableSlots);

          if (filesToEnqueue.length === 0) {
            console.log(`队列已满 (${pending}/${maxWaiting})，本轮不入队，目录: ${selectedDir}`);
          } else {
            // 先尝试从目录提取统一设备编号
            const dirDeviceId = extractDeviceIdFromPath(selectedDir);
            if (dirDeviceId && validateDeviceId(dirDeviceId)) {
              // 使用批处理限流器：按目录一次入队，受队列长度限制（默认为50）
              await this.batchLimiter.addDirectoryFiles(
                selectedDir,
                filesToEnqueue,
                async (task) => this.processMedbotFileTask(task),
                dirDeviceId
              );
            } else {
              // 无法从目录获得有效设备号：逐文件提取设备号并入队（同样受队列长度限制）
              for (const filePath of filesToEnqueue) {
                const fileDeviceId = extractDeviceIdFromPath(filePath);
                if (fileDeviceId && validateDeviceId(fileDeviceId)) {
                  await this.batchLimiter.addTask(
                    { filePath, deviceId: fileDeviceId, type: 'medbot', directoryPath: selectedDir },
                    async (task) => this.processMedbotFileTask(task)
                  );
                } else {
                  console.warn(`无法为文件解析有效设备编号，跳过入队: ${filePath}`);
                }
              }
            }
          }
        }

        // 更新最后扫描时间，并标记该目录已初始化
        this.lastScanTime.set(selectedDir, now);
        this.initializedDirectories.add(selectedDir);
      }

      // 如果所有目录都已初始化，结束初始扫描阶段
      if (this.isInitialScan && this.initializedDirectories.size >= directories.length) {
        this.isInitialScan = false;
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
          } else if (stat.isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            // 记录.medbot文件和压缩文件的签名但不处理文件
            if (ext === '.medbot' || (this.compressionConfig.enabled && this.archiveProcessor.isArchiveFile(filePath))) {
              const fileSignature = `${stat.size}-${stat.mtime.getTime()}`;
              this.fileSignatures.set(filePath, fileSignature);
              console.log(`记录现有文件签名: ${filePath}`);
            }
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
   * 收集目录中“新出现或已变化”的 .medbot 文件（递归）
   * 同时更新签名，返回需要入队处理的文件列表
   * @param {string} dirPath
   * @param {number} currentTime
   * @returns {Promise<string[]>}
   */
  async collectNewMedbotFiles(dirPath, currentTime) {
    const collected = [];
    try {
      const entries = fs.readdirSync(dirPath);
      
      // 清理已删除文件的签名记录
      const currentFiles = new Set();
      
      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry);
        let stat;
        try {
          stat = fs.statSync(entryPath);
        } catch {
          continue;
        }

        if (stat.isDirectory()) {
          const subCollected = await this.collectNewMedbotFiles(entryPath, currentTime);
          if (subCollected.length > 0) {
            collected.push(...subCollected);
          }
        } else if (stat.isFile()) {
          const ext = path.extname(entryPath).toLowerCase();
          if (ext === '.medbot') {
            currentFiles.add(entryPath);
            
            // 基于修改时间的优化：如果文件修改时间早于上次扫描时间，跳过
            const lastScanTime = this.lastScanTime.get(dirPath) || 0;
            if (lastScanTime > 0 && stat.mtime.getTime() < lastScanTime) {
              continue; // 跳过未修改的文件
            }
            
            const fileSignature = `${stat.size}-${stat.mtime.getTime()}`;
            const lastSignature = this.fileSignatures.get(entryPath);
            const isFileChanged = lastSignature !== fileSignature;
            const isNewFile = !lastSignature;
            
            if (isNewFile || isFileChanged) {
              this.fileSignatures.set(entryPath, fileSignature);
              collected.push(entryPath);
              console.log(`发现文件变化: ${entryPath} (${isNewFile ? '新文件' : '文件已修改'}) - 修改时间: ${stat.mtime.toISOString()}`);
            }
          }
        }
      }
      
      // 清理已删除文件的签名记录
      for (const [filePath, signature] of this.fileSignatures) {
        if (filePath.startsWith(dirPath) && !currentFiles.has(filePath)) {
          this.fileSignatures.delete(filePath);
          console.log(`清理已删除文件的签名: ${filePath}`);
        }
      }
      
    } catch (err) {
      console.error(`收集新文件失败: ${dirPath}`, err);
    }
    if (collected.length > 0) {
      console.log(`目录 ${dirPath} 收集到 ${collected.length} 个待入队的.medbot文件`);
    }
    return collected;
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
          } else if (stat.isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            
            // 处理.medbot文件
            if (ext === '.medbot') {
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
            // 处理压缩文件
            else if (this.compressionConfig.enabled && this.archiveProcessor.isArchiveFile(filePath)) {
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
                  console.log(`发现新压缩文件: ${filePath}`);
                } else {
                  console.log(`检测到压缩文件变化: ${filePath} (大小: ${stat.size}, 修改时间: ${stat.mtime.toISOString()})`);
                }
                
                await this.handleArchiveFile(filePath);
              }
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
        
        // 构建完整的文件路径列表
        const fullFilePaths = medbotFiles.map(file => path.join(dirPath, file));
        
        // 使用新的批处理限流器方法，限制单次处理的文件数量
        await this.batchLimiter.addDirectoryFiles(
          dirPath,
          fullFilePaths,
          async (task) => this.processMedbotFileTask(task),
          deviceId
        );
      } else {
        console.log(`目录 ${dirPath} 中未找到.medbot文件`);
      }
    } catch (error) {
      console.error(`扫描目录失败: ${dirPath}`, error);
    }
  }
  
  /**
   * 批处理任务：处理.medbot文件
   * @param {Object} task - 任务对象
   */
  async processMedbotFileTask(task) {
    const { filePath, deviceId } = task;
    
    try {
      console.log(`🔄 批处理任务：处理.medbot文件 ${filePath}`);
      
      const success = await this.processMedbotFile(filePath, deviceId);
      
      if (success) {
        console.log(`✅ 批处理任务完成：.medbot文件处理成功 ${filePath}`);
      } else {
        console.warn(`❌ 批处理任务失败：.medbot文件处理失败 ${filePath}`);
      }
      
      return success;
      
    } catch (error) {
      console.error(`❌ 批处理任务异常：处理.medbot文件失败 ${filePath}`, error);
      throw error;
    }
  }

  /**
   * 处理压缩文件
   * @param {string} filePath - 压缩文件路径
   */
  async handleArchiveFile(filePath) {
    try {
      console.log(`开始处理压缩文件: ${filePath}`);
      
      // 检查文件是否正在处理中
      if (this.processedFiles.has(filePath)) {
        const status = this.processedFiles.get(filePath);
        if (status.status === 'processing') {
          console.log(`压缩文件正在处理中，跳过: ${filePath}`);
          return;
        }
      }

      // 检查文件大小
      const stats = fs.statSync(filePath);
      const maxArchiveSize = this.compressionConfig.maxArchiveSize;
      if (stats.size > maxArchiveSize) {
        console.warn(`压缩文件过大，跳过处理: ${filePath} (${stats.size} bytes, 最大: ${maxArchiveSize} bytes)`);
        return;
      }

      // 标记文件为处理中
      this.processedFiles.set(filePath, { status: 'processing', timestamp: Date.now() });
      
      // 使用批处理限流器处理压缩文件
      await this.batchLimiter.addTask(
        { filePath, type: 'archive' },
        async (task) => this.processArchiveFileTask(task)
      );
    } catch (error) {
      console.error(`处理压缩文件失败: ${filePath}`, error);
      // 处理失败时移除标记，允许重试
      this.processedFiles.delete(filePath);
    }
  }
  
  /**
   * 批处理任务：处理压缩文件
   * @param {Object} task - 任务对象
   */
  async processArchiveFileTask(task) {
    const { filePath } = task;
    
    try {
      console.log(`🔄 批处理任务：处理压缩文件 ${filePath}`);
      
      // 处理压缩文件
      const result = await this.archiveProcessor.processArchive(filePath, async (medbotFilePath, deviceId) => {
        if (deviceId && validateDeviceId(deviceId)) {
          console.log(`使用压缩包设备编号 ${deviceId} 处理文件: ${medbotFilePath}`);
          const success = await this.processMedbotFile(medbotFilePath, deviceId);
          return { success: success, result: success ? '处理成功' : '处理失败' };
        } else {
          console.warn(`未提供有效设备编号，尝试从文件路径提取: ${medbotFilePath}`);
          // 如果ArchiveProcessor没有提供设备编号，回退到从文件路径提取
          const extractedDeviceId = extractDeviceIdFromPath(medbotFilePath);
          if (extractedDeviceId && validateDeviceId(extractedDeviceId)) {
            console.log(`从文件路径提取到设备编号: ${extractedDeviceId}`);
            const success = await this.processMedbotFile(medbotFilePath, extractedDeviceId);
            return { success: success, result: success ? '处理成功' : '处理失败' };
          } else {
            console.warn(`无法从文件路径提取有效设备编号: ${medbotFilePath}`);
            return { success: false, reason: '无效的设备编号' };
          }
        }
      });

      if (result && result.success) {
        console.log(`✅ 批处理任务完成：压缩文件处理成功 ${filePath}`);
        this.processedFiles.set(filePath, { 
          status: 'completed', 
          timestamp: Date.now(),
          result: result
        });
      } else {
        console.warn(`❌ 批处理任务失败：压缩文件处理失败 ${filePath}`);
        this.processedFiles.set(filePath, { status: 'failed', timestamp: Date.now() });
      }
      
      return result;
      
    } catch (error) {
      console.error(`❌ 批处理任务异常：处理压缩文件失败 ${filePath}`, error);
      this.processedFiles.set(filePath, { status: 'failed', timestamp: Date.now() });
      throw error;
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
      batchLimiter: this.batchLimiter.getStatus(),
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
