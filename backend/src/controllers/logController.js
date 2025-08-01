const fs = require('fs');
const path = require('path');
const Log = require('../models/log');
const LogEntry = require('../models/log_entry');
const ErrorCode = require('../models/error_code');
const { decryptLogContent } = require('../utils/decryptUtils');
const { parseExplanation, parseExplanations } = require('../utils/explanationParser');

const UPLOAD_DIR = path.join(__dirname, '../../uploads/logs');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// 获取日志列表
const getLogs = async (req, res) => {
  try {
    let { page = 1, limit = 20, device_id } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    
    // 构建查询条件
    const where = {};
    if (device_id) {
      where.device_id = device_id;
    }
    
    // 权限控制：所有用户都可以看到所有日志，但删除权限在删除接口中单独控制
    // 普通用户、专家用户和管理员都可以查看所有日志
    // 删除权限在deleteLog函数中单独检查
    
    const { count: total, rows: logs } = await Log.findAndCountAll({
      where,
      offset: (page - 1) * limit,
      limit,
      order: [['upload_time', 'DESC']]
    });
    res.json({ logs, total });
  } catch (err) {
    res.status(500).json({ message: '获取日志失败', error: err.message });
  }
};

// 上传日志
const uploadLog = async (req, res) => {
  try {
    const files = req.files; // 支持多文件
    if (!files || files.length === 0) {
      return res.status(400).json({ message: '未上传文件' });
    }
    
    // 从请求头获取解密密钥和设备编号
    const decryptKey = req.headers['x-decrypt-key'];
    const deviceId = req.headers['x-device-id'] || '0000-00'; // 默认设备编号
    
    if (!decryptKey) {
      return res.status(400).json({ message: '未提供解密密钥' });
    }
    
    // 验证密钥格式
    if (!validateKey(decryptKey)) {
      return res.status(400).json({ message: '密钥格式不正确，应为MAC地址格式（如：00-01-05-77-6a-09）' });
    }
    
    // 验证设备编号格式
    if (deviceId !== '0000-00' && !validateDeviceId(deviceId)) {
      return res.status(400).json({ message: '设备编号格式不正确，应为数字或字母组合格式（如：4371-01、ABC-12、123-XY）' });
    }
    
    const uploadedLogs = [];
    
    for (const file of files) {
      try {
        console.log(`开始处理文件: ${file.originalname}, 大小: ${file.size} bytes`);
        
        // 创建日志记录，初始状态为上传中
        const log = await Log.create({
          filename: file.filename,
          original_name: file.originalname,
          size: file.size,
          status: 'uploading', // 初始状态为上传中
          upload_time: new Date(),
          uploader_id: req.user ? req.user.id : null,
          device_id: deviceId || null,
          key_id: decryptKey || null
        });
        
        // 读取文件内容
        const content = fs.readFileSync(file.path, 'utf-8');
        console.log(`文件内容长度: ${content.length} 字符`);
        console.log(`文件前100个字符: ${content.substring(0, 100)}`);
        
        // 更新状态为解密中
        await log.update({ status: 'decrypting' });
        
        // 解密日志内容
        console.log(`开始解密文件，使用密钥: ${decryptKey}`);
        const decryptedEntries = decryptLogContent(content, decryptKey);
        console.log(`解密完成，得到 ${decryptedEntries.length} 个日志条目`);
        
        if (decryptedEntries.length === 0) {
          // 如果解密失败，更新状态为失败
          await log.update({ status: 'failed' });
          throw new Error('解密后没有获得任何有效的日志条目');
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
            code = '0X' + errorCodeStr.slice(-4);; // '0X' + 后4位
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
            entry.param4  // 参数3
          );
          
          entries.push({
            log_id: log.id,
            timestamp: entry.timestamp,
            error_code: entry.error_code,
            param1: entry.param1,
            param2: entry.param2,
            param3: entry.param3,
            param4: entry.param4,
            explanation: parsedExplanation
          });
        }
        
        console.log('释义查询和解析完成，示例:', entries[0]?.explanation);
        console.log(`准备插入 ${entries.length} 个日志条目到数据库`);
        
        // 更新状态为解析中
        await log.update({ status: 'parsing' });
        
        if (entries.length > 0) {
          await LogEntry.bulkCreate(entries);
          console.log('数据库插入完成');
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
        const decryptedFileName = file.originalname.replace('.medbot', '.txt');
        const decryptedFilePath = path.join(deviceFolder, decryptedFileName);
        
        // 生成解密后的文件内容，使用解析后的释义
        const decryptedContent = entries.map(entry => {
          return `${entry.timestamp} ${entry.error_code} ${entry.param1} ${entry.param2} ${entry.param3} ${entry.param4} ${entry.explanation}`;
        }).join('\n');
        
        // 保存解密后的文件
        fs.writeFileSync(decryptedFilePath, decryptedContent, 'utf-8');
        
        // 更新日志记录中的解密文件路径和状态
        log.decrypted_path = decryptedFilePath;
        log.status = 'parsed'; // 标记为解析完成
        log.parse_time = new Date(); // 设置解析时间
        await log.save();
        
        // 删除原始文件，不存储
        fs.unlinkSync(file.path);
        console.log(`文件 ${file.originalname} 处理完成`);
        
        uploadedLogs.push(log);
      } catch (error) {
        console.error(`处理文件 ${file.originalname} 失败:`, error);
        console.error('错误堆栈:', error.stack);
        
        // 如果日志记录已创建，更新状态为失败
        if (log && log.id) {
          try {
            await log.update({ status: 'failed' });
          } catch (updateError) {
            console.error('更新日志状态失败:', updateError);
          }
        }
        
        // 删除临时文件
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        throw new Error(`文件 ${file.originalname} 解密失败: ${error.message}`);
      }
    }
    
    res.json({ 
      message: `成功上传并解析 ${uploadedLogs.length} 个文件`, 
      logs: uploadedLogs 
    });
  } catch (err) {
    res.status(500).json({ message: '上传失败', error: err.message });
  }
};

// 解析日志（写入 log_entries）
const parseLog = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await Log.findByPk(id);
    if (!log) return res.status(404).json({ message: '日志不存在' });
    
    // 权限控制：普通用户只能解析自己的日志，专家用户和管理员可以解析任何日志
    const userRole = req.user.role_id;
    if (userRole === 3 && log.uploader_id !== req.user.id) { // 普通用户且不是自己的日志
      return res.status(403).json({ message: '权限不足，只能解析自己的日志' });
    }
    
    const filePath = path.join(UPLOAD_DIR, log.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: '文件不存在' });
    
    // 读取文件内容
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // 使用数据库中保存的密钥进行解密
    const key = log.key_id;
    if (!key) {
      return res.status(400).json({ message: '未找到解密密钥，请重新上传并输入密钥' });
    }
    
    // 解密日志内容
    const decryptedEntries = decryptLogContent(content, key);
    
    // 转换为数据库格式并查询正确的释义
    const entries = [];
    for (const entry of decryptedEntries) {
      // 根据需求，通过解密后的故障码首位+('0X'+故障码后4位)去匹配error_codes表
      const errorCodeStr = entry.error_code;
      let subsystem = '';
      let code = '';
      
      if (errorCodeStr && errorCodeStr.length >= 5) {
        subsystem = errorCodeStr.charAt(0); // 首位
        code = '0X' + errorCodeStr.slice(-4);; // '0X' + 后4位
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
            console.log(`解析日志原始释义: ${explanation}`);
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
        entry.param4  // 参数3
      );
      
      entries.push({
        log_id: log.id,
        timestamp: entry.timestamp,
        error_code: entry.error_code,
        param1: entry.param1,
        param2: entry.param2,
        param3: entry.param3,
        param4: entry.param4,
        explanation: parsedExplanation
      });
    }
    
    console.log('解析日志释义完成，示例:', entries[0]?.explanation);
    
    // 清空旧明细并插入新明细
    await LogEntry.destroy({ where: { log_id: log.id } });
    if (entries.length > 0) {
      await LogEntry.bulkCreate(entries);
    }
    
    // 更新日志状态
    log.status = 'parsed';
    log.parse_time = new Date();
    await log.save();
    
    res.json({ message: '解析成功', count: entries.length });
  } catch (err) {
    console.error('解析日志失败:', err);
    res.status(500).json({ message: '解析失败', error: err.message });
  }
};

// 获取日志明细
const getLogEntries = async (req, res) => {
  try {
    const { id } = req.params;
    
    // 先检查日志是否存在并验证权限
    const log = await Log.findByPk(id);
    if (!log) return res.status(404).json({ message: '日志不存在' });
    
    // 权限控制：普通用户只能查看自己的日志明细，专家用户和管理员可以查看任何日志明细
    const userRole = req.user.role_id;
    if (userRole === 3 && log.uploader_id !== req.user.id) { // 普通用户且不是自己的日志
      return res.status(403).json({ message: '权限不足，只能查看自己的日志明细' });
    }
    
    const entries = await LogEntry.findAll({ where: { log_id: id }, order: [['timestamp', 'ASC']] });
    res.json({ entries });
  } catch (err) {
    res.status(500).json({ message: '获取日志明细失败', error: err.message });
  }
};

// 批量获取日志明细（用于分析功能）
const getBatchLogEntries = async (req, res) => {
  try {
    const { 
      log_ids, 
      search, 
      error_code, 
      start_time, 
      end_time, 
      page = 1, 
      limit = 100 
    } = req.query;
    
    // 构建查询条件
    const where = {};
    
    // 日志ID筛选
    if (log_ids) {
      const ids = log_ids.split(',').map(id => parseInt(id.trim()));
      where.log_id = { [require('sequelize').Op.in]: ids };
    }
    
    // 故障码筛选
    if (error_code) {
      where.error_code = { [require('sequelize').Op.like]: `%${error_code}%` };
    }
    
    // 时间范围筛选
    if (start_time || end_time) {
      where.timestamp = {};
      if (start_time) {
        where.timestamp[require('sequelize').Op.gte] = new Date(start_time);
      }
      if (end_time) {
        where.timestamp[require('sequelize').Op.lte] = new Date(end_time);
      }
    }
    
    // 搜索功能（在释义中搜索）
    if (search) {
      where.explanation = { [require('sequelize').Op.like]: `%${search}%` };
    }
    
    // 权限控制：普通用户只能查看自己的日志明细
    const userRole = req.user.role_id;
    if (userRole === 3) { // 普通用户
      // 需要先获取用户自己的日志ID列表
      const userLogs = await Log.findAll({
        where: { uploader_id: req.user.id },
        attributes: ['id']
      });
      const userLogIds = userLogs.map(log => log.id);
      
      if (where.log_id) {
        // 如果已经指定了log_ids，需要取交集
        const requestedIds = Array.isArray(where.log_id[require('sequelize').Op.in]) 
          ? where.log_id[require('sequelize').Op.in] 
          : [where.log_id[require('sequelize').Op.in]];
        const allowedIds = requestedIds.filter(id => userLogIds.includes(id));
        where.log_id = { [require('sequelize').Op.in]: allowedIds };
      } else {
        where.log_id = { [require('sequelize').Op.in]: userLogIds };
      }
    }
    
    // 分页
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const { count: total, rows: entries } = await LogEntry.findAndCountAll({
      where,
      offset,
      limit: parseInt(limit),
      order: [['timestamp', 'ASC']],
      include: [{
        model: Log,
        as: 'Log',
        attributes: ['original_name', 'device_id', 'uploader_id', 'upload_time']
      }]
    });
    
    res.json({ 
      entries, 
      total, 
      page: parseInt(page), 
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    console.error('批量获取日志明细失败:', err);
    res.status(500).json({ message: '获取日志明细失败', error: err.message });
  }
};

// 下载日志
const downloadLog = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await Log.findByPk(id);
    if (!log) return res.status(404).json({ message: '日志不存在' });
    
    // 权限控制：普通用户只能下载自己的日志，专家用户和管理员可以下载任何日志
    const userRole = req.user.role_id;
    if (userRole === 3 && log.uploader_id !== req.user.id) { // 普通用户且不是自己的日志
      return res.status(403).json({ message: '权限不足，只能下载自己的日志' });
    }
    
    // 优先从保存的解密文件中读取
    if (log.decrypted_path && fs.existsSync(log.decrypted_path)) {
      const fileContent = fs.readFileSync(log.decrypted_path, 'utf-8');
      
      // 设置响应头
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(log.decrypted_path)}"`);
      
      // 发送文件内容
      res.send(fileContent);
      return;
    }
    
    // 如果解密文件不存在，从数据库生成
    const entries = await LogEntry.findAll({ 
      where: { log_id: id }, 
      order: [['timestamp', 'ASC']] 
    });
    
    if (entries.length === 0) {
      return res.status(404).json({ message: '日志明细不存在' });
    }
    
    // 生成解密后的文件内容
    const fileContent = entries.map(entry => {
      return `${entry.timestamp} ${entry.error_code} ${entry.param1} ${entry.param2} ${entry.param3} ${entry.param4} ${entry.explanation}`;
    }).join('\n');
    
    // 设置响应头
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${log.original_name.replace('.medbot', '_decrypted.txt')}"`);
    
    // 发送文件内容
    res.send(fileContent);
  } catch (err) {
    res.status(500).json({ message: '下载失败', error: err.message });
  }
};

// 删除日志
const deleteLog = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await Log.findByPk(id);
    if (!log) return res.status(404).json({ message: '日志不存在' });
    
    // 权限控制：普通用户只能删除自己的日志，专家用户和管理员可以删除任何日志
    const userRole = req.user.role_id;
    if (userRole === 3 && log.uploader_id !== req.user.id) { // 普通用户且不是自己的日志
      return res.status(403).json({ message: '权限不足，只能删除自己上传的日志' });
    }
    
    // 删除解密文件（如果存在）
    if (log.decrypted_path && fs.existsSync(log.decrypted_path)) {
      fs.unlinkSync(log.decrypted_path);
    }
    
    // 删除相关的日志明细
    await LogEntry.destroy({ where: { log_id: id } });
    
    // 删除日志记录
    await log.destroy();
    res.json({ message: '删除成功' });
  } catch (err) {
    res.status(500).json({ message: '删除失败', error: err.message });
  }
};

// 根据密钥自动填充设备编号
const autoFillDeviceId = async (req, res) => {
  try {
    const { key } = req.query;
    
    if (!key) {
      return res.status(400).json({ message: '请提供密钥' });
    }
    
    // 在logs表中查找使用过该密钥的设备编号
    const log = await Log.findOne({
      where: { key_id: key },
      order: [['upload_time', 'DESC']], // 获取最新的记录
      attributes: ['device_id']
    });
    
    if (log && log.device_id) {
      res.json({ device_id: log.device_id });
    } else {
      res.json({ device_id: null });
    }
  } catch (err) {
    res.status(500).json({ message: '自动填充失败', error: err.message });
  }
};

// 根据设备编号自动填充密钥
const autoFillKey = async (req, res) => {
  try {
    const { device_id } = req.query;
    
    if (!device_id) {
      return res.status(400).json({ message: '请提供设备编号' });
    }
    
    // 在logs表中查找该设备编号使用过的密钥
    const log = await Log.findOne({
      where: { device_id: device_id },
      order: [['upload_time', 'DESC']], // 获取最新的记录
      attributes: ['key_id']
    });
    
    if (log && log.key_id) {
      res.json({ key: log.key_id });
    } else {
      res.json({ key: null });
    }
  } catch (err) {
    res.status(500).json({ message: '自动填充失败', error: err.message });
  }
};

// 验证密钥格式
const validateKey = (key) => {
  // 密钥格式：mac地址，例如 00-01-05-77-6a-09
  const macAddressRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
  return macAddressRegex.test(key);
};

// 验证设备编号格式
const validateDeviceId = (deviceId) => {
  // 设备编号格式：允许数字+字母组合，例如 4371-01、ABC-12、123-XY
  const deviceIdRegex = /^[0-9A-Za-z]+-[0-9A-Za-z]+$/;
  return deviceIdRegex.test(deviceId);
};

// 批量删除日志
const batchDeleteLogs = async (req, res) => {
  try {
    const { logIds } = req.body;
    
    if (!logIds || !Array.isArray(logIds) || logIds.length === 0) {
      return res.status(400).json({ message: '请提供要删除的日志ID列表' });
    }
    
    const userRole = req.user.role_id;
    const userId = req.user.id;
    
    // 获取所有要删除的日志
    const logs = await Log.findAll({ where: { id: logIds } });
    
    if (logs.length === 0) {
      return res.status(404).json({ message: '未找到要删除的日志' });
    }
    
    // 权限检查：普通用户只能删除自己的日志
    if (userRole === 3) {
      const unauthorizedLogs = logs.filter(log => log.uploader_id !== userId);
      if (unauthorizedLogs.length > 0) {
        return res.status(403).json({ 
          message: '权限不足，只能删除自己上传的日志',
          unauthorizedLogs: unauthorizedLogs.map(log => ({ id: log.id, original_name: log.original_name }))
        });
      }
    }
    
    let successCount = 0;
    let failCount = 0;
    const failedLogs = [];
    
    for (const log of logs) {
      try {
        // 删除解密文件（如果存在）
        if (log.decrypted_path && fs.existsSync(log.decrypted_path)) {
          fs.unlinkSync(log.decrypted_path);
        }
        
        // 删除相关的日志明细
        await LogEntry.destroy({ where: { log_id: log.id } });
        
        // 删除日志记录
        await log.destroy();
        successCount++;
      } catch (error) {
        console.error(`删除日志 ${log.original_name} 失败:`, error);
        failCount++;
        failedLogs.push({ id: log.id, original_name: log.original_name, error: error.message });
      }
    }
    
    res.json({ 
      message: `批量删除完成，成功 ${successCount} 个，失败 ${failCount} 个`,
      successCount,
      failCount,
      failedLogs
    });
  } catch (err) {
    res.status(500).json({ message: '批量删除失败', error: err.message });
  }
};

module.exports = { 
  getLogs, 
  uploadLog, 
  parseLog, 
  getLogEntries, 
  getBatchLogEntries,
  downloadLog, 
  deleteLog,
  batchDeleteLogs,
  autoFillDeviceId,
  autoFillKey,
  validateKey,
  validateDeviceId
}; 