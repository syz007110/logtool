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

  // 只记录关键信息
  console.log(`[日志处理] 开始处理: ${originalName} (ID: ${logId})`);
  
  // 验证文件路径
  if (!filePath) {
    throw new Error('文件路径为空，无法处理文件');
  }

  try {
    // 更新任务进度
    await job.progress(10);

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      console.warn(`文件不存在，跳过处理: ${filePath}`);
      // 更新日志状态为文件错误，但不抛出异常
      await Log.update(
        { status: 'file_error' },
        { where: { id: logId } }
      );
      console.log(`✅ 已更新日志状态为 'file_error'，跳过处理`);
      return; // 优雅退出，不抛出异常
    }

    // 读取文件内容
    const content = fs.readFileSync(filePath, 'utf-8');
    // 移除冗余日志：console.log(`文件内容长度: ${content.length} 字符`);
    
    await job.progress(20);

    // 更新状态为解密中
    await Log.update(
      { status: 'decrypting' },
      { where: { id: logId } }
    );
    
    // 推送状态变化到 WebSocket
    try {
      const websocketService = require('../services/websocketService');
      websocketService.pushLogStatusChange(deviceId, logId, 'decrypting', 'uploading');
    } catch (wsError) {
      console.warn('WebSocket 状态推送失败:', wsError.message);
    }

    // 解密日志内容 - 只记录关键信息
    console.log(`[日志处理] 更换密钥，开始解密: ${originalName}`);
    const decryptedEntries = decryptLogContent(content, decryptKey);
    console.log(`[日志处理] 解密结果: ${decryptedEntries.length} 个日志条目`);

    await job.progress(50);

    // 如果解密失败（返回空数组），更新状态为解密失败并结束处理
    if (decryptedEntries.length === 0) {
      console.log(`[日志处理] 解密失败，更新状态为解密失败: ${originalName}`);
      await Log.update(
        { status: 'decrypt_failed' },
        { where: { id: logId } }
      );
      
      // 更新WebSocket状态
      try {
        const websocketService = require('../services/websocketService');
        websocketService.pushLogStatusChange(deviceId, logId, 'decrypt_failed', 'decrypting');
      } catch (wsError) {
        console.warn('WebSocket 状态推送失败:', wsError.message);
      }
      
      // 返回失败结果，但不抛出错误
      return {
        success: false,
        logId,
        entriesCount: 0,
        reason: '解密失败：无法解密文件内容'
      };
    }

    // 更新状态为解析中
    await Log.update(
      { status: 'parsing' },
      { where: { id: logId } }
    );
    
    // 推送状态变化到 WebSocket
    try {
      const websocketService = require('../services/websocketService');
      websocketService.pushLogStatusChange(deviceId, logId, 'parsing', 'decrypting');
    } catch (wsError) {
      console.warn('WebSocket 状态推送失败:', wsError.message);
    }

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
    
    // 推送状态变化到 WebSocket
    try {
      const websocketService = require('../services/websocketService');
      websocketService.pushLogStatusChange(deviceId, logId, 'parsed', 'parsing');
    } catch (wsError) {
      console.warn('WebSocket 状态推送失败:', wsError.message);
    }

    // 只有手动上传的文件才删除原文件，自动上传的文件保留
    if (uploaderId !== null) {
      // 手动上传的文件（有uploaderId），删除临时文件
      fs.unlinkSync(filePath);
      console.log(`[日志处理] 已删除手动上传的临时文件: ${originalName}`);
    } else {
      // 自动上传的文件（uploaderId为null），保留原文件
      console.log(`[日志处理] 保留自动上传的原文件: ${originalName}`);
    }
    
    console.log(`[日志处理] 处理完成: ${originalName}`);

    await job.progress(100);

    return {
      success: true,
      logId,
      entriesCount: entries.length,
      decryptedFilePath
    };

  } catch (error) {
    // 简化的错误信息输出，只保留关键信息
    console.error(`[日志处理] 处理失败: ${originalName}`);
    console.error(`[日志处理] 错误: ${error.message}`);
    
    // 根据错误类型提供具体的失败原因分析
    if (error.message.includes('解密失败：用户密钥和默认密钥都出现参数大于100000的情况')) {
      console.error(`[日志处理] 失败原因: 密钥错误 - 请检查密钥是否正确`);
    } else if (error.message.includes('日志行格式不正确')) {
      console.error(`[日志处理] 失败原因: 文件格式错误 - 检查日志格式`);
    } else if (error.message.includes('参数不是有效的十六进制格式')) {
      console.error(`[日志处理] 失败原因: 参数格式错误 - 检查文件是否损坏`);
    } else if (error.message.includes('密钥长度不足')) {
      console.error(`[日志处理] 失败原因: 密钥格式错误 - 应为MAC地址格式`);
    } else if (error.message.includes('所有') && error.message.includes('行日志解析都失败了')) {
      console.error(`[日志处理] 失败原因: 解密失败 - 检查密钥或加密方式`);
    } else if (error.message.includes('ENOENT') || error.message.includes('文件不存在')) {
      console.error(`[日志处理] 失败原因: 文件系统错误 - 检查文件权限和磁盘空间`);
    } else if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
      console.error(`[日志处理] 失败原因: 数据库连接错误 - 检查数据库服务状态`);
    } else if (error.message.includes('ER_ACCESS_DENIED_ERROR')) {
      console.error(`[日志处理] 失败原因: 数据库权限错误 - 检查用户权限配置`);
    } else if (error.message.includes('ER_NO_SUCH_TABLE')) {
      console.error(`[日志处理] 失败原因: 数据库表不存在 - 运行迁移脚本创建表结构`);
    } else {
      console.error(`[日志处理] 失败原因: 未知错误`);
    }
    
    // 只在开发环境下输出详细错误信息
    if (process.env.NODE_ENV === 'development') {
      console.error(`[日志处理] 详细错误:`, error.stack);
    }
    
    // 输出文件基本信息（如果文件存在）
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        console.error(`📊 文件信息:`);
        console.error(`   - 文件大小: ${stats.size} 字节`);
        console.error(`   - 创建时间: ${stats.birthtime}`);
        console.error(`   - 修改时间: ${stats.mtime}`);
        
        // 尝试读取文件前几行进行分析
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const lines = content.split(/\r?\n/).filter(line => line.trim());
          console.error(`📄 文件内容分析:`);
          console.error(`   - 总行数: ${lines.length}`);
          if (lines.length > 0) {
            console.error(`   - 第一行: ${lines[0].substring(0, 100)}${lines[0].length > 100 ? '...' : ''}`);
            if (lines.length > 1) {
              console.error(`   - 第二行: ${lines[1].substring(0, 100)}${lines[1].length > 100 ? '...' : ''}`);
            }
          }
        } catch (readError) {
          console.error(`   - 无法读取文件内容: ${readError.message}`);
        }
      } else {
        console.error(`📊 文件信息: 文件不存在`);
        console.error(`📁 检查目录内容:`);
        try {
          const dir = path.dirname(filePath);
          if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir);
            console.error(`   - 目录 ${dir} 中的文件: ${files.slice(0, 10).join(', ')}${files.length > 10 ? '...' : ''}`);
          } else {
            console.error(`   - 目录 ${dir} 不存在`);
          }
        } catch (dirError) {
          console.error(`   - 无法读取目录: ${dirError.message}`);
        }
      }
    } catch (statsError) {
      console.error(`📊 文件信息: 无法获取文件状态 - ${statsError.message}`);
    }
    
    console.error('='.repeat(80));
    
    // 根据错误类型确定具体的失败状态
    let failureStatus = 'failed';
    if (error.message.includes('解密失败：用户密钥和默认密钥都出现参数大于100000的情况')) {
      failureStatus = 'decrypt_failed';
    } else if (error.message.includes('解密后没有获得任何有效的日志条目')) {
      failureStatus = 'decrypt_failed';
    } else if (error.message.includes('文件不存在')) {
      failureStatus = 'file_error';
    } else if (error.message.includes('日志行格式不正确') || error.message.includes('参数不是有效的十六进制格式')) {
      failureStatus = 'parse_failed';
    }
    
    // 更新日志状态为具体的失败类型
    try {
      await Log.update(
        { status: failureStatus },
        { where: { id: logId } }
      );
      console.error(`✅ 已更新日志状态为 '${failureStatus}'`);
    } catch (updateError) {
      console.error(`❌ 更新日志状态失败: ${updateError.message}`);
    }
    
    // 只有手动上传的文件才删除临时文件，自动上传的文件保留
    if (uploaderId !== null) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.error(`✅ 已删除手动上传的临时文件: ${filePath}`);
        }
      } catch (deleteError) {
        console.error(`❌ 删除临时文件失败: ${deleteError.message}`);
      }
    } else {
      console.log(`[日志处理] 保留自动上传的原文件（处理失败）: ${originalName}`);
    }
    
    throw error;
  }
}

module.exports = {
  processLogFile
};
