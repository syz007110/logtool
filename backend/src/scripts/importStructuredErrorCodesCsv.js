const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { sequelize } = require('../models');
const ErrorCode = require('../models/error_code');
const DeviceSeriesDict = require('../models/device_series_dict');

const REQUIRED_HEADERS = [
  'series_id',
  'subsystem',
  'code',
  'is_axis_error',
  'is_arm_error',
  'solution',
  'for_expert',
  'for_novice',
  'related_log',
  'level',
  'category'
];

function normalizeCode(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  return raw.startsWith('0X') ? raw : `0X${raw.replace(/^0X/i, '')}`;
}

function parsePositiveInt(value, fieldName) {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error(`${fieldName} 必须为正整数`);
  }
  return num;
}

function parseRequiredText(value, fieldName) {
  const text = String(value || '').trim();
  if (!text) {
    throw new Error(`${fieldName} 不能为空`);
  }
  return text;
}

function parseBool(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return false;
  return ['1', 'true', '1.0', 'yes', 'on'].includes(raw);
}

function normalizeNullableText(value) {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function normalizeErrorCodeCsvRow(row) {
  const series_id = parsePositiveInt(row.series_id, 'series_id');
  const subsystem = parseRequiredText(row.subsystem, 'subsystem');
  const code = normalizeCode(parseRequiredText(row.code, 'code'));

  return {
    series_id,
    subsystem,
    code,
    is_axis_error: parseBool(row.is_axis_error),
    is_arm_error: parseBool(row.is_arm_error),
    solution: normalizeNullableText(row.solution) || 'tips',
    for_expert: parseBool(row.for_expert),
    for_novice: parseBool(row.for_novice),
    related_log: parseBool(row.related_log),
    level: normalizeNullableText(row.level) || 'none',
    category: normalizeNullableText(row.category)
  };
}

async function assertSeriesExists(seriesId) {
  const series = await DeviceSeriesDict.findByPk(seriesId);
  if (!series) {
    throw new Error(`series_id 无效: ${seriesId}`);
  }
}

async function readCsvRows(csvFilePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    let headerValidated = false;

    fs.createReadStream(csvFilePath, { encoding: 'utf8' })
      .pipe(csv())
      .on('headers', (headers) => {
        const normalized = (headers || []).map((item) => String(item || '').trim());
        const missing = REQUIRED_HEADERS.filter((header) => !normalized.includes(header));
        if (missing.length > 0) {
          reject(new Error(`CSV 缺少列: ${missing.join(', ')}`));
          return;
        }
        headerValidated = true;
      })
      .on('data', (row) => {
        rows.push(row);
      })
      .on('end', () => {
        if (!headerValidated) {
          reject(new Error('CSV 表头读取失败'));
          return;
        }
        resolve(rows);
      })
      .on('error', reject);
  });
}

async function importStructuredErrorCodesCsv(csvFilePath) {
  await sequelize.authenticate();
  const rawRows = await readCsvRows(csvFilePath);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];
  const validatedSeriesIds = new Set();

  for (let index = 0; index < rawRows.length; index += 1) {
    const rawRow = rawRows[index];
    const line = index + 2;

    try {
      const row = normalizeErrorCodeCsvRow(rawRow);

      if (!validatedSeriesIds.has(row.series_id)) {
        await assertSeriesExists(row.series_id);
        validatedSeriesIds.add(row.series_id);
      }

      const existing = await ErrorCode.findOne({
        where: {
          series_id: row.series_id,
          subsystem: row.subsystem,
          code: row.code
        }
      });

      if (existing) {
        await existing.update(row);
        updated += 1;
      } else {
        await ErrorCode.create(row);
        created += 1;
      }
    } catch (error) {
      skipped += 1;
      errors.push({
        line,
        error: error.message
      });
    }
  }

  return { created, updated, skipped, errors };
}

async function main() {
  const [, , csvFileArg] = process.argv;
  if (!csvFileArg) {
    console.error('用法: node backend/src/scripts/importStructuredErrorCodesCsv.js <csvFilePath>');
    process.exit(1);
  }

  const csvFilePath = path.resolve(csvFileArg);

  try {
    const summary = await importStructuredErrorCodesCsv(csvFilePath);
    console.log('✅ error_codes 导入完成');
    console.log(`- created: ${summary.created}`);
    console.log(`- updated: ${summary.updated}`);
    console.log(`- skipped: ${summary.skipped}`);
    if (summary.errors.length > 0) {
      console.log('- errors:');
      summary.errors.slice(0, 20).forEach((item) => {
        console.log(`  line ${item.line}: ${item.error}`);
      });
      if (summary.errors.length > 20) {
        console.log(`  ... 其余 ${summary.errors.length - 20} 条省略`);
      }
    }
  } catch (error) {
    console.error('❌ error_codes 导入失败:', error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  REQUIRED_HEADERS,
  normalizeErrorCodeCsvRow,
  importStructuredErrorCodesCsv
};
