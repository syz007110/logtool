const fs = require('fs');
const path = require('path');
const Log = require('../models/log');
const LogEntry = require('../models/log_entry');
const ErrorCode = require('../models/error_code');
const { decryptLogContent } = require('../utils/decryptUtils');

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
    
    // 权限控制：普通用户只能看到自己的日志，专家用户和管理员可以看到所有日志
    // 通过中间件已经检查了权限，这里只需要根据用户角色过滤数据
    const userRole = req.user.role_id;
    if (userRole === 3) { // 普通用户
      where.uploader_id = req.user.id;
    }
    
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
    const deviceId = req.headers['x-device-id'];
    
    if (!decryptKey) {
      return res.status(400).json({ message: '未提供解密密钥' });
    }
    
    const uploadedLogs = [];
    
    for (const file of files) {
      try {
        // 读取文件内容
        const content = fs.readFileSync(file.path, 'utf-8');
        
        // 解密日志内容
        const decryptedEntries = decryptLogContent(content, decryptKey);
        
        // 创建日志记录
        const log = await Log.create({
          filename: file.filename,
          original_name: file.originalname,
          size: file.size,
          status: 'parsed', // 直接标记为已解析
          upload_time: new Date(),
          parse_time: new Date(), // 立即解析
          uploader_id: req.user ? req.user.id : null,
          device_id: deviceId || null,
          key_id: decryptKey || null
        });
        
        // 转换为数据库格式并存储，同时查询正确的释义
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
                console.log(`释义: ${explanation}`);
              }
            } catch (error) {
              console.error(`查询错误码释义失败: ${subsystem}${code}`, error.message);
            }
          }
          
          entries.push({
            log_id: log.id,
            timestamp: entry.timestamp,
            error_code: entry.error_code,
            param1: entry.param1,
            param2: entry.param2,
            param3: entry.param3,
            param4: entry.param4,
            explanation: explanation
          });
        }
        
        if (entries.length > 0) {
          await LogEntry.bulkCreate(entries);
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
        
        // 生成解密后的文件内容，使用正确的释义
        const decryptedContent = entries.map(entry => {
          return `${entry.timestamp} ${entry.error_code} ${entry.param1} ${entry.param2} ${entry.param3} ${entry.param4} ${entry.explanation}`;
        }).join('\n');
        
        // 保存解密后的文件
        fs.writeFileSync(decryptedFilePath, decryptedContent, 'utf-8');
        
        // 更新日志记录中的解密文件路径
        log.decrypted_path = decryptedFilePath;
        await log.save();
        
        // 删除原始文件，不存储
        fs.unlinkSync(file.path);
        
        uploadedLogs.push(log);
      } catch (error) {
        console.error(`处理文件 ${file.originalname} 失败:`, error);
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
    
    // 转换为数据库格式
    const entries = decryptedEntries.map(entry => ({
      log_id: log.id,
      timestamp: entry.timestamp,
      error_code: entry.error_code,
      param1: entry.param1,
      param2: entry.param2,
      param3: entry.param3,
      param4: entry.param4,
      explanation: entry.explanation
    }));
    
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
      return res.status(403).json({ message: '权限不足，只能删除自己的日志' });
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

module.exports = { getLogs, uploadLog, parseLog, getLogEntries, downloadLog, deleteLog }; 