/**
 * 压缩文件处理工具
 * 支持多种压缩格式的解压和处理
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const yauzl = require('yauzl');
const tar = require('tar');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class ArchiveProcessor {
  constructor(config = {}) {
    // 支持的压缩文件扩展名
    this.supportedExtensions = ['.zip', '.tar.gz', '.7z', '.rar'];
    
    // 最大压缩文件大小 (500MB)
    this.maxArchiveSize = config.maxArchiveSize || 500 * 1024 * 1024;
    
    // 临时目录清理间隔 (24小时)
    this.tempDirCleanupInterval = config.tempDirCleanupInterval || 24 * 60 * 60 * 1000;
    
    // 最大临时目录数量
    this.maxTempDirs = config.maxTempDirs || 100;
    
    // 自定义临时目录基础路径
    this.tempDirBase = config.tempDirBase || null;
  }

  /**
   * 检测文件是否为支持的压缩格式
   * @param {string} filePath - 文件路径
   * @returns {boolean} - 是否为压缩文件
   */
  isArchiveFile(filePath) {
    const fileName = path.basename(filePath).toLowerCase();
    
    // 特殊处理.tar.gz文件
    if (fileName.endsWith('.tar.gz')) {
      return true;
    }
    
    const ext = path.extname(filePath).toLowerCase();
    return this.supportedExtensions.includes(ext);
  }

  /**
   * 获取压缩文件类型
   * @param {string} filePath - 文件路径
   * @returns {string} - 压缩文件类型
   */
  getArchiveType(filePath) {
    const fileName = path.basename(filePath).toLowerCase();
    
    // 特殊处理.tar.gz文件
    if (fileName.endsWith('.tar.gz')) {
      return '.tar.gz';
    }
    
    const ext = path.extname(filePath).toLowerCase();
    return ext;
  }

  /**
   * 创建临时解压目录
   * @returns {string} - 临时目录路径
   */
  createTempDir() {
    // 使用自定义临时目录基础路径，如果没有设置则使用系统临时目录
    const baseDir = this.tempDirBase || os.tmpdir();
    
    // 确保基础目录存在
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    
    const tempDir = path.join(baseDir, `logtool_extract_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    
    console.log(`创建临时解压目录: ${tempDir}`);
    return tempDir;
  }

  /**
   * 清理临时目录
   * @param {string} tempDir - 临时目录路径
   */
  async cleanupTempDir(tempDir) {
    try {
      if (fs.existsSync(tempDir)) {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
        console.log(`已清理临时目录: ${tempDir}`);
      }
    } catch (error) {
      console.error(`清理临时目录失败: ${tempDir}`, error);
    }
  }

  /**
   * 解压ZIP文件
   * @param {string} archivePath - 压缩文件路径
   * @param {string} extractDir - 解压目录
   * @returns {Promise<Array>} - 解压后的文件列表
   */
  async extractZip(archivePath, extractDir) {
    return new Promise((resolve, reject) => {
      const extractedFiles = [];
      
      yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          reject(new Error(`打开ZIP文件失败: ${err.message}`));
          return;
        }

        zipfile.readEntry();
        zipfile.on('entry', (entry) => {
          if (/\/$/.test(entry.fileName)) {
            // 目录条目，跳过
            zipfile.readEntry();
          } else {
            // 文件条目
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) {
                console.error(`读取ZIP条目失败: ${entry.fileName}`, err);
                zipfile.readEntry();
                return;
              }

              const outputPath = path.join(extractDir, entry.fileName);
              const outputDir = path.dirname(outputPath);
              
              // 确保输出目录存在
              fs.mkdirSync(outputDir, { recursive: true });
              
              const writeStream = fs.createWriteStream(outputPath);
              readStream.pipe(writeStream);
              
              writeStream.on('close', () => {
                extractedFiles.push(outputPath);
                zipfile.readEntry();
              });
              
              writeStream.on('error', (err) => {
                console.error(`写入文件失败: ${outputPath}`, err);
                zipfile.readEntry();
              });
            });
          }
        });

        zipfile.on('end', () => {
          console.log(`ZIP解压完成，共解压 ${extractedFiles.length} 个文件`);
          resolve(extractedFiles);
        });

        zipfile.on('error', (err) => {
          reject(new Error(`ZIP解压失败: ${err.message}`));
        });
      });
    });
  }

  /**
   * 解压TAR.GZ文件
   * @param {string} archivePath - 压缩文件路径
   * @param {string} extractDir - 解压目录
   * @returns {Promise<Array>} - 解压后的文件列表
   */
  async extractTarGz(archivePath, extractDir) {
    return new Promise((resolve, reject) => {
      const extractedFiles = [];
      
      fs.createReadStream(archivePath)
        .pipe(tar.extract({
          cwd: extractDir,
          onentry: (entry) => {
            const outputPath = path.join(extractDir, entry.path);
            extractedFiles.push(outputPath);
          }
        }))
        .on('error', (err) => {
          reject(new Error(`TAR.GZ解压失败: ${err.message}`));
        })
        .on('end', () => {
          console.log(`TAR.GZ解压完成，共解压 ${extractedFiles.length} 个文件`);
          resolve(extractedFiles);
        });
    });
  }

  /**
   * 解压7Z文件
   * @param {string} archivePath - 压缩文件路径
   * @param {string} extractDir - 解压目录
   * @returns {Promise<Array>} - 解压后的文件列表
   */
  async extract7z(archivePath, extractDir) {
    try {
      // 尝试多个可能的7z路径
      const possible7zPaths = [
        '7z', // 如果PATH中有7z
        'C:\\Program Files\\7-Zip\\7z.exe',
        'C:\\Program Files (x86)\\7-Zip\\7z.exe',
        process.env.PROGRAMFILES + '\\7-Zip\\7z.exe',
        process.env['PROGRAMFILES(X86)'] + '\\7-Zip\\7z.exe'
      ];
      
      let sevenZipPath = null;
      for (const possiblePath of possible7zPaths) {
        try {
          if (possiblePath === '7z') {
            // 测试PATH中的7z
            await execAsync('7z --help', { timeout: 5000 });
            sevenZipPath = '7z';
            break;
          } else if (fs.existsSync(possiblePath)) {
            sevenZipPath = possiblePath;
            break;
          }
        } catch (error) {
          // 继续尝试下一个路径
          continue;
        }
      }
      
      if (!sevenZipPath) {
        throw new Error('找不到7z命令，请确保7-Zip已安装并在PATH中');
      }
      
      // 使用7zip命令行工具解压，使用正确的参数
      const command = `"${sevenZipPath}" x "${archivePath}" -o"${extractDir}" -y`;
      console.log(`执行7z命令: ${command}`);
      await execAsync(command);
      
      // 获取解压后的文件列表
      const extractedFiles = [];
      const scanDir = (dir) => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            extractedFiles.push(filePath);
          } else if (stat.isDirectory()) {
            scanDir(filePath);
          }
        }
      };
      
      scanDir(extractDir);
      console.log(`7Z解压完成，共解压 ${extractedFiles.length} 个文件`);
      return extractedFiles;
    } catch (error) {
      throw new Error(`7Z解压失败: ${error.message}`);
    }
  }

  /**
   * 解压RAR文件
   * @param {string} archivePath - 压缩文件路径
   * @param {string} extractDir - 解压目录
   * @returns {Promise<Array>} - 解压后的文件列表
   */
  async extractRar(archivePath, extractDir) {
    try {
      // 尝试多个可能的7z路径
      const possible7zPaths = [
        '7z', // 如果PATH中有7z
        'C:\\Program Files\\7-Zip\\7z.exe',
        'C:\\Program Files (x86)\\7-Zip\\7z.exe',
        process.env.PROGRAMFILES + '\\7-Zip\\7z.exe',
        process.env['PROGRAMFILES(X86)'] + '\\7-Zip\\7z.exe'
      ];
      
      let sevenZipPath = null;
      for (const possiblePath of possible7zPaths) {
        try {
          if (possiblePath === '7z') {
            // 测试PATH中的7z
            await execAsync('7z --help', { timeout: 5000 });
            sevenZipPath = '7z';
            break;
          } else if (fs.existsSync(possiblePath)) {
            sevenZipPath = possiblePath;
            break;
          }
        } catch (error) {
          // 继续尝试下一个路径
          continue;
        }
      }
      
      if (!sevenZipPath) {
        throw new Error('找不到7z命令，请确保7-Zip已安装并在PATH中');
      }
      
      // 使用7zip命令行工具解压RAR文件
      const command = `"${sevenZipPath}" x "${archivePath}" -o"${extractDir}" -y`;
      console.log(`执行7z命令解压RAR: ${command}`);
      await execAsync(command);
      
      // 获取解压后的文件列表
      const extractedFiles = [];
      const scanDir = (dir) => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            extractedFiles.push(filePath);
          } else if (stat.isDirectory()) {
            scanDir(filePath);
          }
        }
      };
      
      scanDir(extractDir);
      console.log(`RAR解压完成，共解压 ${extractedFiles.length} 个文件`);
      return extractedFiles;
    } catch (error) {
      throw new Error(`RAR解压失败: ${error.message}`);
    }
  }

  /**
   * 解压压缩文件
   * @param {string} archivePath - 压缩文件路径
   * @param {string} extractDir - 解压目录
   * @returns {Promise<Array>} - 解压后的文件列表
   */
  async extractArchive(archivePath, extractDir) {
    const archiveType = this.getArchiveType(archivePath);
    
    console.log(`开始解压 ${archiveType} 文件: ${archivePath}`);
    
    switch (archiveType) {
      case '.zip':
        return await this.extractZip(archivePath, extractDir);
      case '.tar.gz':
        return await this.extractTarGz(archivePath, extractDir);
      case '.7z':
        return await this.extract7z(archivePath, extractDir);
      case '.rar':
        return await this.extractRar(archivePath, extractDir);
      default:
        throw new Error(`不支持的压缩格式: ${archiveType}`);
    }
  }

  /**
   * 扫描解压后的目录，查找.medbot文件
   * @param {string} extractDir - 解压目录
   * @returns {Array} - .medbot文件列表
   */
  scanForMedbotFiles(extractDir) {
    const medbotFiles = [];
    
    const scanDir = (dir) => {
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          
          if (stat.isDirectory()) {
            scanDir(filePath);
          } else if (stat.isFile() && path.extname(filePath).toLowerCase() === '.medbot') {
            medbotFiles.push(filePath);
          }
        }
      } catch (error) {
        console.error(`扫描目录失败: ${dir}`, error);
      }
    };
    
    scanDir(extractDir);
    console.log(`在解压目录中找到 ${medbotFiles.length} 个.medbot文件`);
    return medbotFiles;
  }

  /**
   * 处理压缩文件
   * @param {string} archivePath - 压缩文件路径
   * @param {Function} processMedbotFile - 处理.medbot文件的回调函数
   * @returns {Promise<Object>} - 处理结果
   */
  async processArchive(archivePath, processMedbotFile) {
    const result = {
      success: false,
      archivePath,
      extractedFiles: [],
      processedFiles: [],
      errors: []
    };

    let tempDir = null;

    try {
      // 检查文件是否存在
      if (!fs.existsSync(archivePath)) {
        throw new Error(`压缩文件不存在: ${archivePath}`);
      }

      // 检查文件大小
      const stats = fs.statSync(archivePath);
      if (stats.size > this.maxArchiveSize) {
        throw new Error(`压缩文件过大: ${stats.size} bytes (最大: ${this.maxArchiveSize} bytes)`);
      }

      // 创建临时解压目录
      tempDir = this.createTempDir();
      console.log(`创建临时解压目录: ${tempDir}`);

      // 解压文件
      const extractedFiles = await this.extractArchive(archivePath, tempDir);
      result.extractedFiles = extractedFiles;

      // 扫描.medbot文件
      const medbotFiles = this.scanForMedbotFiles(tempDir);
      
      if (medbotFiles.length === 0) {
        console.log(`压缩文件中未找到.medbot文件: ${archivePath}`);
        result.success = true;
        return result;
      }

      // 优先从压缩包文件名中提取设备编号
      const { extractDeviceIdFromPath, validateDeviceId } = require('./deviceIdExtractor');
      const archiveDeviceId = extractDeviceIdFromPath(archivePath);
      
      if (archiveDeviceId && validateDeviceId(archiveDeviceId)) {
        console.log(`从压缩包文件名提取到设备编号: ${archiveDeviceId}`);
        
        // 使用压缩包文件名中的设备编号处理所有.medbot文件
        for (const medbotFile of medbotFiles) {
          try {
            console.log(`使用压缩包设备编号 ${archiveDeviceId} 处理文件: ${medbotFile}`);
            const processResult = await processMedbotFile(medbotFile, archiveDeviceId);
            result.processedFiles.push({
              filePath: medbotFile,
              deviceId: archiveDeviceId,
              success: processResult.success,
              result: processResult
            });
          } catch (error) {
            console.error(`处理.medbot文件失败: ${medbotFile}`, error);
            result.errors.push({
              filePath: medbotFile,
              error: error.message
            });
          }
        }
      } else {
        console.log(`压缩包文件名中未找到有效设备编号，尝试从解压文件路径中提取`);
        
        // 如果压缩包文件名中没有设备编号，尝试从解压文件路径中提取
        for (const medbotFile of medbotFiles) {
          try {
            console.log(`处理解压后的.medbot文件: ${medbotFile}`);
            const processResult = await processMedbotFile(medbotFile);
            result.processedFiles.push({
              filePath: medbotFile,
              success: processResult.success,
              result: processResult
            });
          } catch (error) {
            console.error(`处理.medbot文件失败: ${medbotFile}`, error);
            result.errors.push({
              filePath: medbotFile,
              error: error.message
            });
          }
        }
      }

      result.success = true;
      console.log(`压缩文件处理完成: ${archivePath}, 成功处理 ${result.processedFiles.length} 个文件`);

    } catch (error) {
      console.error(`处理压缩文件失败: ${archivePath}`, error);
      result.errors.push({
        filePath: archivePath,
        error: error.message
      });
    } finally {
      // 延迟清理临时目录，给队列处理留出时间
      if (tempDir) {
        console.log(`延迟清理临时目录: ${tempDir}`);
        // 延迟清理时间设置为队列超时时间 + 缓冲时间
        const cleanupDelay = (parseInt(process.env.QUEUE_TIMEOUT_MS) || 300000) + 60000; // 队列超时时间 + 1分钟缓冲
        setTimeout(async () => {
          try {
            await this.cleanupTempDir(tempDir);
            console.log(`临时目录清理完成: ${tempDir}`);
          } catch (error) {
            console.error(`清理临时目录失败: ${tempDir}`, error);
          }
        }, cleanupDelay);
      }
    }

    return result;
  }
}

module.exports = ArchiveProcessor;
