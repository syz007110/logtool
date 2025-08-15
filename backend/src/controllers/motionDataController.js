const fs = require('fs');
const path = require('path');

// Binary layout constants (must match example/dataDecode.py MotionData)
const ENTRY_SIZE_BYTES = 828; // 8 + (183*4) + 4 + 4 + 8 + 8 + (16*4)

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

  // 8..(8 + 183*4): real_data floats
  let base = offset + 8;
  for (let i = 0; i < 183; i += 1) {
    entry[`real_data_${i}`] = buffer.readFloatLE(base + i * 4);
  }

  // next: dint_data int32
  base = offset + 8 + 183 * 4;
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

module.exports = {
  uploadBinary,
  getMotionFormat,
  getDhModelConfig,
  previewParsedData,
  downloadCsv,
};


