const Device = require('../models/device');
const DeviceModelDict = require('../models/device_model_dict');
const DeviceSeriesDict = require('../models/device_series_dict');

function parseSeriesId(value) {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
}

/**
 * Validate device_model against series and upsert devices.series_id / device_model.
 * Used by log upload and motion-data upload so parsing can rely on devices.series_id.
 */
async function ensureDeviceModelAndSeries({
  deviceId,
  deviceModel,
  seriesId,
  required = true
} = {}) {
  const normalizedDeviceId = String(deviceId || '').trim();
  if (!normalizedDeviceId || normalizedDeviceId === '0000-00') {
    return { ok: true, skipped: true };
  }

  const normalizedModel = String(deviceModel || '').trim();
  const resolvedSeriesId = parseSeriesId(seriesId);

  if (!normalizedModel) {
    if (!required) return { ok: true, skipped: true };
    const err = new Error('device_model 为必填');
    err.statusCode = 400;
    throw err;
  }

  if (!resolvedSeriesId) {
    const err = new Error('series_id 必须为正整数');
    err.statusCode = 400;
    throw err;
  }

  const series = await DeviceSeriesDict.findByPk(resolvedSeriesId);
  if (!series) {
    const err = new Error('series_id 无效');
    err.statusCode = 400;
    throw err;
  }

  const matchedModel = await DeviceModelDict.findOne({
    where: {
      device_model: normalizedModel,
      series_id: resolvedSeriesId,
      is_active: true
    }
  });
  if (!matchedModel) {
    const err = new Error('所选设备型号不属于当前设备系列');
    err.statusCode = 400;
    throw err;
  }

  const existing = await Device.findOne({ where: { device_id: normalizedDeviceId } });
  if (existing) {
    const existingSeriesId = parseSeriesId(existing.series_id);
    if (existingSeriesId && existingSeriesId !== resolvedSeriesId) {
      const err = new Error(
        `设备 ${normalizedDeviceId} 已绑定系列 ${existingSeriesId}，与当前系列 ${resolvedSeriesId} 冲突`
      );
      err.statusCode = 409;
      throw err;
    }

    const updates = { updated_at: new Date() };
    if (!existingSeriesId) updates.series_id = resolvedSeriesId;
    if (!existing.device_model || existing.device_model !== normalizedModel) {
      updates.device_model = normalizedModel;
    }
    if (Object.keys(updates).length > 1) {
      await existing.update(updates);
    }
    return {
      ok: true,
      created: false,
      device: existing,
      series_id: parseSeriesId(existing.series_id) || resolvedSeriesId,
      device_model: normalizedModel
    };
  }

  const created = await Device.create({
    device_id: normalizedDeviceId,
    device_model: normalizedModel,
    series_id: resolvedSeriesId,
    device_key: null,
    created_at: new Date(),
    updated_at: new Date()
  });

  return {
    ok: true,
    created: true,
    device: created,
    series_id: resolvedSeriesId,
    device_model: normalizedModel
  };
}

module.exports = {
  parseSeriesId,
  ensureDeviceModelAndSeries
};
