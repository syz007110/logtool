const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { PassThrough } = require('stream');
const readline = require('readline');
const zlib = require('zlib');
const crypto = require('crypto');
const MotionDataFile = require('../models/motion_data_file');
const motionStorage = require('../config/motionDataStorage');

const UPLOAD_TEMP_DIR = path.resolve(__dirname, '../../uploads/temp');
const MOTION_DATA_RESULT_DIR = path.resolve(__dirname, '../../uploads/temp/motion-data');
const MOTION_DATA_PARSED_DIR = path.resolve(__dirname, '../../uploads/temp/motion-data-parsed');

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
if (!fs.existsSync(MOTION_DATA_PARSED_DIR)) {
  fs.mkdirSync(MOTION_DATA_PARSED_DIR, { recursive: true });
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

function writeOrDrain(dest, chunk) {
  // 只检查 null/undefined，空字符串是有效数据需要写入
  if (chunk === null || chunk === undefined || dest.destroyed) return Promise.resolve();
  const ok = dest.write(chunk);
  if (ok) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      dest.off('drain', onDrain);
      dest.off('error', onError);
    };
    dest.on('drain', onDrain);
    dest.on('error', onError);
  });
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
    entry[`bool_data_${i}`] = buffer.readUInt8(boolBase + i) === 1;
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

function safeUnlink(fp) {
  try {
    if (fp && fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch (_) {}
}

function validateFilename(originalName) {
  return /^\d{12}\.bin$/i.test(String(originalName || '').trim());
}

function validateTimestamp17(tsStr) {
  const s = String(tsStr || '').trim();
  if (!/^\d{17}$/.test(s)) return false;
  const year = Number(s.slice(0, 4));
  const month = Number(s.slice(4, 6));
  const day = Number(s.slice(6, 8));
  const hour = Number(s.slice(8, 10));
  const minute = Number(s.slice(10, 12));
  const second = Number(s.slice(12, 14));
  const ms = Number(s.slice(14, 17));
  if (!Number.isFinite(year) || year < 1970 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (hour < 0 || hour > 23) return false;
  if (minute < 0 || minute > 59) return false;
  if (second < 0 || second > 59) return false;
  if (ms < 0 || ms > 999) return false;
  // Use UTC to avoid timezone side effects
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day &&
    d.getUTCHours() === hour &&
    d.getUTCMinutes() === minute &&
    d.getUTCSeconds() === second &&
    d.getUTCMilliseconds() === ms
  );
}

function readTimestampAtEntry(filePath, entryIndex) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(8);
    const pos = entryIndex * ENTRY_SIZE_BYTES;
    fs.readSync(fd, buf, 0, 8, pos);
    return buf.readBigUInt64LE(0).toString();
  } finally {
    fs.closeSync(fd);
  }
}

function sha256File(fp) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(fp);
    s.on('error', reject);
    s.on('data', (buf) => h.update(buf));
    s.on('end', () => resolve(h.digest('hex')));
  });
}

async function streamParseToJsonlGz({ filePath, outPath, onFrame }) {
  return new Promise((resolve, reject) => {
    const rs = fs.createReadStream(filePath);
    const gz = zlib.createGzip({ level: 6 });
    const ws = fs.createWriteStream(outPath);

    let leftover = Buffer.alloc(0);
    let frameIndex = 0;

    // JSONL -> gzip -> file
    gz.pipe(ws);

    rs.on('data', (chunk) => {
      const buf = leftover.length ? Buffer.concat([leftover, chunk]) : chunk;
      let offset = 0;
      while (offset + ENTRY_SIZE_BYTES <= buf.length) {
        frameIndex += 1;
        const entry = parseEntry(buf, offset);
        entry.frame_index = frameIndex;
        gz.write(JSON.stringify(entry) + '\n');
        if (typeof onFrame === 'function') onFrame(frameIndex);
        offset += ENTRY_SIZE_BYTES;
      }
      leftover = buf.slice(offset);
    });
    rs.on('error', reject);
    rs.on('end', () => {
      if (leftover.length !== 0) {
        reject(new Error('file has trailing bytes (not aligned to entry size)'));
        return;
      }
      gz.end();
    });
    gz.on('error', reject);
    ws.on('error', reject);
    ws.on('finish', resolve);
  });
}

// 从 JSONL.gz 文件生成 CSV 流（避免重新解析 bin）
function generateCsvStreamFromJsonl(jsonlGzPath, originalFilename) {
  ensureFileExists(jsonlGzPath);
  const configList = loadMotionFormat();
  const fieldnames = configList.map((c) => c.index);
  const headers = configList.map((c) => c.name);

  const stream = new PassThrough({ highWaterMark: 64 * 1024 });
  const gunzip = zlib.createGunzip();
  const rs = fs.createReadStream(jsonlGzPath);

  (async () => {
    let rl = null;
    try {
      await writeOrDrain(stream, '\ufeff'); // BOM for Excel
      await writeOrDrain(stream, headers.join(',') + '\n');

      rs.on('error', (err) => {
        console.error(`读取 JSONL.gz 失败 (${originalFilename}):`, err);
        stream.destroy(err);
      });
      gunzip.on('error', (err) => {
        console.error(`解压 JSONL.gz 失败 (${originalFilename}):`, err);
        stream.destroy(err);
      });
      stream.on('close', () => {
        try { rs.destroy(); } catch (_) { }
        try { gunzip.destroy(); } catch (_) { }
        try { rl?.close(); } catch (_) { }
      });

      const input = rs.pipe(gunzip);
      input.setEncoding('utf8');
      rl = readline.createInterface({ input, crlfDelay: Infinity });

      let outBuf = '';
      const FLUSH_THRESHOLD = 64 * 1024;
      for await (const line of rl) {
        if (!line || !String(line).trim()) continue;
        let rowObj;
        try {
          rowObj = JSON.parse(line);
        } catch (parseErr) {
          console.warn(`解析 JSONL 行失败 (${originalFilename}):`, parseErr.message);
          continue;
        }

        const row = fieldnames.map((key) => {
          const value = rowObj[key];
          if (value === undefined || value === null) return '';
          const str = String(value);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
          }
          return str;
        }).join(',');

        outBuf += row + '\n';
        if (outBuf.length >= FLUSH_THRESHOLD) {
          await writeOrDrain(stream, outBuf);
          outBuf = '';
        }
      }

      if (outBuf) await writeOrDrain(stream, outBuf);
      stream.end();
    } catch (err) {
      console.error(`生成CSV流失败 (${originalFilename}):`, err);
      stream.destroy(err);
    } finally {
      try { rl?.close(); } catch (_) { }
      try { gunzip.destroy(); } catch (_) { }
      try { rs.destroy(); } catch (_) { }
    }
  })();

  return stream;
}

// 生成单个文件的CSV流（从 bin 文件解析，用于ZIP打包）
function generateCsvStream(filePath, originalFilename) {
  ensureFileExists(filePath);
  const stats = fs.statSync(filePath);
  const totalEntries = Math.floor(stats.size / ENTRY_SIZE_BYTES);

  const configList = loadMotionFormat();
  const fieldnames = configList.map((c) => c.index);
  const headers = configList.map((c) => c.name);

  const stream = new PassThrough({ highWaterMark: 64 * 1024 });
  let fd = null;

  (async () => {
    try {
      await writeOrDrain(stream, '\ufeff'); // BOM for Excel
      await writeOrDrain(stream, headers.join(',') + '\n');

      fd = fs.openSync(filePath, 'r');
      const CHUNK_ROWS = 2000;
      const FLUSH_EVERY_ROWS = 200;

      for (let offset = 0; offset < totalEntries; offset += CHUNK_ROWS) {
        if (stream.destroyed) break;
        const currentLimit = Math.min(CHUNK_ROWS, totalEntries - offset);
        const startByte = offset * ENTRY_SIZE_BYTES;
        const length = currentLimit * ENTRY_SIZE_BYTES;
        const buffer = Buffer.alloc(length);
        fs.readSync(fd, buffer, 0, length, startByte);

        let outBuf = '';
        let rowInBuf = 0;
        for (let i = 0; i < length; i += ENTRY_SIZE_BYTES) {
          if (stream.destroyed) break;
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
          outBuf += row + '\n';
          rowInBuf += 1;
          if (rowInBuf >= FLUSH_EVERY_ROWS || outBuf.length >= 64 * 1024) {
            await writeOrDrain(stream, outBuf);
            outBuf = '';
            rowInBuf = 0;
          }
        }

        if (outBuf) await writeOrDrain(stream, outBuf);
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
        const recordId = Number(file.recordId);
        const jobRevision = Number(file.revision);

        // recordId is required in new flow
        if (!Number.isFinite(recordId) || recordId <= 0) {
          throw new Error('recordId 缺失或无效');
        }

        const row = await MotionDataFile.findByPk(recordId);
        if (!row) {
          // If row missing, cleanup local file and skip
          safeUnlink(filePath);
          throw new Error('元数据记录不存在');
        }

        // 覆盖保护：如果 revision 不匹配，说明已被新上传覆盖；丢弃本次任务结果
        if (Number(row.revision) !== jobRevision) {
          safeUnlink(filePath);
          console.warn(`[MotionData处理器] 记录 ${recordId} 已被覆盖（db.revision=${row.revision}, job.revision=${jobRevision}），丢弃旧任务`);
          errors.push({
            id: recordId,
            filename: row.original_name,
            error: 'skipped: overwritten by newer upload'
          });
          continue;
        }

        // 标记解析中
        await row.update({ status: 'parsing', error_message: null, task_id: String(job.id) });

        const originalName = String(row.original_name || file.originalName || '');
        const deviceId = String(row.device_id || file.deviceId || '');

        // 文件名校验（YYYYMMDDhhmm.bin）
        if (!validateFilename(originalName)) {
          await row.update({ status: 'file_error', error_message: '文件名格式错误：必须为 YYYYMMDDhhmm.bin' });
          safeUnlink(filePath);
          throw new Error('文件名格式错误');
        }

        // 验证文件是否存在
        if (!fs.existsSync(filePath)) {
          await row.update({ status: 'processing_failed', error_message: '临时文件不存在' });
          throw new Error(`文件不存在: ${originalName}`);
        }
        
        const stats = fs.statSync(filePath);
        if (stats.size < ENTRY_SIZE_BYTES || stats.size % ENTRY_SIZE_BYTES !== 0) {
          await row.update({ status: 'file_error', error_message: '文件大小不合法（必须为帧大小 924 的整数倍）' });
          safeUnlink(filePath);
          throw new Error(`文件大小不合法: ${originalName}`);
        }

        const totalFrames = Math.floor(stats.size / ENTRY_SIZE_BYTES);
        const tsFirst = readTimestampAtEntry(filePath, 0);
        const tsLast = readTimestampAtEntry(filePath, Math.max(0, totalFrames - 1));

        if (!validateTimestamp17(tsFirst)) {
          await row.update({ status: 'file_error', error_message: '首帧时间戳格式错误（必须为 YYYYMMDDhhmmssxxx 17位数字）' });
          safeUnlink(filePath);
          throw new Error(`首帧时间戳格式错误: ${originalName}`);
        }
        if (!validateTimestamp17(tsLast)) {
          await row.update({ status: 'file_error', error_message: '末帧时间戳格式错误（必须为 YYYYMMDDhhmmssxxx 17位数字）' });
          safeUnlink(filePath);
          throw new Error(`末帧时间戳格式错误: ${originalName}`);
        }

        // 计算 sha256（raw）
        const sha256 = await sha256File(filePath);

        // 根据存储模式选择 OSS 或本地存储
        const storageMode = String(motionStorage.STORAGE || 'oss').toLowerCase();
        let rawKey = '';
        let parsedKey = '';
        let rawEtag = null;

        if (storageMode === 'local') {
          // 本地存储：保存到本地文件系统
          const rawLocalPath = motionStorage.buildRawLocalPath(deviceId, originalName);
          motionStorage.saveLocalFile(filePath, rawLocalPath);
          // 存储相对路径（用于后续读取）
          rawKey = path.relative(motionStorage.LOCAL_DIR, rawLocalPath).replace(/\\/g, '/');

          // 生成 parsed jsonl.gz
          const parsedLocal = path.join(MOTION_DATA_PARSED_DIR, `parsed_${recordId}_${jobRevision}.jsonl.gz`);
          safeUnlink(parsedLocal);

          await streamParseToJsonlGz({
            filePath,
            outPath: parsedLocal,
            onFrame: (frameIdx) => {
              // no-op; reserved
            }
          });

          const parsedLocalPath = motionStorage.buildParsedLocalPath(deviceId, originalName);
          motionStorage.saveLocalFile(parsedLocal, parsedLocalPath);
          parsedKey = path.relative(motionStorage.LOCAL_DIR, parsedLocalPath).replace(/\\/g, '/');

          safeUnlink(parsedLocal);
        } else {
          // OSS 存储
          const client = await motionStorage.getOssClient();
          if (!client) {
            await row.update({ status: 'processing_failed', error_message: 'OSS client not available' });
            throw new Error('OSS client not available');
          }
          rawKey = String(row.raw_object_key || file.rawObjectKey || motionStorage.buildRawObjectKey(deviceId, originalName)).replace(/^\//, '');
          parsedKey = String(row.parsed_object_key || file.parsedObjectKey || motionStorage.buildParsedObjectKey(deviceId, originalName)).replace(/^\//, '');

          const rawPut = await client.put(rawKey, filePath);
          rawEtag = String(rawPut?.res?.headers?.etag || rawPut?.etag || '').replace(/"/g, '') || null;

          // 生成并上传 parsed jsonl.gz
          const parsedLocal = path.join(MOTION_DATA_PARSED_DIR, `parsed_${recordId}_${jobRevision}.jsonl.gz`);
          safeUnlink(parsedLocal);

          await streamParseToJsonlGz({
            filePath,
            outPath: parsedLocal,
            onFrame: (frameIdx) => {
              // no-op; reserved
            }
          });

          await client.put(parsedKey, parsedLocal);
          safeUnlink(parsedLocal);
        }
        
        await row.update({
          storage: storageMode,
          raw_object_key: rawKey,
          parsed_object_key: parsedKey,
          sha256,
          etag: rawEtag,
          size_bytes: stats.size,
          total_frames: totalFrames,
          ts_first: tsFirst,
          ts_last: tsLast,
          status: 'completed',
          error_message: null,
          parse_time: new Date()
        });

        // 清理本地临时文件
        safeUnlink(filePath);

        results.push({
          id: recordId,
          filename: originalName,
          size: stats.size
        });
        
      } catch (error) {
        console.error(`处理文件 ${file.originalName} 失败:`, error);
        errors.push({
          id: file.recordId || null,
          filename: file.originalName,
          error: error.message
        });
        
        safeUnlink(filePath);
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

// 获取 OSS 对象流（不落盘，用于流式打包）
async function getOssStream(objectKey) {
  const client = await motionStorage.getOssClient();
  if (!client) {
    throw new Error('OSS client not available');
  }
  const key = String(objectKey || '').replace(/^\//, '');
  const result = await client.getStream(key);
  return result.stream;
}

// 从 JSONL.gz 流生成 CSV 流（用于 OSS 流式处理）
function generateCsvStreamFromJsonlStream(jsonlGzStream, originalFilename) {
  const configList = loadMotionFormat();
  const fieldnames = configList.map((c) => c.index);
  const headers = configList.map((c) => c.name);

  const stream = new PassThrough({ highWaterMark: 64 * 1024 });
  const gunzip = zlib.createGunzip();

  (async () => {
    let rl = null;
    try {
      await writeOrDrain(stream, '\ufeff'); // BOM for Excel
      await writeOrDrain(stream, headers.join(',') + '\n');

      jsonlGzStream.on('error', (err) => {
        console.error(`读取 JSONL.gz 流失败 (${originalFilename}):`, err);
        stream.destroy(err);
      });
      gunzip.on('error', (err) => {
        console.error(`解压 JSONL.gz 流失败 (${originalFilename}):`, err);
        stream.destroy(err);
      });
      stream.on('close', () => {
        try { jsonlGzStream.destroy(); } catch (_) { }
        try { gunzip.destroy(); } catch (_) { }
        try { rl?.close(); } catch (_) { }
      });

      const input = jsonlGzStream.pipe(gunzip);
      input.setEncoding('utf8');
      rl = readline.createInterface({ input, crlfDelay: Infinity });

      let outBuf = '';
      const FLUSH_THRESHOLD = 64 * 1024;
      for await (const line of rl) {
        if (!line || !String(line).trim()) continue;
        let rowObj;
        try {
          rowObj = JSON.parse(line);
        } catch (parseErr) {
          console.warn(`解析 JSONL 行失败 (${originalFilename}):`, parseErr.message);
          continue;
        }

        const row = fieldnames.map((key) => {
          const value = rowObj[key];
          if (value === undefined || value === null) return '';
          const str = String(value);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
          }
          return str;
        }).join(',');

        outBuf += row + '\n';
        if (outBuf.length >= FLUSH_THRESHOLD) {
          await writeOrDrain(stream, outBuf);
          outBuf = '';
        }
      }

      if (outBuf) await writeOrDrain(stream, outBuf);
      stream.end();
    } catch (err) {
      console.error(`生成CSV流失败 (${originalFilename}):`, err);
      stream.destroy(err);
    } finally {
      try { rl?.close(); } catch (_) { }
      try { gunzip.destroy(); } catch (_) { }
      try { jsonlGzStream.destroy(); } catch (_) { }
    }
  })();

  return stream;
}

// 获取文件路径（从数据库记录或临时目录）
// 注意：OSS 场景优先使用 getOssStream 进行流式处理，此函数保留用于 local 或 fallback
async function getFilePathFromRecord(fileId, format = 'raw') {
  const id = Number(fileId);
  if (Number.isFinite(id) && id > 0) {
    const row = await MotionDataFile.findByPk(id);
    if (!row) {
      throw new Error(`文件记录不存在: ${id}`);
    }
    if (String(row.status || '') !== 'completed') {
      throw new Error(`文件状态不正确: ${row.status}`);
    }

    const storage = String(row.storage || motionStorage.STORAGE || 'oss').toLowerCase();
    const objectKey = format === 'parsed' ? row.parsed_object_key : row.raw_object_key;

    if (!objectKey) {
      throw new Error(`${format === 'parsed' ? '解析' : '原始'}文件不存在（object_key为空）`);
    }

    if (storage === 'local') {
      // 本地存储：从 object_key 解析出本地路径
      const localPath = path.join(motionStorage.LOCAL_DIR, objectKey);
      if (!fs.existsSync(localPath)) {
        throw new Error(`本地文件不存在: ${localPath}`);
      }
      return localPath;
    } else {
      // OSS 存储：下载到临时目录（fallback 场景，流式处理优先）
      const client = await motionStorage.getOssClient();
      if (!client) {
        throw new Error('OSS client not available');
      }
      const tmpDir = path.resolve(__dirname, '../../uploads/temp/motion-data-download');
      fs.mkdirSync(tmpDir, { recursive: true });
      const ext = format === 'parsed' ? '.jsonl.gz' : '.bin';
      const tmpName = `${format}_${row.id}_${row.revision}${ext}`;
      const tmpPath = path.join(tmpDir, tmpName);
      await client.get(String(objectKey).replace(/^\//, ''), tmpPath);
      return tmpPath;
    }
  } else {
    // 旧流程：直接从临时目录读
    return getUploadedFilePathById(String(fileId));
  }
}

// 处理批量打包下载任务
async function processBatchDownload(job) {
  const { fileIds, userId, format = 'csv' } = job.data; // format: 'csv' | 'jsonl'
  
  console.log(`[MotionData处理器] 开始处理批量打包下载任务 ${job.id}, 文件数: ${fileIds.length}, 格式: ${format}`);
  
  const tmpFiles = []; // 记录临时文件，用于清理
  
  try {
    await job.progress(5);
    
    const errors = [];
    const successFiles = [];
    
    // 创建ZIP文件路径
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const formatExt = format === 'csv' ? 'csv' : 'jsonl';
    const zipFileName = `motion_data_batch_${job.id}_${timestamp}.zip`;
    const zipFilePath = path.join(MOTION_DATA_RESULT_DIR, zipFileName);
    
    await job.progress(10);
    
    // 创建ZIP归档
    // CSV 生成/压缩很耗时，zip 压缩等级越高越慢；这里优先速度（zip 体积会变大）
    const zipCompressionLevel = format === 'csv' ? 1 : 6;
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipFilePath);
      const archive = archiver('zip', {
        zlib: { level: zipCompressionLevel }
      });
      
      output.on('close', async () => {
        try {
          // 清理临时文件
          for (const tmpFile of tmpFiles) {
            safeUnlink(tmpFile);
          }
          
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
              // 从数据库记录获取文件信息
              const row = await MotionDataFile.findByPk(Number(fileId));
              if (!row) {
                throw new Error(`文件记录不存在: ${fileId}`);
              }
              
              // 检查文件状态：仅完成状态的文件可以下载
              if (String(row.status || '') !== 'completed') {
                throw new Error(`文件状态不允许下载: ${row.status}，仅完成状态的文件可以下载`);
              }
              
              const originalName = String(row.original_name || `motion-${fileId}.bin`);
              const baseName = originalName.replace(/\.bin$/i, '');
              const storage = String(row.storage || motionStorage.STORAGE || 'oss').toLowerCase();
              
              if (format === 'csv') {
                // CSV 格式：优先从 JSONL.gz 转换，如果不存在则从 bin 解析
                let csvStream;
                let filePath;
                
                if (storage === 'oss' && row.parsed_object_key) {
                  // OSS 场景：流式处理，不落 tmp
                  try {
                    const jsonlStream = await getOssStream(row.parsed_object_key);
                    csvStream = generateCsvStreamFromJsonlStream(jsonlStream, originalName);
                    console.log(`[流式处理] OSS JSONL -> CSV: ${fileId}`);
                  } catch (ossErr) {
                    // OSS 流式失败，fallback 到本地处理
                    console.log(`OSS 流式处理失败，fallback 到本地: ${fileId}`, ossErr.message);
                    filePath = await getFilePathFromRecord(fileId, 'parsed');
                    csvStream = generateCsvStreamFromJsonl(filePath, originalName);
                    if (filePath.includes('motion-data-download')) {
                      tmpFiles.push(filePath);
                    }
                  }
                } else if (storage === 'oss' && row.raw_object_key) {
                  // OSS 场景但无 parsed，从 raw 解析（需要 fallback 到本地，因为 bin 解析需要随机访问）
                  console.log(`JSONL 文件不存在，从 bin 文件解析: ${fileId}`);
                  filePath = await getFilePathFromRecord(fileId, 'raw');
                  csvStream = generateCsvStream(filePath, originalName);
                  if (filePath.includes('motion-data-download')) {
                    tmpFiles.push(filePath);
                  }
                } else {
                  // Local 场景：使用文件路径
                  try {
                    filePath = await getFilePathFromRecord(fileId, 'parsed');
                    csvStream = generateCsvStreamFromJsonl(filePath, originalName);
                  } catch (jsonlErr) {
                    console.log(`JSONL 文件不存在，从 bin 文件解析: ${fileId}`);
                    filePath = await getFilePathFromRecord(fileId, 'raw');
                    csvStream = generateCsvStream(filePath, originalName);
                  }
                }
                
                const csvFileName = `${baseName}.csv`;
                archive.append(csvStream, { name: csvFileName });
                successFiles.push({ id: fileId, filename: csvFileName });
              } else {
                // JSONL 格式：直接打包解析后的文件
                if (storage === 'oss' && row.parsed_object_key) {
                  // OSS 场景：流式处理，使用 store 模式避免二次压缩
                  try {
                    const jsonlStream = await getOssStream(row.parsed_object_key);
                    const jsonlFileName = `${baseName}.jsonl.gz`;
                    archive.append(jsonlStream, { name: jsonlFileName, store: true });
                    console.log(`[流式处理] OSS JSONL (store模式): ${fileId}`);
                    successFiles.push({ id: fileId, filename: jsonlFileName });
                  } catch (ossErr) {
                    // OSS 流式失败，fallback 到本地处理
                    console.log(`OSS 流式处理失败，fallback 到本地: ${fileId}`, ossErr.message);
                    filePath = await getFilePathFromRecord(fileId, 'parsed');
                    const jsonlFileName = `${baseName}.jsonl.gz`;
                    archive.file(filePath, { name: jsonlFileName, store: true });
                    if (filePath.includes('motion-data-download')) {
                      tmpFiles.push(filePath);
                    }
                    successFiles.push({ id: fileId, filename: jsonlFileName });
                  }
                } else {
                  // Local 场景：使用文件路径
                  const filePath = await getFilePathFromRecord(fileId, 'parsed');
                  const jsonlFileName = `${baseName}.jsonl.gz`;
                  archive.file(filePath, { name: jsonlFileName, store: true });
                  successFiles.push({ id: fileId, filename: jsonlFileName });
                }
              }
              
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
    // 清理临时文件
    for (const tmpFile of tmpFiles) {
      safeUnlink(tmpFile);
    }
    console.error(`[MotionData处理器] 批量打包下载任务 ${job.id} 失败:`, error);
    throw error;
  }
}

module.exports = {
  processBatchUpload,
  processBatchDownload,
  generateCsvStream,
  generateCsvStreamFromJsonl,
  generateCsvStreamFromJsonlStream,
  getFilePathFromRecord,
  getOssStream
};
