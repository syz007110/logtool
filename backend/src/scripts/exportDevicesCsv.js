/**
 * Export devices with all bound keys from device_keys.
 *
 * Columns:
 * - device_id
 * - series_id / series_code / series_name_zh
 * - device_model
 * - key_value
 * - key_source (device_keys)
 * - valid_from_date / valid_to_date / is_default / priority / description
 *
 * One row per key. Devices without keys still export one empty-key row.
 *
 * Usage:
 *   node backend/src/scripts/exportDevicesCsv.js
 *   node backend/src/scripts/exportDevicesCsv.js --out D:\tmp\devices.csv
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Op } = require('sequelize');

const envCandidates = [
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../.env')
];
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

const { sequelize } = require('../models');
const { defineAssociations } = require('../models/associations');
const Device = require('../models/device');
const DeviceKey = require('../models/deviceKey');
const DeviceSeriesDict = require('../models/device_series_dict');

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function parseOutPath(argv) {
  const idx = argv.indexOf('--out');
  if (idx >= 0 && argv[idx + 1]) {
    return path.resolve(argv[idx + 1]);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.resolve(__dirname, '../../../exports');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `devices-with-keys-${stamp}.csv`);
}

async function main() {
  defineAssociations();
  await sequelize.authenticate();

  const seriesRows = await DeviceSeriesDict.findAll({
    attributes: ['id', 'series_code', 'series_name_zh', 'series_name_en']
  });
  const seriesMap = new Map(seriesRows.map((row) => [row.id, row.toJSON()]));

  const devices = await Device.findAll({
    attributes: ['id', 'device_id', 'device_model', 'series_id'],
    order: [['id', 'ASC']]
  });

  const deviceIds = devices.map((d) => d.device_id).filter(Boolean);
  const keyRows = deviceIds.length > 0
    ? await DeviceKey.findAll({
      where: { device_id: { [Op.in]: deviceIds } },
      order: [
        ['device_id', 'ASC'],
        ['valid_from_date', 'ASC'],
        ['priority', 'DESC'],
        ['id', 'ASC']
      ]
    })
    : [];

  const keysByDevice = new Map();
  for (const row of keyRows) {
    const data = row.toJSON();
    const list = keysByDevice.get(data.device_id) || [];
    list.push(data);
    keysByDevice.set(data.device_id, list);
  }

  const headers = [
    'device_id',
    'series_id',
    'series_code',
    'series_name_zh',
    'device_model',
    'key_value',
    'key_source',
    'valid_from_date',
    'valid_to_date',
    'is_default',
    'priority',
    'description'
  ];

  const lines = [headers.join(',')];
  let keyCount = 0;

  for (const item of devices) {
    const d = item.toJSON();
    const series = seriesMap.get(d.series_id) || {};
    const boundKeys = keysByDevice.get(d.device_id) || [];

    const rowsForDevice = boundKeys.map((k) => ({
      key_value: k.key_value,
      key_source: 'device_keys',
      valid_from_date: k.valid_from_date || '',
      valid_to_date: k.valid_to_date || '',
      is_default: k.is_default ? 1 : 0,
      priority: k.priority ?? '',
      description: k.description || ''
    }));

    if (rowsForDevice.length === 0) {
      rowsForDevice.push({
        key_value: '',
        key_source: '',
        valid_from_date: '',
        valid_to_date: '',
        is_default: '',
        priority: '',
        description: '无绑定密钥'
      });
    }

    for (const keyRow of rowsForDevice) {
      keyCount += 1;
      lines.push([
        d.device_id,
        d.series_id,
        series.series_code,
        series.series_name_zh,
        d.device_model,
        keyRow.key_value,
        keyRow.key_source,
        keyRow.valid_from_date,
        keyRow.valid_to_date,
        keyRow.is_default,
        keyRow.priority,
        keyRow.description
      ].map(csvEscape).join(','));
    }
  }

  const outPath = parseOutPath(process.argv);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `\uFEFF${lines.join('\n')}`, 'utf8');
  console.log(`exported ${devices.length} devices / ${keyCount} key rows -> ${outPath}`);
  await sequelize.close();
}

main().catch(async (err) => {
  console.error(err);
  try { await sequelize.close(); } catch (_) { /* ignore */ }
  process.exit(1);
});
