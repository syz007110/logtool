/**
 * 自动上传处理器
 * 集成现有日志处理流程，处理.medbot文件自动上传
 */

const path = require('path');
const fs = require('fs');
const Device = require('../models/device');
const Log = require('../models/log');
const { extractMacFromSystemInfo, findSystemInfoFile } = require('../utils/systemInfoParser');
const { validateDeviceId, getDeviceInfo } = require('../utils/deviceIdExtractor');
const { getConfig, getErrorHandlingConfig } = require('../config/monitorConfig');

class AutoUploadProcessor {
  constructor() {
    this.config = getConfig();
    this.errorConfig = getErrorHandlingConfig();
    this.logProcessingQueue = null;
    this.processedFiles = new Map(); // 记录处理状态
  }

  /**
   * 设置日志处理队列
   * @param {Object} queue - Bull队列实例
   */
  setLogProcessingQueue(queue) {
    this.logProcessingQueue = queue;
  }

  /**
   * 处理.medbot文件自动上传
   * @param {string} filePath - 文件路径
   * @param {string} deviceId - 设备编号
   * @returns {Promise<boolean>} - 处理是否成功
   */
  async processMedbotFile(filePath, deviceId) {
    try {
      console.log(`开始处理.medbot文件: ${filePath}, 设备编号: ${deviceId}`);
      
      // 验证设备编号格式
      if (!validateDeviceId(deviceId)) {
        console.warn(`设备编号格式无效: ${deviceId}`);
        return false;
      }

      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        console.warn(`文件不存在: ${filePath}`);
        return false;
      }

      // 检查文件是否已处理过
      if (this.processedFiles.has(filePath)) {
        const status = this.processedFiles.get(filePath);
        if (status.status === 'processing') {
          console.log(`文件正在处理中，跳过: ${filePath}`);
          return false;
        }
        if (status.status === 'completed') {
          console.log(`文件已处理完成，跳过: ${filePath}`);
          return true;
        }
      }

      // 标记文件为处理中
      this.processedFiles.set(filePath, {
        status: 'processing',
        startTime: new Date(),
        deviceId: deviceId
      });

      // 获取解密密钥
      const decryptKey = await this.getDecryptKey(deviceId, filePath);
      
      if (!decryptKey) {
        console.warn(`无法获取设备 ${deviceId} 的解密密钥，跳过处理`);
        this.processedFiles.set(filePath, {
          status: 'failed',
          error: '无法获取解密密钥',
          endTime: new Date()
        });
        return false;
      }

      // 调用现有的日志处理流程
      const success = await this.uploadLogFile(filePath, deviceId, decryptKey);
      
      if (success) {
        this.processedFiles.set(filePath, {
          status: 'completed',
          endTime: new Date()
        });
        console.log(`成功处理.medbot文件: ${filePath}`);
        return true;
      } else {
        this.processedFiles.set(filePath, {
          status: 'failed',
          error: '上传处理失败',
          endTime: new Date()
        });
        console.warn(`处理.medbot文件失败: ${filePath}`);
        return false;
      }
      
    } catch (error) {
      console.error(`处理.medbot文件失败: ${filePath}`, error);
      this.processedFiles.set(filePath, {
        status: 'failed',
        error: error.message,
        endTime: new Date()
      });
      return false;
    }
  }

  /**
   * 获取解密密钥
   * @param {string} deviceId - 设备编号
   * @param {string} filePath - 文件路径
   * @returns {Promise<string|null>} - 解密密钥，未找到返回null
   */
  async getDecryptKey(deviceId, filePath) {
    try {
      console.log(`开始获取设备 ${deviceId} 的解密密钥`);
      
      // 策略1: 从数据库查找设备密钥
      const device = await getDeviceInfo(deviceId);
      if (device && device.device_key) {
        console.log(`从数据库获取到设备密钥: ${deviceId}`);
        return device.device_key;
      }

      // 策略2: 查找systeminfo.txt文件
      const systemInfoPath = findSystemInfoFile(filePath);
      if (systemInfoPath) {
        const macAddress = extractMacFromSystemInfo(systemInfoPath);
        if (macAddress) {
          console.log(`从systeminfo.txt获取到MAC地址: ${macAddress}`);
          
          // 如果设备不存在，自动创建设备记录
          if (!device) {
            await this.createDeviceRecord(deviceId, macAddress);
          }
          
          return macAddress;
        }
      }

      console.warn(`无法获取设备 ${deviceId} 的解密密钥`);
      return null;
      
    } catch (error) {
      console.error('获取解密密钥失败:', error);
      return null;
    }
  }

  /**
   * 创建设备记录
   * @param {string} deviceId - 设备编号
   * @param {string} deviceKey - 设备密钥
   */
  async createDeviceRecord(deviceId, deviceKey) {
    try {
      const device = await Device.create({
        device_id: deviceId,
        device_key: deviceKey,
        device_model: null,
        hospital: null,
        created_at: new Date(),
        updated_at: new Date()
      });
      
      console.log(`自动创建设备记录: ${deviceId}`);
      return device;
    } catch (error) {
      console.error(`创建设备记录失败: ${deviceId}`, error);
    }
  }

  /**
   * 上传日志文件（复用现有逻辑）
   * @param {string} filePath - 文件路径
   * @param {string} deviceId - 设备编号
   * @param {string} decryptKey - 解密密钥
   * @returns {Promise<boolean>} - 上传是否成功
   */
  async uploadLogFile(filePath, deviceId, decryptKey) {
    try {
      if (!this.logProcessingQueue) {
        throw new Error('日志处理队列未设置');
      }

      // 检查是否已存在相同设备编号和文件名的日志记录
      const existingLog = await Log.findOne({
        where: {
          device_id: deviceId,
          original_name: path.basename(filePath)
        }
      });

      let log;
      if (existingLog) {
        // 覆盖：更新现有日志记录
        await existingLog.update({
          filename: path.basename(filePath),
          size: fs.statSync(filePath).size,
          status: 'uploading',
          upload_time: new Date(),
          uploader_id: null, // 自动上传没有用户ID
          file_path: filePath
        });
        log = existingLog;
        console.log(`覆盖现有日志记录: ${log.id}`);
      } else {
        // 新增日志记录
        log = await Log.create({
          filename: path.basename(filePath), // 添加必需的filename字段
          original_name: path.basename(filePath),
          size: fs.statSync(filePath).size,
          device_id: deviceId,
          status: 'uploading',
          upload_time: new Date(),
          uploader_id: null, // 自动上传没有用户ID
          file_path: filePath
        });
        console.log(`创建新日志记录: ${log.id}`);
      }

      // 添加到处理队列
      const job = await this.logProcessingQueue.add('process-log', {
        filePath: filePath,
        originalName: path.basename(filePath),
        decryptKey: decryptKey,
        deviceId: deviceId,
        uploaderId: null, // 自动上传没有用户ID
        logId: log.id
      }, {
        priority: 1, // 高优先级
        delay: 0, // 立即处理
        attempts: this.errorConfig.maxRetries,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        removeOnComplete: true,
        removeOnFail: true
      });

      console.log(`日志文件已添加到处理队列: ${filePath}, 任务ID: ${job.id}`);
      
      // 更新日志记录状态
      await log.update({
        status: 'queued',
        queue_job_id: job.id
      });

      return true;
    } catch (error) {
      console.error(`上传日志文件失败: ${filePath}`, error);
      return false;
    }
  }

  /**
   * 重试处理失败的文件
   * @param {string} filePath - 文件路径
   * @returns {Promise<boolean>} - 重试是否成功
   */
  async retryFailedFile(filePath) {
    try {
      const fileStatus = this.processedFiles.get(filePath);
      if (!fileStatus || fileStatus.status !== 'failed') {
        console.log(`文件状态不是失败状态，无法重试: ${filePath}`);
        return false;
      }

      console.log(`重试处理失败的文件: ${filePath}`);
      
      // 清除之前的处理记录
      this.processedFiles.delete(filePath);
      
      // 重新处理文件
      const deviceId = fileStatus.deviceId;
      return await this.processMedbotFile(filePath, deviceId);
    } catch (error) {
      console.error(`重试处理文件失败: ${filePath}`, error);
      return false;
    }
  }

  /**
   * 获取处理状态
   * @returns {Object} - 处理状态信息
   */
  getProcessingStatus() {
    const status = {
      totalFiles: this.processedFiles.size,
      processing: 0,
      completed: 0,
      failed: 0,
      files: []
    };

    for (const [filePath, fileStatus] of this.processedFiles) {
      status[fileStatus.status]++;
      status.files.push({
        filePath,
        status: fileStatus.status,
        deviceId: fileStatus.deviceId,
        startTime: fileStatus.startTime,
        endTime: fileStatus.endTime,
        error: fileStatus.error
      });
    }

    return status;
  }

  /**
   * 清理已完成的文件记录
   */
  clearCompletedFiles() {
    const toDelete = [];
    
    for (const [filePath, fileStatus] of this.processedFiles) {
      if (fileStatus.status === 'completed') {
        toDelete.push(filePath);
      }
    }

    toDelete.forEach(filePath => {
      this.processedFiles.delete(filePath);
    });

    console.log(`清理了 ${toDelete.length} 个已完成的文件记录`);
  }

  /**
   * 清理所有文件记录
   */
  clearAllFiles() {
    this.processedFiles.clear();
    console.log('已清理所有文件记录');
  }

  /**
   * 获取失败的文件列表
   * @returns {Array} - 失败的文件信息
   */
  getFailedFiles() {
    const failedFiles = [];
    
    for (const [filePath, fileStatus] of this.processedFiles) {
      if (fileStatus.status === 'failed') {
        failedFiles.push({
          filePath,
          deviceId: fileStatus.deviceId,
          error: fileStatus.error,
          startTime: fileStatus.startTime,
          endTime: fileStatus.endTime
        });
      }
    }

    return failedFiles;
  }

  /**
   * 批量重试失败的文件
   * @returns {Promise<Object>} - 重试结果
   */
  async retryAllFailedFiles() {
    const failedFiles = this.getFailedFiles();
    const results = {
      total: failedFiles.length,
      success: 0,
      failed: 0,
      errors: []
    };

    for (const fileInfo of failedFiles) {
      try {
        const success = await this.retryFailedFile(fileInfo.filePath);
        if (success) {
          results.success++;
        } else {
          results.failed++;
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          filePath: fileInfo.filePath,
          error: error.message
        });
      }
    }

    console.log(`批量重试完成: 成功 ${results.success}, 失败 ${results.failed}`);
    return results;
  }
}

module.exports = AutoUploadProcessor;
