/**
 * 从 CSV 导入设备 + device_keys
 *
 * 期望列（与 exports/1.csv 一致）：
 *   device_id, series_id, series_code, series_name_zh, device_model,
 *   key_value, valid_from_date, valid_to_date
 *
 * 规则：
 * - 设备：按 device_id upsert（写 device_model / series_id，不写 devices.device_key）
 * - 密钥：写入 device_keys；日期自动补到小时（YYYY-MM-DD → YYYY-MM-DD 00:00:00）
 * - 同一设备多行密钥按 valid_from 排序；若前一条结束为空且后一条起始更晚，自动收窄前一条终止到后一条起始
 * - 仍交叉则报错跳过该设备密钥（设备行仍可创建）
 *
 * Usage:
 *   node backend/src/scripts/importDevicesCsv.js --file exports/1.csv --dry-run
 *   node backend/src/scripts/importDevicesCsv.js --file exports/1.csv
 *   node backend/src/scripts/importDevicesCsv.js --file exports/1.csv --ensure-models
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

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
const DeviceModelDict = require('../models/device_model_dict');
const {
  addDeviceKey,
  formatDateTimeHour,
  floorToHour,
  rangesOverlap
} = require('../services/deviceKeyService');

const DEVICE_ID_RE = /^[0-9A-Za-z]+-[0-9A-Za-z]+$/;
const MAC_RE = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;

function parseArgs(argv) {
  const get = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : null;
  };
  return {
    file: get('--file') || path.resolve(__dirname, '../../../exports/1.csv'),
    dryRun: argv.includes('--dry-run'),
    ensureModels: argv.includes('--ensure-models'),
    replaceKeys: argv.includes('--replace-keys')
  };
}

function parseCsv(text) {
  const normalized = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter((l) => l.trim() !== '');
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line, idx) => {
    const cols = splitCsvLine(line);
    const row = { __line: idx + 2 };
    headers.forEach((h, i) => {
      row[h] = (cols[i] ?? '').trim();
    });
    return row;
  });
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function normalizeDateTime(value, { required = false, label = '时间' } = {}) {
  if (value == null || String(value).trim() === '') {
    if (required) throw new Error(`${label}不能为空`);
    return null;
  }
  const raw = String(value).trim().replace('T', ' ');
  // 仅日期 → 当天 00:00:00
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return formatDateTimeHour(`${raw} 00:00:00`);
  }
  return formatDateTimeHour(raw);
}

function prepareDeviceKeyPlan(rows) {
  const byDevice = new Map();
  for (const row of rows) {
    const list = byDevice.get(row.device_id) || [];
    list.push(row);
    byDevice.set(row.device_id, list);
  }

  const plans = [];
  const warnings = [];

  for (const [deviceId, deviceRows] of byDevice.entries()) {
    const first = deviceRows[0];
    const keys = deviceRows
      .filter((r) => (r.key_value || '').trim())
      .map((r) => {
        const from = normalizeDateTime(r.valid_from_date, { required: true, label: 'valid_from_date' });
        const to = normalizeDateTime(r.valid_to_date || '', { required: false });
        return {
          key_value: String(r.key_value).trim(),
          valid_from_date: from,
          valid_to_date: to,
          line: r.__line
        };
      })
      .sort((a, b) => new Date(a.valid_from_date) - new Date(b.valid_from_date));

    // 自动收窄：前一条永久/交叉到下一条起始时，把前一条终止改为下一条起始
    for (let i = 0; i < keys.length - 1; i++) {
      const cur = keys[i];
      const next = keys[i + 1];
      const curFrom = floorToHour(cur.valid_from_date).getTime();
      const nextFrom = floorToHour(next.valid_from_date).getTime();
      if (curFrom === nextFrom) {
        warnings.push(
          `设备 ${deviceId}: 多条密钥起始时间相同（行 ${cur.line}/${next.line}），无法自动消解交叉`
        );
        continue;
      }
      if (cur.valid_to_date == null || rangesOverlap(cur.valid_from_date, cur.valid_to_date, next.valid_from_date, next.valid_to_date)) {
        if (cur.valid_to_date == null || floorToHour(cur.valid_to_date).getTime() > nextFrom) {
          warnings.push(
            `设备 ${deviceId}: 自动收窄密钥 ${cur.key_value} 终止时间为 ${next.valid_from_date}（原行 ${cur.line}）`
          );
          cur.valid_to_date = next.valid_from_date;
        }
      }
    }

    let overlapError = null;
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        if (rangesOverlap(keys[i].valid_from_date, keys[i].valid_to_date, keys[j].valid_from_date, keys[j].valid_to_date)) {
          overlapError = `设备 ${deviceId}: 密钥区间仍交叉（${keys[i].key_value} vs ${keys[j].key_value}）`;
        }
      }
    }

    plans.push({
      device_id: deviceId,
      series_id: Number(first.series_id) || null,
      device_model: String(first.device_model || '').trim(),
      keys,
      overlapError
    });
  }

  return { plans, warnings };
}

async function ensureModel(deviceModel, seriesId, { ensureModels, dryRun }) {
  if (!deviceModel) throw new Error('device_model 为空');
  if (!seriesId) throw new Error('series_id 无效');

  let row = await DeviceModelDict.findOne({
    where: { device_model: deviceModel, series_id: seriesId }
  });
  if (row) return row;

  // 兼容：仅按型号查（历史数据可能未绑系列）
  row = await DeviceModelDict.findOne({ where: { device_model: deviceModel } });
  if (row) {
    if (!row.series_id && ensureModels && !dryRun) {
      await row.update({ series_id: seriesId, updated_at: new Date() });
    }
    return row;
  }

  if (!ensureModels) {
    throw new Error(`设备型号不存在: ${deviceModel}（可用 --ensure-models 自动创建）`);
  }
  if (dryRun) return { device_model: deviceModel, series_id: seriesId, dry: true };

  return DeviceModelDict.create({
    device_model: deviceModel,
    series_id: seriesId,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date()
  });
}

async function upsertDevice(plan, { dryRun }) {
  const existing = await Device.findOne({ where: { device_id: plan.device_id } });
  if (dryRun) {
    return { created: !existing, device: existing };
  }
  const modelRow = await ensureModel(plan.device_model, plan.series_id, { dryRun: false, ensureModels: true });
  if (existing) {
    existing.series_id = modelRow?.series_id ?? plan.series_id ?? existing.series_id;
    if (Object.prototype.hasOwnProperty.call(existing, 'device_model_id')) {
      existing.device_model_id = modelRow?.id ?? existing.device_model_id ?? null;
    }
    existing.updated_at = new Date();
    await existing.save();
    return { created: false, device: existing };
  }
  const device = await Device.create({
    device_id: plan.device_id,
    series_id: modelRow?.series_id ?? plan.series_id,
    device_model_id: modelRow?.id ?? null,
    device_key: null,
    created_at: new Date(),
    updated_at: new Date()
  });
  return { created: true, device };
}

async function main() {
  const args = parseArgs(process.argv);
  const filePath = path.resolve(args.file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }

  defineAssociations();
  await sequelize.authenticate();

  const rows = parseCsv(fs.readFileSync(filePath, 'utf8'));
  console.log(`读取 ${rows.length} 行: ${filePath}`);
  console.log(`模式: ${args.dryRun ? 'dry-run' : '写入'}${args.ensureModels ? ' + ensure-models' : ''}${args.replaceKeys ? ' + replace-keys' : ''}`);

  const errors = [];
  for (const row of rows) {
    if (!DEVICE_ID_RE.test(row.device_id || '')) {
      errors.push(`行 ${row.__line}: 非法 device_id=${row.device_id}`);
    }
    if ((row.key_value || '').trim() && !MAC_RE.test(row.key_value.trim())) {
      errors.push(`行 ${row.__line}: 非法 key_value=${row.key_value}`);
    }
  }
  if (errors.length) {
    console.error('校验失败:');
    errors.slice(0, 20).forEach((e) => console.error(' -', e));
    process.exitCode = 1;
    await sequelize.close();
    return;
  }

  const { plans, warnings } = prepareDeviceKeyPlan(rows);
  warnings.forEach((w) => console.warn('⚠', w));

  let deviceCreated = 0;
  let deviceUpdated = 0;
  let keysCreated = 0;
  let keysSkipped = 0;
  let devicesKeyFailed = 0;

  for (const plan of plans) {
    try {
      const { created } = await upsertDevice(plan, args);
      if (created) deviceCreated += 1;
      else deviceUpdated += 1;

      if (plan.overlapError) {
        console.error('✖', plan.overlapError);
        devicesKeyFailed += 1;
        keysSkipped += plan.keys.length;
        continue;
      }

      if (!args.dryRun && args.replaceKeys) {
        await DeviceKey.destroy({ where: { device_id: plan.device_id } });
      }

      for (const key of plan.keys) {
        if (args.dryRun) {
          keysCreated += 1;
          continue;
        }

        if (!args.replaceKeys) {
          const existed = await DeviceKey.findOne({
            where: {
              device_id: plan.device_id,
              key_value: key.key_value,
              valid_from_date: key.valid_from_date
            }
          });
          if (existed) {
            keysSkipped += 1;
            continue;
          }
        }

        await addDeviceKey(
          plan.device_id,
          key.key_value,
          key.valid_from_date,
          key.valid_to_date,
          'imported from csv',
          0,
          null
        );
        keysCreated += 1;
      }
    } catch (e) {
      console.error(`✖ 设备 ${plan.device_id} 失败:`, e.message);
      devicesKeyFailed += 1;
    }
  }

  console.log('\n=== 导入结果 ===');
  console.log(`设备: 新建 ${deviceCreated}, 更新 ${deviceUpdated}, 计划 ${plans.length}`);
  console.log(`密钥: 写入/将写入 ${keysCreated}, 跳过 ${keysSkipped}, 密钥失败设备 ${devicesKeyFailed}`);
  if (args.dryRun) {
    console.log('（dry-run 未实际写库）');
  }

  await sequelize.close();
  if (devicesKeyFailed > 0) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error(err);
  try { await sequelize.close(); } catch (_) { /* ignore */ }
  process.exit(1);
});
