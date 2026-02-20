const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');
const archiver = require('archiver');
const { PassThrough } = require('stream');
const { Op } = require('sequelize');
const { sequelize } = require('../models');
const { normalizePagination, MAX_PAGE_SIZE } = require('../constants/pagination');
const { motionDataQueue } = require('../config/queue');
const websocketService = require('../services/websocketService');
const { logOperation } = require('../utils/operationLogger');
const MotionDataFile = require('../models/motion_data_file');
const motionStorage = require('../config/motionDataStorage');

// Binary layout constants (must match example/dataDecode.py MotionData)
const ENTRY_SIZE_BYTES = 924; // 8 + (207*4) + 4 + 4 + 8 + 8 + (16*4)

const UPLOAD_TEMP_DIR = path.resolve(__dirname, '../../uploads/temp');
const CONFIG_DIR = path.resolve(__dirname, '../config');
const MOTION_FORMAT_PATH = path.join(CONFIG_DIR, 'motionFormat.json');
const MOTION_FORMAT_CLASSIFIED_PATH = path.join(CONFIG_DIR, 'motionFormatClassified.json');
const DH_MODEL_PATH = path.join(CONFIG_DIR, 'dhModel.json');

function safeFilename(name, fallback = 'file') {
  const base = path.basename(String(name || '').trim() || fallback);
  return base.replace(/[\r\n"]/g, '_');
}

function parseFileTimeToken(originalName) {
  const m = String(originalName || '').match(/^(\d{12})\.bin$/i);
  return m ? m[1] : null;
}

function parseFileTimeFromToken(fileTimeToken) {
  const token = String(fileTimeToken || '').trim();
  if (!/^\d{12}$/.test(token)) return null;
  const year = Number(token.slice(0, 4));
  const month = Number(token.slice(4, 6));
  const day = Number(token.slice(6, 8));
  const hour = Number(token.slice(8, 10));
  const minute = Number(token.slice(10, 12));
  if ([year, month, day, hour, minute].some((n) => Number.isNaN(n))) return null;
  const dt = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

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

/** ulint_data (17 位 YYYYMMDDhhmmssxxx) 转 epoch 毫秒，与前端 toEpochMs 一致（本地时间） */
function ulintToEpochMs(ulintStr) {
  const str = String(ulintStr || '').trim();
  if (!/^\d{17}$/.test(str)) return NaN;
  const year = parseInt(str.slice(0, 4), 10);
  const month = parseInt(str.slice(4, 6), 10) - 1;
  const day = parseInt(str.slice(6, 8), 10);
  const hour = parseInt(str.slice(8, 10), 10);
  const minute = parseInt(str.slice(10, 12), 10);
  const second = parseInt(str.slice(12, 14), 10);
  const ms = parseInt(str.slice(14, 17), 10);
  const d = new Date(year, month, day, hour, minute, second, ms);
  return Number.isFinite(d.getTime()) ? d.getTime() : NaN;
}

/** 均匀降采样：保留首尾与中间均匀分布的 maxPoints 个点 */
function downsampleRows(rows, maxPoints) {
  if (!Array.isArray(rows) || rows.length <= maxPoints || maxPoints < 2) return rows;
  const result = [];
  const step = (rows.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    const idx = i === maxPoints - 1 ? rows.length - 1 : Math.round(i * step);
    result.push(rows[idx]);
  }
  return result;
}

/** GET /files/:id/series?start_ms=&end_ms=&max_points= — 按时间范围取解析数据并降采样 */
async function getSeriesByTimeRange(req, res) {
  try {
    const id = req.params.id;
    const asNum = Number(id);
    if (!Number.isFinite(asNum) || asNum <= 0) {
      return res.status(400).json({ message: '无效的文件 ID' });
    }

    const startMs = Number(req.query.start_ms);
    const endMs = Number(req.query.end_ms);
    const maxPoints = Math.min(Math.max(Number(req.query.max_points) || 2000, 100), 5000);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
      return res.status(400).json({ message: '请提供有效的 start_ms 与 end_ms' });
    }

    const row = await MotionDataFile.findByPk(asNum);
    if (!row) return res.status(404).json({ message: '文件不存在' });
    if (String(row.status || '').trim() !== 'completed') {
      return res.status(400).json({ message: '只能查询状态为完成的运行数据文件' });
    }
    if (!row.parsed_object_key) {
      return res.status(400).json({ message: '解析文件不存在，无法按时间范围查询' });
    }

    const storage = String(row.storage || motionStorage.STORAGE || 'oss').toLowerCase();
    let filePath = '';

    if (storage === 'local') {
      filePath = path.join(motionStorage.LOCAL_DIR, row.parsed_object_key);
      if (!fs.existsSync(filePath)) return res.status(404).json({ message: '解析文件不存在' });
    } else {
      const client = await motionStorage.getOssClient();
      if (!client) return res.status(500).json({ message: 'OSS client not available' });
      const tmpDir = path.resolve(__dirname, '../../uploads/temp/motion-data-series');
      fs.mkdirSync(tmpDir, { recursive: true });
      filePath = path.join(tmpDir, `series_${row.id}_${row.revision}.jsonl.gz`);
      await client.get(String(row.parsed_object_key).replace(/^\//, ''), filePath);
    }

    const rows = [];
    const gunzip = zlib.createGunzip();
    const rs = fs.createReadStream(filePath);
    const rl = readline.createInterface({ input: rs.pipe(gunzip), crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line || !String(line).trim()) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch (_) {
        continue;
      }
      const ts = ulintToEpochMs(entry.ulint_data);
      if (!Number.isFinite(ts) || ts < startMs || ts > endMs) continue;
      rows.push(entry);
    }

    const downsampled = downsampleRows(rows, maxPoints);
    res.json({ rows: downsampled });

    try {
      if (filePath && filePath.includes('motion-data-series') && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (_) { }
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ message: err.message || '查询失败' });
  }
}

// POST /upload (multer handles file)
async function uploadBinary(req, res) {
  try {
    const deviceId = String(req.body?.device_id || req.body?.deviceId || '').trim();
    if (!deviceId) {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (_) { }
      }
      return res.status(400).json({ message: 'device_id 为必填' });
    }
    if (!req.file) {
      return res.status(400).json({ message: '缺少文件' });
    }

    const originalName = String(req.file.originalname || '');
    const sizeBytes = Number(req.file.size || 0);
    const fileTimeToken = parseFileTimeToken(originalName);
    const fileTime = parseFileTimeFromToken(fileTimeToken);

    // upsert (same-name overwrite per device)
    const existed = await MotionDataFile.findOne({ where: { device_id: deviceId, original_name: originalName } });
    let row;
    if (existed) {
      const nextRev = Number(existed.revision || 1) + 1;
      await existed.update({
        revision: nextRev,
        uploader_id: req.user ? req.user.id : null,
        status: 'uploading',
        error_message: null,
        upload_time: new Date(),
        parse_time: null,
        size_bytes: sizeBytes,
        file_time_token: fileTimeToken,
        file_time: fileTime,
        storage: 'oss',
        raw_object_key: motionStorage.buildRawObjectKey(deviceId, originalName),
        parsed_object_key: motionStorage.buildParsedObjectKey(deviceId, originalName),
        total_frames: null,
        ts_first: null,
        ts_last: null,
        sha256: null,
        etag: null
      });
      row = existed;
    } else {
      row = await MotionDataFile.create({
        device_id: deviceId,
        uploader_id: req.user ? req.user.id : null,
        task_id: null,
        original_name: originalName,
        file_time_token: fileTimeToken,
        file_time: fileTime,
        size_bytes: sizeBytes,
        revision: 1,
        storage: 'oss',
        raw_object_key: motionStorage.buildRawObjectKey(deviceId, originalName),
        parsed_object_key: motionStorage.buildParsedObjectKey(deviceId, originalName),
        entry_size_bytes: ENTRY_SIZE_BYTES,
        sample_rate_hz: 100,
        status: 'uploading',
        error_message: null,
        upload_time: new Date(),
        parse_time: null
      });
    }

    // enqueue single-file job (reuse batch-upload for compatibility)
    const job = await motionDataQueue.add('batch-upload', {
      type: 'batch-upload',
      files: [{
        recordId: row.id,
        revision: row.revision,
        id: req.file.filename,
        path: req.file.path,
        originalName,
        size: sizeBytes,
        deviceId,
        rawObjectKey: row.raw_object_key,
        parsedObjectKey: row.parsed_object_key
      }],
      userId: req.user ? req.user.id : null
    }, { priority: 10, attempts: 1 });

    await row.update({ task_id: String(job.id), status: 'uploading' });

    try {
      websocketService.pushMotionDataTaskStatus(job.id, 'waiting', 0, req.user ? req.user.id : null);
    } catch (_) { }

    return res.json({
      taskId: job.id,
      status: 'waiting',
      file: {
        id: row.id,
        device_id: deviceId,
        filename: originalName,
        size: sizeBytes,
        recordRevision: row.revision
      }
    });
  } catch (err) {
    console.error('上传二进制失败:', err);
    res.status(500).json({ message: '上传失败', error: err.message });
  }
}

// POST /batch-upload (multer handles multiple files, max 20)
async function batchUploadBinary(req, res) {
  try {
    const deviceId = String(req.body?.device_id || req.body?.deviceId || '').trim();
    if (!deviceId) {
      // 清理已上传的临时文件
      if (req.files && req.files.length > 0) {
        req.files.forEach((f) => {
          try { if (f?.path && fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch (_) { }
        });
      }
      return res.status(400).json({ message: 'device_id 为必填' });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: '缺少文件' });
    }

    if (req.files.length > 5) {
      return res.status(400).json({ message: '最多只能上传5个文件' });
    }

    const userId = req.user ? req.user.id : null;

    // upsert 元数据记录（同名覆盖）
    const records = [];
    for (const file of req.files) {
      const originalName = String(file.originalname || '');
      const sizeBytes = Number(file.size || 0);
      const fileTimeToken = parseFileTimeToken(originalName);
      const fileTime = parseFileTimeFromToken(fileTimeToken);

      const existed = await MotionDataFile.findOne({ where: { device_id: deviceId, original_name: originalName } });
      let row;
      if (existed) {
        const nextRev = Number(existed.revision || 1) + 1;
        await existed.update({
          revision: nextRev,
          uploader_id: userId,
          status: 'uploading',
          error_message: null,
          upload_time: new Date(),
          parse_time: null,
          size_bytes: sizeBytes,
          file_time_token: fileTimeToken,
          file_time: fileTime,
          storage: 'oss',
          raw_object_key: motionStorage.buildRawObjectKey(deviceId, originalName),
          parsed_object_key: motionStorage.buildParsedObjectKey(deviceId, originalName),
          total_frames: null,
          ts_first: null,
          ts_last: null,
          sha256: null,
          etag: null
        });
        row = existed;
      } else {
        row = await MotionDataFile.create({
          device_id: deviceId,
          uploader_id: userId,
          task_id: null,
          original_name: originalName,
          file_time_token: fileTimeToken,
          file_time: fileTime,
          size_bytes: sizeBytes,
          revision: 1,
          storage: 'oss',
          raw_object_key: motionStorage.buildRawObjectKey(deviceId, originalName),
          parsed_object_key: motionStorage.buildParsedObjectKey(deviceId, originalName),
          entry_size_bytes: ENTRY_SIZE_BYTES,
          sample_rate_hz: 100,
          status: 'uploading',
          error_message: null,
          upload_time: new Date(),
          parse_time: null
        });
      }
      records.push({ row, file });
    }

    // 准备文件信息（文件已由 multer 保存到临时目录）
    const files = records.map(({ row, file }) => ({
      recordId: row.id,
      revision: row.revision,
      id: file.filename,
      path: file.path,
      originalName: String(file.originalname || ''),
      size: Number(file.size || 0),
      deviceId,
      rawObjectKey: row.raw_object_key,
      parsedObjectKey: row.parsed_object_key
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

    // 绑定 task_id（用于列表追踪）
    try {
      await MotionDataFile.update(
        { task_id: String(job.id), status: 'uploading' },
        { where: { id: { [Op.in]: files.map((f) => f.recordId) } } }
      );
    } catch (_) { }

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
        description: `上传 ${files.length} 个运行数据文件（device_id=${deviceId}）`,
        user_id: userId,
        username: req.user?.username || '',
        status: 'pending',
        ip: req.ip || req.connection?.remoteAddress || '',
        user_agent: req.headers['user-agent'] || '',
        details: {
          taskId: job.id,
          fileCount: files.length,
          device_id: deviceId,
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
        id: f.recordId, // 元数据记录ID
        recordRevision: f.revision,
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
    res.json({ success: true, columns: cfg });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// GET /config/classified - 获取分类结构
async function getMotionFormatClassified(req, res) {
  try {
    if (!fs.existsSync(MOTION_FORMAT_CLASSIFIED_PATH)) {
      return res.status(404).json({
        success: false,
        message: `Motion format classified config file not found: ${MOTION_FORMAT_CLASSIFIED_PATH}`
      });
    }
    const json = fs.readFileSync(MOTION_FORMAT_CLASSIFIED_PATH, 'utf-8');
    const classified = JSON.parse(json);
    res.json({ success: true, data: classified });
  } catch (err) {
    console.error('getMotionFormatClassified error:', err);
    res.status(500).json({
      success: false,
      message: `Failed to read motion format classified config: ${err.message}`,
      error: String(err?.message || err)
    });
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
    // 兼容：id 既可能是旧的“临时文件名”，也可能是新表的 recordId
    const offset = Number(req.query.offset || 0);
    const limit = Math.min(Number(req.query.limit || 500), 5000);
    let filePath = '';

    // 优先按 recordId 查表（新流程）
    const asNum = Number(id);
    if (Number.isFinite(asNum) && asNum > 0) {
      const row = await MotionDataFile.findByPk(asNum);
      if (!row) {
        return res.status(404).json({ message: '文件不存在' });
      }
      if (String(row.status || '').trim() !== 'completed') {
        return res.status(400).json({ message: '只能预览状态为完成的运行数据文件' });
      }
      const storage = String(row.storage || motionStorage.STORAGE || 'oss').toLowerCase();

      if (storage === 'local' && row.raw_object_key) {
        // 本地存储：直接从本地路径读取
        filePath = path.join(motionStorage.LOCAL_DIR, row.raw_object_key);
        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ message: '本地文件不存在' });
        }
      } else if (storage === 'oss' && row.raw_object_key) {
        // OSS 存储：下载到临时目录
        const client = await motionStorage.getOssClient();
        if (!client) {
          return res.status(500).json({ message: 'OSS client not available' });
        }
        const tmpDir = path.resolve(__dirname, '../../uploads/temp/motion-data-preview');
        fs.mkdirSync(tmpDir, { recursive: true });
        const tmpName = `raw_${row.id}_${row.revision}.bin`;
        const tmpPath = path.join(tmpDir, tmpName);
        await client.get(String(row.raw_object_key).replace(/^\//, ''), tmpPath);
        filePath = tmpPath;
      } else {
        // fallback: 旧流程临时文件
        filePath = getUploadedFilePathById(String(id));
      }
    } else {
      // 旧流程：直接从临时目录读
      filePath = getUploadedFilePathById(id);
    }

    const { rows, totalEntries } = parseFile(filePath, { offset, limit });
    res.json({ rows, totalEntries, offset, limit });

    // best-effort 清理临时下载文件
    try {
      if (filePath && filePath.includes('motion-data-preview') && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (_) { }
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

// POST /batch-download - 批量下载（支持 CSV 和 JSONL 格式）
async function batchDownload(req, res) {
  const { fileIds, format = 'csv' } = req.body; // format: 'csv' | 'jsonl'

  if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
    return res.status(400).json({ message: '缺少文件ID列表' });
  }

  if (fileIds.length > 20) {
    return res.status(400).json({ message: '最多只能处理20个文件' });
  }

  if (format !== 'csv' && format !== 'jsonl') {
    return res.status(400).json({ message: '格式参数无效，必须是 csv 或 jsonl' });
  }

  try {
    const userId = req.user ? req.user.id : null;

    // 创建队列任务
    // 注意：不要设置 removeOnComplete/removeOnFail 为 true，否则任务完成后立即删除，
    // 前端查询时会提示"任务不存在或已过期"。使用队列默认配置保留最近的任务。
    const job = await motionDataQueue.add('batch-download', {
      type: 'batch-download',
      fileIds,
      userId,
      format
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
      const formatName = format === 'csv' ? 'CSV' : 'JSONL';
      await logOperation({
        operation: '数据回放-批量打包下载',
        description: `打包下载 ${fileIds.length} 个运动数据文件为${formatName}`,
        user_id: userId,
        username: req.user?.username || '',
        status: 'pending',
        ip: req.ip || req.connection?.remoteAddress || '',
        user_agent: req.headers['user-agent'] || '',
        details: {
          taskId: job.id,
          fileCount: fileIds.length,
          fileIds: fileIds,
          format: format
        }
      });
    } catch (logError) {
      console.warn('操作日志记录失败（已忽略）:', logError.message);
    }

    // 立即返回任务ID
    return res.json({
      taskId: job.id,
      status: 'waiting',
      fileCount: fileIds.length,
      format: format
    });
  } catch (err) {
    console.error('批量下载失败:', err);
    res.status(500).json({ message: '创建下载任务失败', error: err.message });
  }
}

// POST /batch-download-csv (保持向后兼容)
async function batchDownloadCsv(req, res) {
  req.body.format = 'csv';
  return batchDownload(req, res);
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

// GET /tasks/active - 获取全局进行中任务（所有登录用户一致）
async function getGlobalActiveTasks(req, res) {
  try {
    const [waitingJobs, activeJobs] = await Promise.all([
      motionDataQueue.getWaiting(0, 200),
      motionDataQueue.getActive(0, 200)
    ]);

    const jobs = [...waitingJobs, ...activeJobs];
    const tasks = await Promise.all(jobs.map(async (job) => {
      const state = await job.getState();
      const progress = await job.progress();
      return {
        id: job.id,
        type: job.data?.type || 'unknown',
        status: state,
        progress: Number.isFinite(Number(progress)) ? Number(progress) : 0,
        createdAt: job.timestamp,
        data: {
          format: job.data?.format || null,
          fileCount: Array.isArray(job.data?.files)
            ? job.data.files.length
            : (Array.isArray(job.data?.fileIds) ? job.data.fileIds.length : null)
        }
      };
    }));

    tasks.sort((a, b) => b.createdAt - a.createdAt);
    return res.json({ success: true, data: tasks });
  } catch (error) {
    console.error('获取全局运行数据活跃任务失败:', error);
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

async function listMotionDataFiles(req, res) {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const offset = (page - 1) * limit;

    const where = {};
    const deviceId = String(req.query.device_id || req.query.deviceId || '').trim();
    const status = String(req.query.status || '').trim();
    const statusFilter = String(req.query.status_filter || req.query.statusFilter || '').trim().toLowerCase();
    if (deviceId) where.device_id = deviceId;
    if (status) {
      where.status = status;
    } else if (statusFilter === 'completed') {
      where.status = 'completed';
    } else if (statusFilter === 'incomplete') {
      where.status = { [Op.ne]: 'completed' };
    }

    const fileTimeStart =
      req.query.file_time_start ||
      req.query.fileTimeStart ||
      req.query.upload_time_start ||
      req.query.uploadTimeStart;
    const fileTimeEnd =
      req.query.file_time_end ||
      req.query.fileTimeEnd ||
      req.query.upload_time_end ||
      req.query.uploadTimeEnd;
    let hasTimeRange = false;
    const fileTimeRange = {};
    if (fileTimeStart) {
      const start = new Date(fileTimeStart);
      if (!Number.isNaN(start.getTime())) { fileTimeRange[Op.gte] = start; hasTimeRange = true; }
    }
    if (fileTimeEnd) {
      const end = new Date(fileTimeEnd);
      if (!Number.isNaN(end.getTime())) { fileTimeRange[Op.lte] = end; hasTimeRange = true; }
    }
    if (hasTimeRange) where.file_time = fileTimeRange;

    const { rows, count } = await MotionDataFile.findAndCountAll({
      where,
      order: [['file_time', 'DESC'], ['upload_time', 'DESC']],
      limit,
      offset
    });

    const items = (rows || []).map((r) => {
      const d = r.toJSON ? r.toJSON() : r;
      return {
        id: d.id,
        device_id: d.device_id,
        original_name: d.original_name,
        file_time_token: d.file_time_token,
        file_time: d.file_time,
        upload_time: d.upload_time,
        parse_time: d.parse_time,
        status: d.status,
        error_message: d.error_message || null,
        revision: d.revision,
        size_bytes: d.size_bytes,
        total_frames: d.total_frames,
        ts_first: d.ts_first,
        ts_last: d.ts_last
      };
    });

    return res.json({ success: true, data: items, total: count, page, limit });
  } catch (e) {
    return res.status(500).json({ success: false, message: '获取运行数据列表失败', error: String(e?.message || e) });
  }
}

// GET /files/time-filters - 运行数据时间筛选项（年/月/日），按 device_id
async function getMotionDataTimeFilters(req, res) {
  try {
    const deviceId = String(req.query.device_id || req.query.deviceId || '').trim();
    if (!deviceId) {
      return res.status(400).json({ success: false, message: 'device_id is required' });
    }

    const [rows] = await sequelize.query(
      `SELECT DISTINCT
        YEAR(file_time) AS year,
        MONTH(file_time) AS month,
        DAY(file_time) AS day
       FROM motion_data_files
       WHERE device_id = :deviceId AND file_time IS NOT NULL`,
      { replacements: { deviceId } }
    );

    const yearsSet = new Set();
    const monthsMap = new Map();
    const daysMap = new Map();

    (rows || []).forEach(({ year, month, day }) => {
      if (year == null) return;
      const yearStr = String(year).padStart(4, '0');
      yearsSet.add(yearStr);
      if (month != null) {
        const monthStr = String(month).padStart(2, '0');
        if (!monthsMap.has(yearStr)) monthsMap.set(yearStr, new Set());
        monthsMap.get(yearStr).add(monthStr);
        if (day != null) {
          const dayStr = String(day).padStart(2, '0');
          const dayKey = `${yearStr}-${monthStr}`;
          if (!daysMap.has(dayKey)) daysMap.set(dayKey, new Set());
          daysMap.get(dayKey).add(dayStr);
        }
      }
    });

    const years = Array.from(yearsSet).sort((a, b) => Number(b) - Number(a));
    const monthsByYear = {};
    monthsMap.forEach((set, year) => {
      monthsByYear[year] = Array.from(set).sort((a, b) => a.localeCompare(b));
    });
    const daysByYearMonth = {};
    daysMap.forEach((set, key) => {
      daysByYearMonth[key] = Array.from(set).sort((a, b) => a.localeCompare(b));
    });

    return res.json({
      success: true,
      data: { years, monthsByYear, daysByYearMonth }
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      message: '获取运行数据时间筛选项失败',
      error: String(e?.message || e)
    });
  }
}

// GET /files/by-device - 按设备分组的运动数据列表（设备编号、医院名称、数据数量、更新时间）
async function listMotionDataFilesByDevice(req, res) {
  try {
    const { page, limit } = normalizePagination(req.query.page, req.query.limit, MAX_PAGE_SIZE.DEVICE_GROUP);
    const deviceFilter = String(req.query.device_filter || req.query.deviceFilter || '').trim();
    const offset = (page - 1) * limit;

    const sqlConds = [];
    const replacements = { limit, offset };
    if (deviceFilter) {
      sqlConds.push('LOWER(m.device_id) LIKE :deviceLike');
      replacements.deviceLike = `%${deviceFilter.toLowerCase()}%`;
    }
    const whereSql = sqlConds.length ? 'WHERE ' + sqlConds.join(' AND ') : '';

    const countSql = `
      SELECT COUNT(*) AS total FROM (
        SELECT m.device_id
        FROM motion_data_files m
        ${whereSql}
        GROUP BY m.device_id
      ) t
    `;
    const countRows = await sequelize.query(countSql, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });
    const total = Number(countRows?.[0]?.total || 0);
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    const dataSql = `
      SELECT
        m.device_id AS device_id,
        d.hospital AS hospital_name,
        COUNT(*) AS data_count,
        MAX(COALESCE(m.file_time, m.upload_time)) AS latest_upload_time
      FROM motion_data_files m
      LEFT JOIN devices d ON d.device_id = m.device_id
      ${whereSql}
      GROUP BY m.device_id, d.hospital
      ORDER BY latest_upload_time DESC
      LIMIT :limit OFFSET :offset
    `;
    const rows = await sequelize.query(dataSql, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    const device_groups = (rows || []).map((r) => ({
      device_id: r.device_id,
      hospital_name: r.hospital_name || null,
      data_count: Number(r.data_count || 0),
      latest_upload_time: r.latest_upload_time || null
    }));

    return res.json({
      device_groups,
      pagination: {
        current_page: page,
        page_size: limit,
        total,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1
      }
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: '获取按设备分组列表失败', error: String(e?.message || e) });
  }
}

async function streamOssObject(req, res, { objectKey, downloadName }) {
  const client = await motionStorage.getOssClient();
  if (!client) {
    res.status(500).json({ message: 'OSS client not available' });
    return;
  }

  const headers = {};
  if (req.headers.range) headers.Range = req.headers.range;

  const key = String(objectKey || '').replace(/^\//, '');
  const result = await client.getStream(key, { headers });
  const status = result?.res?.status || result?.res?.statusCode || 200;
  const ossHeaders = result?.res?.headers || {};

  const passthrough = [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'last-modified',
    'etag',
    'cache-control'
  ];
  for (const h of passthrough) {
    if (ossHeaders[h]) res.setHeader(h, ossHeaders[h]);
  }

  if (downloadName) {
    const filename = safeFilename(downloadName, 'motion-data');
    res.setHeader('content-disposition', `attachment; filename="${filename}"`);
  }

  res.status(status);
  result.stream.pipe(res);
}

async function streamLocalFile(req, res, { filePath, downloadName }) {
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: '文件不存在' });
  }

  const stats = fs.statSync(filePath);
  const fileSize = stats.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'application/octet-stream',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'application/octet-stream',
    };
    if (downloadName) {
      const filename = safeFilename(downloadName, 'motion-data');
      head['Content-Disposition'] = `attachment; filename="${filename}"`;
    }
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
}

async function downloadMotionDataRaw(req, res) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: 'id 无效' });

  const row = await MotionDataFile.findByPk(id);
  if (!row) return res.status(404).json({ message: '文件不存在' });

  if (String(row.status || '') !== 'completed') {
    return res.status(400).json({ message: '仅完成状态的文件可以下载原文件' });
  }

  const storage = String(row.storage || motionStorage.STORAGE || 'oss').toLowerCase();

  try {
    if (storage === 'local') {
      // 本地存储：从 raw_object_key 解析出本地路径
      if (!row.raw_object_key) return res.status(404).json({ message: '原始文件不存在（raw_object_key为空）' });
      // raw_object_key 在本地模式下存储的是相对路径，如 "device123/raw/202512291543.bin"
      const localPath = path.join(motionStorage.LOCAL_DIR, row.raw_object_key);
      await streamLocalFile(req, res, {
        filePath: localPath,
        downloadName: row.original_name || `motion-data-${id}.bin`
      });
    } else {
      // OSS 存储
      if (!row.raw_object_key) return res.status(404).json({ message: '原始文件不存在（raw_object_key为空）' });
      await streamOssObject(req, res, {
        objectKey: row.raw_object_key,
        downloadName: row.original_name || `motion-data-${id}.bin`
      });
    }
  } catch (e) {
    return res.status(500).json({ message: '下载失败', error: String(e?.message || e) });
  }
}

async function downloadMotionDataParsed(req, res) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: 'id 无效' });

  const format = req.query.format || 'jsonl'; // 默认 JSONL，支持 csv
  if (format !== 'csv' && format !== 'jsonl') {
    return res.status(400).json({ message: '格式参数无效，必须是 csv 或 jsonl' });
  }

  const row = await MotionDataFile.findByPk(id);
  if (!row) return res.status(404).json({ message: '文件不存在' });

  if (String(row.status || '') !== 'completed') {
    return res.status(400).json({ message: '仅完成状态的文件可以下载' });
  }

  const storage = String(row.storage || motionStorage.STORAGE || 'oss').toLowerCase();
  const base = String(row.original_name || `motion-data-${id}.bin`).replace(/\.bin$/i, '');

  try {
    if (format === 'csv') {
      // CSV 格式：优先从 JSONL.gz 转换，如果不存在则从 bin 解析
      const { generateCsvStream, generateCsvStreamFromJsonl } = require('../workers/motionDataProcessor');

      let filePath;
      let csvStream;
      let tmpFile = null;

      try {
        // 尝试从 JSONL.gz 转换（更快）
        if (storage === 'local') {
          if (!row.parsed_object_key) throw new Error('JSONL文件不存在');
          filePath = path.join(motionStorage.LOCAL_DIR, row.parsed_object_key);
          if (!fs.existsSync(filePath)) throw new Error('JSONL文件不存在');
        } else {
          const client = await motionStorage.getOssClient();
          if (!client) throw new Error('OSS client not available');
          if (!row.parsed_object_key) throw new Error('JSONL文件不存在');
          const tmpDir = path.resolve(__dirname, '../../uploads/temp/motion-data-download');
          fs.mkdirSync(tmpDir, { recursive: true });
          filePath = path.join(tmpDir, `parsed_${id}_${row.revision}.jsonl.gz`);
          tmpFile = filePath;
          await client.get(String(row.parsed_object_key).replace(/^\//, ''), filePath);
        }
        csvStream = generateCsvStreamFromJsonl(filePath, row.original_name);
      } catch (jsonlErr) {
        // 如果 JSONL 不存在，从 bin 文件解析
        console.log(`JSONL 文件不存在，从 bin 文件解析: ${id}`);
        if (storage === 'local') {
          if (!row.raw_object_key) throw new Error('原始文件不存在');
          filePath = path.join(motionStorage.LOCAL_DIR, row.raw_object_key);
          if (!fs.existsSync(filePath)) throw new Error('原始文件不存在');
        } else {
          const client = await motionStorage.getOssClient();
          if (!client) throw new Error('OSS client not available');
          if (!row.raw_object_key) throw new Error('原始文件不存在');
          const tmpDir = path.resolve(__dirname, '../../uploads/temp/motion-data-download');
          fs.mkdirSync(tmpDir, { recursive: true });
          filePath = path.join(tmpDir, `raw_${id}_${row.revision}.bin`);
          tmpFile = filePath;
          await client.get(String(row.raw_object_key).replace(/^\//, ''), filePath);
        }
        csvStream = generateCsvStream(filePath, row.original_name);
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      const csvName = safeFilename(`${base}.csv`, `motion-data-${id}.csv`);
      res.setHeader('Content-Disposition', `attachment; filename="${csvName}"`);
      csvStream.pipe(res);

      // 清理临时文件
      if (tmpFile) {
        res.on('finish', () => {
          try {
            if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
          } catch (_) { }
        });
        res.on('error', () => {
          try {
            if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
          } catch (_) { }
        });
      }
    } else {
      // JSONL 格式：直接下载解析后的文件
      if (!row.parsed_object_key) return res.status(404).json({ message: '解析文件不存在（parsed_object_key为空）' });

      if (storage === 'local') {
        // 本地存储：从 parsed_object_key 解析出本地路径
        const localPath = path.join(motionStorage.LOCAL_DIR, row.parsed_object_key);
        await streamLocalFile(req, res, {
          filePath: localPath,
          downloadName: `${base}.jsonl.gz`
        });
      } else {
        // OSS 存储
        await streamOssObject(req, res, {
          objectKey: row.parsed_object_key,
          downloadName: `${base}.jsonl.gz`
        });
      }
    }
  } catch (e) {
    return res.status(500).json({ message: '下载失败', error: String(e?.message || e) });
  }
}

// POST /files/batch-download/raw - 批量下载 raw（ZIP）
async function batchDownloadMotionDataRawZip(req, res) {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : Array.isArray(req.body?.fileIds) ? req.body.fileIds : [];
  const parsed = ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
  const norm = Array.from(new Set(parsed.map((n) => String(n))));
  if (!norm.length) return res.status(400).json({ message: 'ids 不能为空' });
  if (norm.length > 20) return res.status(400).json({ message: '批量下载一次最多20条' });

  try {
    const rows = await MotionDataFile.findAll({ where: { id: { [Op.in]: norm } } });
    const rowMap = new Map(rows.map((r) => [String(r.id), r]));

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const zipName = `motion_raw_${ts}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('[motion-data] batch raw zip error:', err);
      try { res.destroy(err); } catch (_) { }
    });

    res.on('close', () => {
      try {
        if (!res.writableEnded) archive.abort();
      } catch (_) { }
    });

    archive.pipe(res);

    const errors = [];
    const storageMode = motionStorage.STORAGE.toLowerCase();

    for (const id of norm) {
      const row = rowMap.get(id);
      if (!row) {
        errors.push({ id, error: 'not_found' });
        continue;
      }
      if (!row.raw_object_key) {
        errors.push({ id, filename: row.original_name, error: 'raw_object_key_empty' });
        continue;
      }
      if (String(row.status || '') !== 'completed') {
        errors.push({ id, filename: row.original_name, error: `status_not_completed:${row.status}` });
        continue;
      }

      const storage = String(row.storage || storageMode).toLowerCase();
      const name = safeFilename(row.original_name || `motion-${id}.bin`, `motion-${id}.bin`);

      try {
        if (storage === 'local') {
          // 本地存储：从 raw_object_key 解析出本地路径
          const localPath = path.join(motionStorage.LOCAL_DIR, row.raw_object_key);
          if (fs.existsSync(localPath)) {
            archive.file(localPath, { name });
          } else {
            errors.push({ id, filename: row.original_name, error: 'local_file_not_found' });
          }
        } else {
          // OSS 存储
          const client = await motionStorage.getOssClient();
          if (!client) {
            errors.push({ id, filename: row.original_name, error: 'OSS client not available' });
            continue;
          }
          const key = String(row.raw_object_key).replace(/^\//, '');
          const result = await client.getStream(key);
          archive.append(result.stream, { name });
        }
      } catch (e) {
        errors.push({ id, filename: row.original_name, error: String(e?.message || e) });
      }
    }

    if (errors.length > 0) {
      archive.append(JSON.stringify({ message: '部分文件未能打包', errors }, null, 2), { name: 'errors.json' });
    }

    archive.finalize();
  } catch (e) {
    return res.status(500).json({ message: '批量下载失败', error: String(e?.message || e) });
  }
}

async function deleteMotionDataFile(req, res) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: 'id 无效' });

  const row = await MotionDataFile.findByPk(id);
  if (!row) return res.status(404).json({ message: '文件不存在' });

  const allowedStatuses = ['parse_failed', 'completed', 'file_error', 'processing_failed'];
  const currentStatus = String(row.status || '');
  if (!allowedStatuses.includes(currentStatus)) {
    return res.status(400).json({ message: `只有解析失败、完成、文件错误、处理失败状态的文件可以删除，当前状态: ${currentStatus}` });
  }

  try {
    const storage = String(row.storage || motionStorage.STORAGE || 'oss').toLowerCase();

    if (storage === 'local') {
      // 本地存储：删除本地文件
      const paths = [row.raw_object_key, row.parsed_object_key]
        .map((k) => k ? path.join(motionStorage.LOCAL_DIR, String(k)) : null)
        .filter(Boolean);
      for (const p of paths) {
        motionStorage.deleteLocalFile(p);
      }
    } else {
      // OSS 存储
      const client = await motionStorage.getOssClient();
      if (!client) return res.status(500).json({ message: 'OSS client not available' });

      const keys = [row.raw_object_key, row.parsed_object_key]
        .map((k) => String(k || '').replace(/^\//, '').trim())
        .filter(Boolean);
      for (const k of keys) {
        await client.delete(k);
      }
    }

    await row.destroy();
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, message: '删除失败', error: String(e?.message || e) });
  }
}

async function batchDeleteMotionDataFiles(req, res) {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : Array.isArray(req.body?.fileIds) ? req.body.fileIds : [];
  const parsed = ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
  const norm = Array.from(new Set(parsed.map((n) => String(n))));
  if (!norm.length) return res.status(400).json({ message: 'ids 不能为空' });
  if (norm.length > 50) return res.status(400).json({ message: '最多批量删除50条' });

  const rows = await MotionDataFile.findAll({ where: { id: { [Op.in]: norm } } });
  const rowMap = new Map(rows.map((r) => [String(r.id), r]));

  const deleted = [];
  const failed = [];
  const storageMode = motionStorage.STORAGE.toLowerCase();

  for (const id of norm) {
    const row = rowMap.get(id);
    if (!row) {
      failed.push({ id, error: 'not_found' });
      continue;
    }
    const allowedStatuses = ['parse_failed', 'completed', 'file_error', 'processing_failed'];
    const currentStatus = String(row.status || '');
    if (!allowedStatuses.includes(currentStatus)) {
      failed.push({ id, error: `status_not_allowed:${currentStatus}` });
      continue;
    }
    try {
      const storage = String(row.storage || storageMode).toLowerCase();

      if (storage === 'local') {
        // 本地存储：删除本地文件
        const paths = [row.raw_object_key, row.parsed_object_key]
          .map((k) => k ? path.join(motionStorage.LOCAL_DIR, String(k)) : null)
          .filter(Boolean);
        for (const p of paths) {
          motionStorage.deleteLocalFile(p);
        }
      } else {
        // OSS 存储
        const client = await motionStorage.getOssClient();
        if (!client) throw new Error('OSS client not available');
        const keys = [row.raw_object_key, row.parsed_object_key]
          .map((k) => String(k || '').replace(/^\//, '').trim())
          .filter(Boolean);
        for (const k of keys) await client.delete(k);
      }

      await row.destroy();
      deleted.push(id);
    } catch (e) {
      failed.push({ id, error: String(e?.message || e) });
    }
  }

  return res.json({ success: true, deleted, failed });
}

module.exports = {
  uploadBinary,
  batchUploadBinary,
  getMotionFormat,
  getMotionFormatClassified,
  getDhModelConfig,
  previewParsedData,
  getSeriesByTimeRange,
  downloadCsv,
  batchDownloadCsv,
  batchDownload,
  getTaskStatus,
  getUserTasks,
  getGlobalActiveTasks,
  downloadTaskResult,
  listMotionDataFiles,
  listMotionDataFilesByDevice,
  getMotionDataTimeFilters,
  downloadMotionDataRaw,
  downloadMotionDataParsed,
  batchDownloadMotionDataRawZip,
  deleteMotionDataFile,
  batchDeleteMotionDataFiles,
};


