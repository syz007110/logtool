const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const { decryptLogContent } = require('../utils/decryptUtils');
const { parseExplanation } = require('../utils/explanationParser');
const Log = require('../models/log');
const LogEntry = require('../models/log_entry');
const ErrorCode = require('../models/error_code');
const Device = require('../models/device');

// 上传目录
const UPLOAD_DIR = path.join(__dirname, '../../uploads/logs');

/**
 * 处理日志文件的工作函数
 * @param {Object} job - Bull队列任务对象
 */
async function processLogFile(job) {
  const { 
    filePath, 
    originalName, 
    decryptKey, 
    deviceId, 
    uploaderId, 
    logId 
  } = job.data;

  console.log(`开始处理日志文件: ${originalName}, 任务ID: ${job.id}`);

  try {
    // 更新任务进度
    await job.progress(10);

    // 读取文件内容
    const content = fs.readFileSync(filePath, 'utf-8');
    console.log(`文件内容长度: ${content.length} 字符`);
    
    await job.progress(20);

    // 更新状态为解密中
    await Log.update(
      { status: 'decrypting' },
      { where: { id: logId } }
    );

    // 解密日志内容
    console.log(`开始解密文件，使用密钥: ${decryptKey}`);
    const decryptedEntries = decryptLogContent(content, decryptKey);
    console.log(`解密完成，得到 ${decryptedEntries.length} 个日志条目`);

    await job.progress(50);

    if (decryptedEntries.length === 0) {
      throw new Error('解密后没有获得任何有效的日志条目');
    }

    // 更新状态为解析中
    await Log.update(
      { status: 'parsing' },
      { where: { id: logId } }
    );

    // 转换为数据库格式并存储，同时查询正确的释义和解析占位符
    const entries = [];
    for (const entry of decryptedEntries) {
      // 根据需求，通过解密后的故障码首位+('0X'+故障码后4位)去匹配error_codes表
      const errorCodeStr = entry.error_code;
      let subsystem = '';
      let code = '';
      
      if (errorCodeStr && errorCodeStr.length >= 5) {
        subsystem = errorCodeStr.charAt(0); // 首位
        code = '0X' + errorCodeStr.slice(-4); // '0X' + 后4位
      }
      
      // 查询error_codes表获取正确的释义
      let explanation = entry.explanation; // 默认使用原始释义
      if (subsystem && code) {
        try {
          const errorCodeRecord = await ErrorCode.findOne({
            where: { subsystem, code }
          });
          if (errorCodeRecord && errorCodeRecord.explanation) {
            explanation = errorCodeRecord.explanation;
          }
        } catch (error) {
          console.error(`查询错误码释义失败: ${subsystem}${code}`, error.message);
        }
      }
      
      // 立即解析释义中的占位符，提高效率
      const parsedExplanation = parseExplanation(
        explanation,
        entry.param1, // 参数0
        entry.param2, // 参数1
        entry.param3, // 参数2
        entry.param4, // 参数3
        {
          error_code: entry.error_code,
          subsystem,
          arm: errorCodeStr?.charAt(1) || null,
          joint: errorCodeStr?.charAt(2) || null
        }
      );
      
      entries.push({
        log_id: logId,
        timestamp: entry.timestamp,
        error_code: entry.error_code,
        param1: entry.param1,
        param2: entry.param2,
        param3: entry.param3,
        param4: entry.param4,
        explanation: parsedExplanation
      });
    }

    await job.progress(70);

    console.log('释义查询和解析完成，示例:', entries[0]?.explanation);
    console.log(`准备插入 ${entries.length} 个日志条目到数据库`);
    
    // 覆盖式写入：清空旧的明细再写入新的
    await LogEntry.destroy({ where: { log_id: logId } });
    if (entries.length > 0) {
      await LogEntry.bulkCreate(entries);
      console.log('数据库插入完成');
    }

    await job.progress(85);

    // 同步设备信息到设备表（若存在）
    try {
      if (deviceId && deviceId !== '0000-00') {
        const [device, created] = await Device.findOrCreate({
          where: { device_id: deviceId },
          defaults: {
            device_model: null,
            device_key: decryptKey,
            created_at: new Date(),
            updated_at: new Date()
          }
        });
        
        if (!created) {
          // 更新现有设备信息
          await device.update({
            device_key: decryptKey,
            updated_at: new Date()
          });
        }
      }
    } catch (e) {
      console.warn('设备信息同步失败（忽略，不影响日志处理）:', e.message);
    }

    // 根据需求，解密后的文件应该保存到服务器磁盘
    // 创建设备编号文件夹（如果设备编号存在）
    let deviceFolder = UPLOAD_DIR;
    if (deviceId) {
      deviceFolder = path.join(UPLOAD_DIR, deviceId);
      if (!fs.existsSync(deviceFolder)) {
        fs.mkdirSync(deviceFolder, { recursive: true });
      }
    }
    
    // 生成解密后的文件名（与上传文件保持一致，.medbot -> .txt）
    const decryptedFileName = originalName.replace('.medbot', '.txt');
    const decryptedFilePath = path.join(deviceFolder, decryptedFileName);
    
    // 生成解密后的文件内容，使用解析后的释义
    const decryptedContent = entries.map(entry => {
      const localTs = dayjs(entry.timestamp).format('YYYY-MM-DD HH:mm:ss');
      return `${localTs} ${entry.error_code} ${entry.param1} ${entry.param2} ${entry.param3} ${entry.param4} ${entry.explanation}`;
    }).join('\n');
    
    // 保存解密后的文件
    fs.writeFileSync(decryptedFilePath, decryptedContent, 'utf-8');

    await job.progress(95);

    // 更新日志记录中的解密文件路径和状态
    await Log.update({
      decrypted_path: decryptedFilePath,
      status: 'parsed', // 标记为解析完成
      parse_time: new Date() // 设置解析时间
    }, { where: { id: logId } });

    // 删除原始文件，不存储
    fs.unlinkSync(filePath);
    console.log(`文件 ${originalName} 处理完成`);

    await job.progress(100);

    return {
      success: true,
      logId,
      entriesCount: entries.length,
      decryptedFilePath
    };

  } catch (error) {
    console.error(`处理文件 ${originalName} 失败:`, error);
    console.error('错误堆栈:', error.stack);
    
    // 更新日志状态为失败
    await Log.update(
      { status: 'failed' },
      { where: { id: logId } }
    );
    
    // 删除临时文件
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    throw error;
  }
}

module.exports = {
  processLogFile
};
