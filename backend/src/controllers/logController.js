const Log = require('../models/log');
const path = require('path');
const fs = require('fs');

// 日志上传（仅保存元数据，文件由中间件处理）
const uploadLog = async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ message: '未上传文件' });
    const log = await Log.create({
      filename: file.filename,
      original_path: file.path,
      uploader_id: req.user.id,
      size: file.size
    });
    res.status(201).json({ message: '上传成功', log });
  } catch (err) {
    res.status(500).json({ message: '上传失败', error: err.message });
  }
};

// 日志列表查询
const getLogs = async (req, res) => {
  try {
    const logs = await Log.findAll({ where: { uploader_id: req.user.id } });
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ message: '查询失败', error: err.message });
  }
};

// 日志解密（预留解密算法接口）
const decryptLog = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await Log.findByPk(id);
    if (!log) return res.status(404).json({ message: '未找到日志' });
    // 读取原始日志文件
    const rawContent = fs.readFileSync(log.original_path, 'utf-8');
    // TODO: 调用实际解密算法
    const decryptedContent = rawContent; // 目前直接返回原文
    // 保存解密后的文件
    const decryptedPath = path.join(path.dirname(log.original_path), 'decrypted_' + log.filename);
    fs.writeFileSync(decryptedPath, decryptedContent, 'utf-8');
    await log.update({ decrypted_path: decryptedPath, status: 'decrypted' });
    res.json({ message: '解密成功', decrypted_path: decryptedPath });
  } catch (err) {
    res.status(500).json({ message: '解密失败', error: err.message });
  }
};

// 下载解密后的日志
const downloadDecryptedLog = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await Log.findByPk(id);
    if (!log || !log.decrypted_path) return res.status(404).json({ message: '未找到解密日志' });
    res.download(log.decrypted_path, 'decrypted_' + log.filename);
  } catch (err) {
    res.status(500).json({ message: '下载失败', error: err.message });
  }
};

module.exports = {
  uploadLog,
  getLogs,
  decryptLog,
  downloadDecryptedLog
}; 