const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { PassThrough } = require('stream');
const { motionDataQueue } = require('../config/queue');
const websocketService = require('../services/websocketService');
const { logOperation } = require('../utils/operationLogger');

// Binary layout constants (must match example/dataDecode.py MotionData)
const ENTRY_SIZE_BYTES = 924; // 8 + (207*4) + 4 + 4 + 8 + 8 + (16*4)

const UPLOAD_TEMP_DIR = path.resolve(__dirname, '../../uploads/temp');
const CONFIG_DIR = path.resolve(__dirname, '../config');
const MOTION_FORMAT_PATH = path.join(CONFIG_DIR, 'motionFormat.json');
const DH_MODEL_PATH = path.join(CONFIG_DIR, 'dhModel.json');

function ensureFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    const error = new Error('File not found');
    error.status = 404;
    throw error;
  }
}

function loadMotionFormat() {
  try {
    const json = fs.readFileSync(MOTION_FORMAT_PATH, 'utf-8');
    return JSON.parse(json);
  } catch (err) {
    throw new Error(`Failed to read motion format config: ${err.message}`);
  }
}

function loadDhModel() {
  try {
    const json = fs.readFileSync(DH_MODEL_PATH, 'utf-8');
    return JSON.parse(json);
  } catch (err) {
    throw new Error(`Failed to read DH model config: ${err.message}`);
  }
}

function getUploadedFilePathById(id) {
  // id is the saved filename
  const filePath = path.join(UPLOAD_TEMP_DIR, id);
  return filePath;
}

function parseEntry(buffer, offset) {
  const entry = {};

  // 0: ulint_data (uint64 LE)
  const ts = buffer.readBigUInt64LE(offset + 0);
  entry['ulint_data'] = ts.toString();

  // 8..(8 + 207*4): real_data floats
  let base = offset + 8;
  for (let i = 0; i < 207; i += 1) {
    entry[`real_data_${i}`] = buffer.readFloatLE(base + i * 4);
  }

  // next: dint_data int32
  base = offset + 8 + 207 * 4;
  entry['dint_data'] = buffer.readInt32LE(base);

  // next: uint_data uint32
  entry['uint_data'] = buffer.readUInt32LE(base + 4);

  // next: bool_data[8] uint8 -> 0/1
  const boolBase = base + 8;
  for (let i = 0; i < 8; i += 1) {
    entry[`bool_data_${i}`] = buffer.readUInt8(boolBase + i);
  }

  // next: instType[4] int16
  const instTypeBase = boolBase + 8;
  for (let i = 0; i < 4; i += 1) {
    entry[`instType_${i}`] = buffer.readInt16LE(instTypeBase + i * 2);
  }

  // next: instUDI[16] uint32
  const instUDIBase = instTypeBase + 8; // 4 * int16 = 8 bytes
  for (let i = 0; i < 16; i += 1) {
    entry[`instUDI_${i}`] = buffer.readUInt32LE(instUDIBase + i * 4);
  }

  return entry;
}

function parseFile(filePath, options = {}) {
  const { offset = 0, limit = 1000 } = options;
  ensureFileExists(filePath);
  const stats = fs.statSync(filePath);
  const fileSize = stats.size;

  const totalEntries = Math.floor(fileSize / ENTRY_SIZE_BYTES);
  const startEntry = Math.max(0, offset);
  const endEntry = Math.min(totalEntries, startEntry + limit);

  const startByte = startEntry * ENTRY_SIZE_BYTES;
  const endByteExclusive = endEntry * ENTRY_SIZE_BYTES;
  const length = endByteExclusive - startByte;

  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(length);
  fs.readSync(fd, buffer, 0, length, startByte);
  fs.closeSync(fd);

  const rows = [];
  for (let i = 0; i < length; i += ENTRY_SIZE_BYTES) {
    rows.push(parseEntry(buffer, i));
  }

  return { rows, totalEntries };
}

// POST /upload (multer handles file)
async function uploadBinary(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: '缺少文件' });
    }
    const savedName = req.file.filename;
    const size = req.file.size;
    return res.json({ id: savedName, filename: req.file.originalname, size });
  } catch (err) {
    console.error('上传二进制失败:', err);
    res.status(500).json({ message: '上传失败', error: err.message });
  }
}

// POST /batch-upload (multer handles multiple files, max 20)
async function batchUploadBinary(req, res) {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: '缺少文件' });
    }
    
    if (req.files.length > 20) {
      return res.status(400).json({ message: '最多只能上传20个文件' });
    }
    
    const userId = req.user ? req.user.id : null;
    
    // 准备文件信息（文件已由 multer 保存到临时目录）
    const files = req.files.map(file => ({
      id: file.filename,
      path: file.path,
      originalName: file.originalname,
      size: file.size
    }));
    
    // 创建队列任务
    // 注意：不要设置 removeOnComplete/removeOnFail 为 true，否则任务完成后立即删除，
    // 前端查询时会提示"任务不存在或已过期"。使用队列默认配置保留最近的任务。
    const job = await motionDataQueue.add('batch-upload', {
      type: 'batch-upload',
      files,
      userId
    }, {
      priority: 10,
      attempts: 1
      // 使用队列默认配置：removeOnComplete: 50, removeOnFail: 25
    });
    
    // 推送任务状态：waiting
    try {
      websocketService.pushMotionDataTaskStatus(job.id, 'waiting', 0, userId);
    } catch (wsError) {
      console.warn('WebSocket 状态推送失败:', wsError.message);
    }
    
    // 记录操作日志
    try {
      await logOperation({
        operation: '数据回放-批量上传',
        description: `上传 ${files.length} 个运动数据文件`,
        user_id: userId,
        username: req.user?.username || '',
        status: 'pending',
        ip: req.ip || req.connection?.remoteAddress || '',
        user_agent: req.headers['user-agent'] || '',
        details: {
          taskId: job.id,
          fileCount: files.length,
          files: files.map(f => ({
            filename: f.originalName,
            size: f.size
          }))
        }
      });
    } catch (logError) {
      console.warn('操作日志记录失败（已忽略）:', logError.message);
    }
    
    // 立即返回任务ID和文件基本信息
    return res.json({
      taskId: job.id,
      status: 'waiting',
      files: files.map(f => ({
        id: f.id,
        filename: f.originalName,
        size: f.size
      }))
    });
  } catch (err) {
    console.error('批量上传二进制失败:', err);
    
    // 如果队列创建失败，清理已上传的文件
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
            console.log(`已清理失败任务的文件: ${file.path}`);
          }
        } catch (unlinkError) {
          console.error(`清理文件失败 ${file.path}:`, unlinkError);
        }
      });
    }
    
    res.status(500).json({ message: '上传失败', error: err.message });
  }
}

// GET /config
async function getMotionFormat(req, res) {
  try {
    const cfg = loadMotionFormat();
    res.json({ columns: cfg });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// GET /dh-model
async function getDhModelConfig(req, res) {
  try {
    const dh = loadDhModel();
    res.json({ dh });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// GET /:id/preview?offset=&limit=
async function previewParsedData(req, res) {
  try {
    const { id } = req.params;
    const offset = Number(req.query.offset || 0);
    const limit = Math.min(Number(req.query.limit || 500), 5000);
    const filePath = getUploadedFilePathById(id);
    const { rows, totalEntries } = parseFile(filePath, { offset, limit });
    res.json({ rows, totalEntries, offset, limit });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ message: err.message });
  }
}

// GET /:id/download-csv
async function downloadCsv(req, res) {
  try {
    const { id } = req.params;
    const filePath = getUploadedFilePathById(id);
    ensureFileExists(filePath);
    const stats = fs.statSync(filePath);
    const totalEntries = Math.floor(stats.size / ENTRY_SIZE_BYTES);

    const configList = loadMotionFormat();
    const fieldnames = configList.map((c) => c.index);
    const headers = configList.map((c) => c.name);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${path.parse(id).name}.csv"`);
    res.write('\ufeff'); // BOM for Excel
    res.write(headers.join(',') + '\n');

    // Stream rows in chunks to avoid high memory usage
    const fd = fs.openSync(filePath, 'r');
    const CHUNK_ROWS = 2000;
    for (let offset = 0; offset < totalEntries; offset += CHUNK_ROWS) {
      const currentLimit = Math.min(CHUNK_ROWS, totalEntries - offset);
      const startByte = offset * ENTRY_SIZE_BYTES;
      const length = currentLimit * ENTRY_SIZE_BYTES;
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, startByte);
      for (let i = 0; i < length; i += ENTRY_SIZE_BYTES) {
        const rowObj = parseEntry(buffer, i);
        const row = fieldnames.map((key) => {
          const value = rowObj[key];
          if (value === undefined || value === null) return '';
          // Escape commas and quotes
          const str = String(value);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
          }
          return str;
        }).join(',');
        res.write(row + '\n');
      }
    }
    fs.closeSync(fd);
    res.end();
  } catch (err) {
    console.error('CSV导出失败:', err);
    res.status(500).json({ message: '导出失败', error: err.message });
  }
}

// 生成单个文件的CSV流（用于ZIP打包）
function generateCsvStream(filePath, originalFilename) {
  ensureFileExists(filePath);
  const stats = fs.statSync(filePath);
  const totalEntries = Math.floor(stats.size / ENTRY_SIZE_BYTES);

  const configList = loadMotionFormat();
  const fieldnames = configList.map((c) => c.index);
  const headers = configList.map((c) => c.name);

  // 创建PassThrough流
  const stream = new PassThrough();

  // 异步生成CSV内容
  (async () => {
    try {
      // 写入BOM和表头
      stream.write('\ufeff'); // BOM for Excel
      stream.write(headers.join(',') + '\n');

      const fd = fs.openSync(filePath, 'r');
      const CHUNK_ROWS = 2000;
      
      for (let offset = 0; offset < totalEntries; offset += CHUNK_ROWS) {
        const currentLimit = Math.min(CHUNK_ROWS, totalEntries - offset);
        const startByte = offset * ENTRY_SIZE_BYTES;
        const length = currentLimit * ENTRY_SIZE_BYTES;
        const buffer = Buffer.alloc(length);
        fs.readSync(fd, buffer, 0, length, startByte);
        
        for (let i = 0; i < length; i += ENTRY_SIZE_BYTES) {
          const rowObj = parseEntry(buffer, i);
          const row = fieldnames.map((key) => {
            const value = rowObj[key];
            if (value === undefined || value === null) return '';
            // Escape commas and quotes
            const str = String(value);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
          }).join(',');
          stream.write(row + '\n');
        }
      }
      
      fs.closeSync(fd);
      stream.end(); // 结束流
    } catch (err) {
      console.error(`生成CSV流失败 (${originalFilename}):`, err);
      stream.destroy(err);
    }
  })();

  return stream;
}

// POST /batch-download-csv
async function batchDownloadCsv(req, res) {
  const { fileIds } = req.body;
  
  if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
    return res.status(400).json({ message: '缺少文件ID列表' });
  }
  
  if (fileIds.length > 20) {
    return res.status(400).json({ message: '最多只能处理20个文件' });
  }

  try {
    const userId = req.user ? req.user.id : null;
    
    // 创建队列任务
    // 注意：不要设置 removeOnComplete/removeOnFail 为 true，否则任务完成后立即删除，
    // 前端查询时会提示"任务不存在或已过期"。使用队列默认配置保留最近的任务。
    const job = await motionDataQueue.add('batch-download', {
      type: 'batch-download',
      fileIds,
      userId
    }, {
      priority: 10,
      attempts: 1
      // 使用队列默认配置：removeOnComplete: 50, removeOnFail: 25
    });
    
    // 推送任务状态：waiting
    try {
      websocketService.pushMotionDataTaskStatus(job.id, 'waiting', 0, userId);
    } catch (wsError) {
      console.warn('WebSocket 状态推送失败:', wsError.message);
    }
    
    // 记录操作日志
    try {
      await logOperation({
        operation: '数据回放-批量打包下载',
        description: `打包下载 ${fileIds.length} 个运动数据文件为CSV`,
        user_id: userId,
        username: req.user?.username || '',
        status: 'pending',
        ip: req.ip || req.connection?.remoteAddress || '',
        user_agent: req.headers['user-agent'] || '',
        details: {
          taskId: job.id,
          fileCount: fileIds.length,
          fileIds: fileIds
        }
      });
    } catch (logError) {
      console.warn('操作日志记录失败（已忽略）:', logError.message);
    }
    
    // 立即返回任务ID
    return res.json({
      taskId: job.id,
      status: 'waiting',
      fileCount: fileIds.length
    });
  } catch (err) {
    console.error('批量CSV导出失败:', err);
    res.status(500).json({ message: '创建下载任务失败', error: err.message });
  }
}

// GET /task/:taskId - 查询任务状态
async function getTaskStatus(req, res) {
  try {
    const { taskId } = req.params;
    const userId = req.user ? req.user.id : null;
    const job = await motionDataQueue.getJob(taskId);
    
    if (!job) {
      return res.status(404).json({ success: false, message: '任务不存在或已过期' });
    }
    
    // 验证任务归属：只有任务创建者可以查询（管理员可以查询所有任务）
    const taskUserId = job.data?.userId;
    const isAdmin = req.user && req.user.permissions && req.user.permissions.includes('data_replay:manage');
    if (taskUserId && taskUserId !== userId && !isAdmin) {
      return res.status(403).json({ success: false, message: '无权访问此任务' });
    }
    
    const state = await job.getState();
    const progress = await job.progress();
    
    let payload = {
      id: job.id,
      status: state,
      progress: progress,
      createdAt: job.timestamp,
      data: job.data
    };
    
    if (state === 'completed') {
      const returnValue = job.returnvalue || {};
      payload.result = {
        downloadUrl: returnValue.zipFilePath ? `/motion-data/task/${taskId}/download` : null,
        zipFileName: returnValue.zipFileName || null,
        files: returnValue.successFiles || returnValue.files || null,
        errors: returnValue.errors || null,
        size: returnValue.size || null
      };
    } else if (state === 'failed') {
      payload.error = job.failedReason || '任务失败';
    }
    
    return res.json({ success: true, data: payload });
  } catch (error) {
    console.error('查询队列任务状态失败:', error);
    res.status(500).json({ success: false, message: '查询任务状态失败', error: error.message });
  }
}

// GET /tasks - 获取用户的所有活跃任务（用于页面刷新后恢复任务状态）
async function getUserTasks(req, res) {
  try {
    const userId = req.user ? req.user.id : null;
    const isAdmin = req.user && req.user.permissions && req.user.permissions.includes('data_replay:manage');
    
    if (!userId && !isAdmin) {
      return res.status(401).json({ success: false, message: '未授权' });
    }
    
    // 获取所有状态的任务（waiting, active, completed, failed）
    // 限制数量：只获取最近的任务，避免性能问题
    const [waitingJobs, activeJobs, completedJobs, failedJobs] = await Promise.all([
      motionDataQueue.getWaiting(0, 100),
      motionDataQueue.getActive(0, 100),
      motionDataQueue.getCompleted(0, 50), // 只获取最近50个完成的任务
      motionDataQueue.getFailed(0, 25) // 只获取最近25个失败的任务
    ]);
    
    // 合并所有任务
    const allJobs = [...waitingJobs, ...activeJobs, ...completedJobs, ...failedJobs];
    
    // 过滤：只返回当前用户的任务（管理员可以查看所有任务）
    const userTasks = allJobs.filter(job => {
      const taskUserId = job.data?.userId;
      return isAdmin || (taskUserId && taskUserId === userId);
    });
    
    // 转换为前端需要的格式
    const tasks = await Promise.all(userTasks.map(async (job) => {
      const state = await job.getState();
      const progress = await job.progress();
      
      const task = {
        id: job.id,
        type: job.data?.type || 'unknown',
        status: state,
        progress: progress,
        createdAt: job.timestamp,
        data: job.data
      };
      
      if (state === 'completed') {
        const returnValue = job.returnvalue || {};
        task.result = {
          downloadUrl: returnValue.zipFilePath ? `/motion-data/task/${job.id}/download` : null,
          zipFileName: returnValue.zipFileName || null,
          files: returnValue.successFiles || returnValue.files || null,
          errors: returnValue.errors || null,
          size: returnValue.size || null
        };
      } else if (state === 'failed') {
        task.error = job.failedReason || '任务失败';
      }
      
      return task;
    }));
    
    // 按创建时间倒序排列（最新的在前）
    tasks.sort((a, b) => b.createdAt - a.createdAt);
    
    return res.json({ success: true, data: tasks });
  } catch (error) {
    console.error('获取用户任务列表失败:', error);
    res.status(500).json({ success: false, message: '获取任务列表失败', error: error.message });
  }
}

// GET /task/:taskId/download - 下载任务结果（ZIP文件）
async function downloadTaskResult(req, res) {
  try {
    const { taskId } = req.params;
    const userId = req.user ? req.user.id : null;
    const job = await motionDataQueue.getJob(taskId);
    
    if (!job) {
      return res.status(404).json({ message: '任务不存在或已过期' });
    }
    
    // 验证任务归属：只有任务创建者可以下载（管理员可以下载所有任务）
    const taskUserId = job.data?.userId;
    const isAdmin = req.user && req.user.permissions && req.user.permissions.includes('data_replay:manage');
    if (taskUserId && taskUserId !== userId && !isAdmin) {
      return res.status(403).json({ message: '无权访问此任务' });
    }
    
    const state = await job.getState();
    if (state !== 'completed') {
      return res.status(400).json({ message: `任务尚未完成，当前状态: ${state}` });
    }
    
    const returnValue = job.returnvalue || {};
    const zipFilePath = returnValue.zipFilePath;
    
    if (!zipFilePath || !fs.existsSync(zipFilePath)) {
      return res.status(404).json({ message: '结果文件不存在或已过期' });
    }
    
    // 安全检查：确保文件路径在预期目录内，防止路径遍历攻击
    const normalizedPath = path.normalize(zipFilePath);
    const expectedDir = path.normalize(path.resolve(__dirname, '../../uploads/temp/motion-data'));
    if (!normalizedPath.startsWith(expectedDir)) {
      console.error(`安全警告: 尝试访问非法路径 ${zipFilePath}`);
      return res.status(403).json({ message: '非法文件路径' });
    }
    
    const zipFileName = returnValue.zipFileName || `motion_data_batch_${taskId}.zip`;
    
    // 设置响应头
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
    
    // 流式传输文件
    const fileStream = fs.createReadStream(zipFilePath);
    
    // 处理流错误
    fileStream.on('error', (err) => {
      console.error('文件流传输错误:', err);
      if (!res.headersSent) {
        res.status(500).json({ message: '文件传输失败', error: err.message });
      } else {
        // 如果响应头已发送，只能关闭连接
        res.destroy();
      }
    });
    
    // 处理响应错误
    res.on('error', (err) => {
      console.error('响应流错误:', err);
      fileStream.destroy();
    });
    
    // 客户端断开连接时清理
    res.on('close', () => {
      if (!res.writableEnded) {
        fileStream.destroy();
      }
    });
    
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('下载任务结果失败:', error);
    res.status(500).json({ message: '下载失败', error: error.message });
  }
}

module.exports = {
  uploadBinary,
  batchUploadBinary,
  getMotionFormat,
  getDhModelConfig,
  previewParsedData,
  downloadCsv,
  batchDownloadCsv,
  getTaskStatus,
  getUserTasks,
  downloadTaskResult,
};


