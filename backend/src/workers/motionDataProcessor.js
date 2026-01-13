const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { PassThrough } = require('stream');

const UPLOAD_TEMP_DIR = path.resolve(__dirname, '../../uploads/temp');
const MOTION_DATA_RESULT_DIR = path.resolve(__dirname, '../../uploads/temp/motion-data');

// 延迟加载 websocketService（避免循环依赖）
let websocketService = null;
function getWebsocketService() {
  if (!websocketService) {
    websocketService = require('../services/websocketService');
  }
  return websocketService;
}

// 确保结果目录存在
if (!fs.existsSync(MOTION_DATA_RESULT_DIR)) {
  fs.mkdirSync(MOTION_DATA_RESULT_DIR, { recursive: true });
}

// 从 motionDataController 复制的解析函数
const ENTRY_SIZE_BYTES = 924;

function ensureFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    const error = new Error('File not found');
    error.status = 404;
    throw error;
  }
}

function parseEntry(buffer, offset) {
  const entry = {};
  const ts = buffer.readBigUInt64LE(offset + 0);
  entry['ulint_data'] = ts.toString();
  let base = offset + 8;
  for (let i = 0; i < 207; i += 1) {
    entry[`real_data_${i}`] = buffer.readFloatLE(base + i * 4);
  }
  base = offset + 8 + 207 * 4;
  entry['dint_data'] = buffer.readInt32LE(base);
  entry['uint_data'] = buffer.readUInt32LE(base + 4);
  const boolBase = base + 8;
  for (let i = 0; i < 8; i += 1) {
    entry[`bool_data_${i}`] = buffer.readUInt8(boolBase + i);
  }
  const instTypeBase = boolBase + 8;
  for (let i = 0; i < 4; i += 1) {
    entry[`instType_${i}`] = buffer.readInt16LE(instTypeBase + i * 2);
  }
  const instUDIBase = instTypeBase + 8;
  for (let i = 0; i < 16; i += 1) {
    entry[`instUDI_${i}`] = buffer.readUInt32LE(instUDIBase + i * 4);
  }
  return entry;
}

function loadMotionFormat() {
  const CONFIG_DIR = path.resolve(__dirname, '../config');
  const MOTION_FORMAT_PATH = path.join(CONFIG_DIR, 'motionFormat.json');
  try {
    const json = fs.readFileSync(MOTION_FORMAT_PATH, 'utf-8');
    return JSON.parse(json);
  } catch (err) {
    throw new Error(`Failed to read motion format config: ${err.message}`);
  }
}

function getUploadedFilePathById(id) {
  return path.join(UPLOAD_TEMP_DIR, id);
}

// 生成单个文件的CSV流（用于ZIP打包）
function generateCsvStream(filePath, originalFilename) {
  ensureFileExists(filePath);
  const stats = fs.statSync(filePath);
  const totalEntries = Math.floor(stats.size / ENTRY_SIZE_BYTES);

  const configList = loadMotionFormat();
  const fieldnames = configList.map((c) => c.index);
  const headers = configList.map((c) => c.name);

  const stream = new PassThrough();
  let fd = null;

  (async () => {
    try {
      stream.write('\ufeff'); // BOM for Excel
      stream.write(headers.join(',') + '\n');

      fd = fs.openSync(filePath, 'r');
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
            const str = String(value);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
          }).join(',');
          stream.write(row + '\n');
        }
      }

      stream.end();
    } catch (err) {
      console.error(`生成CSV流失败 (${originalFilename}):`, err);
      stream.destroy(err);
    } finally {
      // 确保文件描述符总是被关闭
      if (fd !== null) {
        try {
          fs.closeSync(fd);
        } catch (closeError) {
          console.error(`关闭文件描述符失败 (${originalFilename}):`, closeError);
        }
      }
    }
  })();

  return stream;
}

// 处理批量上传任务
async function processBatchUpload(job) {
  const { files, userId } = job.data;
  
  console.log(`[MotionData处理器] 开始处理批量上传任务 ${job.id}, 文件数: ${files.length}`);
  
  try {
    await job.progress(10);
    
    const results = [];
    const errors = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filePath = file.path;
      
      try {
        // 验证文件是否存在
        if (!fs.existsSync(filePath)) {
          throw new Error(`文件不存在: ${file.originalName}`);
        }
        
        // 验证文件大小（至少应该有一个条目）
        const stats = fs.statSync(filePath);
        if (stats.size < ENTRY_SIZE_BYTES) {
          throw new Error(`文件太小，无法解析: ${file.originalName}`);
        }
        
        // 文件验证通过，添加到结果列表
        results.push({
          id: file.id || path.basename(filePath),
          filename: file.originalName,
          size: stats.size
        });
        
      } catch (error) {
        console.error(`处理文件 ${file.originalName} 失败:`, error);
        errors.push({
          filename: file.originalName,
          error: error.message
        });
        
        // 如果文件存在但验证失败，删除它
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch (unlinkError) {
            console.error(`删除失败文件 ${filePath} 失败:`, unlinkError);
          }
        }
      }
      
      // 更新进度（无论成功失败都计入进度，确保进度条准确）
      const progress = 10 + Math.floor((i + 1) / files.length * 80);
      await job.progress(progress);
      
      // 手动推送进度（确保 WebSocket 实时更新）
      try {
        getWebsocketService().pushMotionDataTaskStatus(job.id, 'active', progress, job.data.userId);
      } catch (wsError) {
        // 忽略 WebSocket 错误，不影响主流程
      }
    }
    
    await job.progress(95);
    
    const result = {
      files: results,
      errors: errors.length > 0 ? errors : undefined
    };
    
    await job.progress(100);
    console.log(`[MotionData处理器] 批量上传任务 ${job.id} 完成, 成功: ${results.length}, 失败: ${errors.length}`);
    
    return result;
    
  } catch (error) {
    console.error(`[MotionData处理器] 批量上传任务 ${job.id} 失败:`, error);
    throw error;
  }
}

// 处理批量打包下载任务
async function processBatchDownload(job) {
  const { fileIds, userId } = job.data;
  
  console.log(`[MotionData处理器] 开始处理批量打包下载任务 ${job.id}, 文件数: ${fileIds.length}`);
  
  try {
    await job.progress(5);
    
    const configList = loadMotionFormat();
    const errors = [];
    const successFiles = [];
    
    // 创建ZIP文件路径
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const zipFileName = `motion_data_batch_${job.id}_${timestamp}.zip`;
    const zipFilePath = path.join(MOTION_DATA_RESULT_DIR, zipFileName);
    
    await job.progress(10);
    
    // 创建ZIP归档
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipFilePath);
      const archive = archiver('zip', {
        zlib: { level: 9 } // 最高压缩级别
      });
      
      output.on('close', async () => {
        try {
          await job.progress(100);
          console.log(`[MotionData处理器] 批量打包下载任务 ${job.id} 完成, ZIP大小: ${archive.pointer()} bytes`);
          
          resolve({
            zipFilePath,
            zipFileName,
            successFiles,
            errors: errors.length > 0 ? errors : undefined,
            size: archive.pointer()
          });
        } catch (error) {
          reject(error);
        }
      });
      
      archive.on('error', (err) => {
        console.error(`[MotionData处理器] ZIP归档错误:`, err);
        reject(err);
      });
      
      archive.pipe(output);
      
      // 处理每个文件
      (async () => {
        try {
          for (let i = 0; i < fileIds.length; i++) {
            const fileId = fileIds[i];
            
            try {
              const filePath = getUploadedFilePathById(fileId);
              ensureFileExists(filePath);
              
              // 获取原始文件名（去掉时间戳前缀）
              const originalName = fileId.replace(/^\d+-\d+-/, '');
              const csvFileName = originalName.replace(/\.bin$/i, '.csv') || `${fileId}.csv`;
              
              // 生成CSV流并添加到ZIP
              const csvStream = generateCsvStream(filePath, originalName);
              archive.append(csvStream, { name: csvFileName });
              
              successFiles.push({ id: fileId, filename: csvFileName });
              
            } catch (err) {
              console.error(`处理文件 ${fileId} 失败:`, err);
              errors.push({
                id: fileId,
                error: err.message
              });
            }
            
            // 更新进度（无论成功失败都计入进度，确保进度条准确）
            const progress = 10 + Math.floor((i + 1) / fileIds.length * 85);
            await job.progress(progress);
            
            // 手动推送进度（确保 WebSocket 实时更新）
            try {
              getWebsocketService().pushMotionDataTaskStatus(job.id, 'active', progress, job.data.userId);
            } catch (wsError) {
              // 忽略 WebSocket 错误，不影响主流程
            }
          }
          
          // 如果有错误，添加错误日志文件到ZIP
          if (errors.length > 0) {
            const errorLog = JSON.stringify({
              message: '部分文件解析失败',
              errors: errors,
              successCount: successFiles.length,
              totalCount: fileIds.length
            }, null, 2);
            archive.append(errorLog, { name: 'errors.json' });
          }
          
          // 完成ZIP归档
          await archive.finalize();
          
        } catch (error) {
          archive.abort();
          reject(error);
        }
      })();
    });
    
  } catch (error) {
    console.error(`[MotionData处理器] 批量打包下载任务 ${job.id} 失败:`, error);
    throw error;
  }
}

module.exports = {
  processBatchUpload,
  processBatchDownload
};
